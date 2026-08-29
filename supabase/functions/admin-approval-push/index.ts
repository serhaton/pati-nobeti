import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

type NotificationEventRow = {
  id: string;
  event_type: 'join_request_pending' | 'expense_pending' | 'contribution_pending' | 'community_pending' | 'community_approved';
  community_id: string;
  source_table: string;
  source_id: string;
  actor_user_id?: string | null;
  payload: Record<string, unknown>;
  delivery_status: 'pending' | 'sent' | 'failed';
  delivery_attempts: number;
};

type ExpoPushMessage = {
  to: string;
  sound: 'default';
  title: string;
  body: string;
  data: Record<string, unknown>;
};

type DirectNotificationPayload = {
  recipientUserId: string;
  title: string;
  body: string;
  data?: Record<string, unknown> & {
    decisionStatus?: 'pending' | 'approved' | 'rejected' | 'info';
    decisionNote?: string;
  };
};

type UserPushTarget = {
  userId: string;
  token: string;
};

type PushInboxRecord = {
  recipientUserId: string;
  communityId?: string | null;
  eventType: string;
  title: string;
  body: string;
  decisionStatus: 'pending' | 'approved' | 'rejected' | 'info';
  decisionNote?: string | null;
  sourceTable?: string | null;
  sourceId?: string | null;
  payload?: Record<string, unknown>;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_DELIVERY_ATTEMPTS = 5;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function getActorDisplayName(actorUserId?: string | null): Promise<string | null> {
  const userId = String(actorUserId ?? '').trim();
  if (!userId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, name, username')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('Actor profile could not be read', { userId, message: error.message });
    return null;
  }

  const fullName = String(data?.full_name ?? data?.name ?? data?.username ?? '').trim();
  return fullName || null;
}

async function buildNotificationContent(event: NotificationEventRow): Promise<{ title: string; body: string }> {
  if (event.event_type === 'join_request_pending') {
    const requesterName = String(event.payload?.requesterName ?? 'Bir kullanıcı');
    return {
      title: 'Yeni katılım isteği',
      body: `${requesterName} için onay bekleyen katılım isteği var.`,
    };
  }

  if (event.event_type === 'expense_pending') {
    const title = String(event.payload?.title ?? 'Masraf');
    return {
      title: 'Yeni masraf onayı',
      body: `${title} kaydı yönetici onayı bekliyor.`,
    };
  }

  if (event.event_type === 'community_pending') {
    const communityName = String(event.payload?.communityName ?? 'Yeni topluluk');
    const payloadCreatorName = String(event.payload?.creatorName ?? '').trim();
    const creatorName = payloadCreatorName || await getActorDisplayName(event.actor_user_id) || 'Bir kullanıcı';
    return {
      title: 'Yeni topluluk onayı',
      body: `${creatorName} tarafından oluşturulan ${communityName} kaydı sistem yönetici onayı bekliyor.`,
    };
  }

  if (event.event_type === 'community_approved') {
    const communityName = String(event.payload?.communityName ?? 'Topluluğunuz');
    return {
      title: 'Topluluğunuz onaylandı',
      body: `${communityName} artık aktif. Uygulamadan giriş yapabilirsiniz.`,
    };
  }

  return {
    title: 'Yeni Pati Uzat onayı',
    body: 'Yeni bir Pati Uzat kaydı yönetici onayı bekliyor.',
  };
}

async function markEvent(eventId: string, status: 'pending' | 'sent' | 'failed', attempts: number, errorText?: string) {
  const { error } = await supabase
    .from('notification_events')
    .update({
      delivery_status: status,
      delivery_attempts: attempts,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
      last_error: errorText ?? null,
    })
    .eq('id', eventId);

  if (error) {
    console.error('Failed to update notification event status', eventId, error.message);
  }
}

async function getAdminUserIds(communityId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('community_members')
    .select('user_id, profiles!inner(id, status)')
    .eq('community_id', communityId)
    .eq('role', 'admin')
    .in('status', ['active', 'approved'])
    .eq('profiles.status', 'active');

  if (error) {
    throw new Error(`Admin kullanıcıları okunamadı: ${error.message}`);
  }

  return (data ?? []).map((row: any) => String(row.user_id));
}

async function claimEventForProcessing(event: NotificationEventRow): Promise<{ claimed: boolean; attempts: number }> {
  const currentAttempts = Number(event.delivery_attempts ?? 0);

  const { data, error } = await supabase
    .from('notification_events')
    .update({
      delivery_attempts: currentAttempts + 1,
      last_error: null,
    })
    .eq('id', event.id)
    .eq('delivery_attempts', currentAttempts)
    .in('delivery_status', ['pending', 'failed'])
    .select('id')
    .maybeSingle();

  if (error) {
    throw new Error(`Event claim failed: ${error.message}`);
  }

  return {
    claimed: Boolean(data?.id),
    attempts: currentAttempts + 1,
  };
}

async function getAppAdminUserIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('is_app_admin', true)
    .eq('status', 'active');

  if (error) {
    throw new Error(`Sistem yöneticileri okunamadı: ${error.message}`);
  }

  return (data ?? []).map((row: any) => String(row.id));
}

async function getAdminPushTokens(adminUserIds: string[]): Promise<string[]> {
  if (adminUserIds.length === 0) return [];

  const { data, error } = await supabase
    .from('user_devices')
    .select('user_id, expo_push_token, last_seen_at')
    .eq('is_active', true)
    .in('user_id', adminUserIds)
    .order('last_seen_at', { ascending: false });

  if (error) {
    throw new Error(`Admin cihaz tokenları okunamadı: ${error.message}`);
  }

  const latestTokenByUser = new Map<string, string>();
  for (const row of data ?? []) {
    const userId = String((row as any).user_id ?? '').trim();
    const token = String((row as any).expo_push_token ?? '').trim();
    if (!userId || !token) continue;
    if (!latestTokenByUser.has(userId)) {
      latestTokenByUser.set(userId, token);
    }
  }

  return Array.from(new Set(Array.from(latestTokenByUser.values())));
}

async function getAdminPushTargets(adminUserIds: string[]): Promise<UserPushTarget[]> {
  if (adminUserIds.length === 0) return [];

  const { data, error } = await supabase
    .from('user_devices')
    .select('user_id, expo_push_token, last_seen_at')
    .eq('is_active', true)
    .in('user_id', adminUserIds)
    .order('last_seen_at', { ascending: false });

  if (error) {
    throw new Error(`Admin cihaz tokenları okunamadı: ${error.message}`);
  }

  const latestByUser = new Map<string, string>();
  for (const row of data ?? []) {
    const userId = String((row as any).user_id ?? '').trim();
    const token = String((row as any).expo_push_token ?? '').trim();
    if (!userId || !token) continue;
    if (!latestByUser.has(userId)) {
      latestByUser.set(userId, token);
    }
  }

  return Array.from(latestByUser.entries()).map(([userId, token]) => ({ userId, token }));
}

async function getUserPushTokens(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_devices')
    .select('expo_push_token')
    .eq('is_active', true)
    .eq('user_id', userId)
    .order('last_seen_at', { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Kullanıcı cihaz tokenları okunamadı: ${error.message}`);
  }

  return Array.from(new Set((data ?? []).map((row: any) => String(row.expo_push_token)).filter(Boolean)));
}

async function getUserPushTargets(userId: string): Promise<UserPushTarget[]> {
  const tokens = await getUserPushTokens(userId);
  return tokens.map((token) => ({ userId, token }));
}

function inferDecisionStatusFromEventType(eventType: string): 'pending' | 'approved' | 'rejected' | 'info' {
  if (eventType === 'community_approved') return 'approved';
  if (eventType.endsWith('_pending')) return 'pending';
  if (eventType.endsWith('_rejected')) return 'rejected';
  return 'info';
}

async function insertPushInboxRecords(records: PushInboxRecord[]): Promise<void> {
  if (records.length === 0) return;

  try {
    const userIds = Array.from(new Set(records.map((item) => item.recipientUserId)));
    const { data: profileRows, error: profileError } = await supabase
      .from('profiles')
      .select('id, email')
      .in('id', userIds);

    if (profileError) {
      console.error('Failed to read profile emails for push inbox', profileError.message);
      return;
    }

    const emailByUserId = new Map<string, string>();
    for (const row of profileRows ?? []) {
      const id = String((row as any).id ?? '').trim();
      const email = String((row as any).email ?? '').trim().toLowerCase();
      if (id && email) {
        emailByUserId.set(id, email);
      }
    }

    const rowsToInsert = records
      .map((item) => {
        const recipientEmail = emailByUserId.get(item.recipientUserId);
        if (!recipientEmail) return null;

        return {
          recipient_user_id: item.recipientUserId,
          recipient_email: recipientEmail,
          community_id: item.communityId ?? null,
          event_type: item.eventType,
          title: item.title,
          body: item.body,
          decision_status: item.decisionStatus,
          decision_note: item.decisionNote ?? null,
          source_table: item.sourceTable ?? null,
          source_id: item.sourceId ?? null,
          payload: item.payload ?? {},
        };
      })
      .filter(Boolean) as any[];

    if (rowsToInsert.length === 0) return;

    const { error: insertError } = await supabase
      .from('push_notification_inbox')
      .insert(rowsToInsert);

    if (insertError) {
      console.error('Failed to insert push inbox rows', insertError.message);
    }
  } catch (error: any) {
    console.error('push inbox logging failed', error?.message ?? String(error));
  }
}

async function sendExpoPush(messages: ExpoPushMessage[]): Promise<void> {
  if (messages.length === 0) return;

  const response = await fetch(EXPO_PUSH_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(messages),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Expo push request failed (${response.status}): ${body}`);
  }

  const payload = await response.json();
  const hasErrors = Array.isArray(payload?.data) && payload.data.some((item: any) => item?.status === 'error');

  if (hasErrors) {
    throw new Error('Expo push response contains errors.');
  }
}

async function sendDirectNotification(payload: DirectNotificationPayload): Promise<{ sent: boolean; tokenCount: number }> {
  const recipientUserId = String(payload.recipientUserId ?? '').trim();
  const title = String(payload.title ?? '').trim();
  const body = String(payload.body ?? '').trim();
  if (!recipientUserId || !title || !body) {
    throw new Error('Direct notification requires recipientUserId, title and body.');
  }

  const targets = await getUserPushTargets(recipientUserId);
  if (targets.length === 0) {
    return { sent: false, tokenCount: 0 };
  }

  const messages: ExpoPushMessage[] = targets.map((target) => ({
    to: target.token,
    sound: 'default',
    title,
    body,
    data: payload.data ?? {},
  }));

  await sendExpoPush(messages);

  const decisionStatus = payload.data?.decisionStatus ?? inferDecisionStatusFromEventType(String(payload.data?.eventType ?? 'direct_info'));
  const decisionNote = String(payload.data?.decisionNote ?? '').trim() || null;
  await insertPushInboxRecords([
    {
      recipientUserId,
      eventType: String(payload.data?.eventType ?? 'direct_info'),
      title,
      body,
      decisionStatus,
      decisionNote,
      communityId: payload.data?.communityId ? String(payload.data.communityId) : null,
      sourceTable: payload.data?.sourceTable ? String(payload.data.sourceTable) : null,
      sourceId: payload.data?.sourceId ? String(payload.data.sourceId) : null,
      payload: payload.data ?? {},
    },
  ]);

  return { sent: true, tokenCount: targets.length };
}

async function processEvent(event: NotificationEventRow, attempts: number) {

  if (event.event_type === 'community_approved') {
    const recipientUserId = String(event.actor_user_id ?? '').trim();
    if (!recipientUserId) {
      await markEvent(event.id, 'failed', attempts, 'No community creator user id found for approved event.');
      return;
    }

    const recipientTargets = await getUserPushTargets(recipientUserId);
    if (recipientTargets.length === 0) {
      await markEvent(event.id, 'failed', attempts, 'No active push token found for community creator.');
      return;
    }

    const { title, body } = await buildNotificationContent(event);
    const messages: ExpoPushMessage[] = recipientTargets.map((target) => ({
      to: target.token,
      sound: 'default',
      title,
      body,
      data: {
        screen: 'community-select',
        communityId: event.community_id,
        eventType: event.event_type,
        sourceTable: event.source_table,
        sourceId: event.source_id,
      },
    }));

    await sendExpoPush(messages);
    await insertPushInboxRecords([
      {
        recipientUserId,
        communityId: event.community_id,
        eventType: event.event_type,
        title,
        body,
        decisionStatus: inferDecisionStatusFromEventType(event.event_type),
        decisionNote: null,
        sourceTable: event.source_table,
        sourceId: event.source_id,
        payload: event.payload,
      },
    ]);
    await markEvent(event.id, 'sent', attempts);
    return;
  }

  const adminUserIds = event.event_type === 'community_pending'
    ? await getAppAdminUserIds()
    : await getAdminUserIds(event.community_id);
  if (adminUserIds.length === 0) {
    await markEvent(
      event.id,
      'failed',
      attempts,
      event.event_type === 'community_pending'
        ? 'No active system admin found.'
        : 'No active admin found for community.'
    );
    return;
  }

  const adminTargets = await getAdminPushTargets(adminUserIds);
  if (adminTargets.length === 0) {
    await markEvent(event.id, 'failed', attempts, 'No active push token found for admins.');
    return;
  }

  const { title, body } = await buildNotificationContent(event);
  const messages: ExpoPushMessage[] = adminTargets.map((target) => ({
    to: target.token,
    sound: 'default',
    title,
    body,
    data: {
      screen: event.event_type === 'community_pending' ? 'community-admin-approvals' : 'community',
      communityId: event.community_id,
      eventType: event.event_type,
      sourceTable: event.source_table,
      sourceId: event.source_id,
    },
  }));

  await sendExpoPush(messages);
  await insertPushInboxRecords(
    adminTargets.map((target) => ({
      recipientUserId: target.userId,
      communityId: event.community_id,
      eventType: event.event_type,
      title,
      body,
      decisionStatus: inferDecisionStatusFromEventType(event.event_type),
      decisionNote: event.event_type === 'join_request_pending' ? String(event.payload?.note ?? '').trim() || null : null,
      sourceTable: event.source_table,
      sourceId: event.source_id,
      payload: event.payload,
    }))
  );
  await markEvent(event.id, 'sent', attempts);
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let requestBody: Record<string, unknown> = {};
    let eventId: string | null = null;
    try {
      requestBody = await req.json();
      const rawEventId = String(requestBody?.eventId ?? '').trim();
      eventId = rawEventId || null;
    } catch {
      requestBody = {};
      eventId = null;
    }

    const directNotificationRaw = requestBody?.directNotification;
    if (directNotificationRaw && typeof directNotificationRaw === 'object') {
      const directNotification = directNotificationRaw as DirectNotificationPayload;
      const result = await sendDirectNotification(directNotification);

      return new Response(JSON.stringify({
        ok: true,
        direct: true,
        sent: result.sent,
        tokenCount: result.tokenCount,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const baseQuery = supabase
      .from('notification_events')
      .select('id, event_type, community_id, source_table, source_id, actor_user_id, payload, delivery_status, delivery_attempts');

    const query = eventId
      ? baseQuery.eq('id', eventId).limit(1)
      : baseQuery
        .or('delivery_status.eq.pending,delivery_status.eq.failed')
        .lt('delivery_attempts', MAX_DELIVERY_ATTEMPTS)
        .order('created_at', { ascending: true })
        .limit(50);

    const { data, error } = await query;

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const events = (data ?? []) as NotificationEventRow[];

    let skipped = 0;

    for (const event of events) {
      if (event.delivery_status === 'sent') {
        skipped += 1;
        continue;
      }

      const attempts = Number(event.delivery_attempts ?? 0);
      if (attempts >= MAX_DELIVERY_ATTEMPTS) {
        skipped += 1;
        continue;
      }

      try {
        const claim = await claimEventForProcessing(event);
        if (!claim.claimed) {
          skipped += 1;
          continue;
        }

        await processEvent(event, claim.attempts);
      } catch (eventError: any) {
        const fallbackAttempts = Number(event.delivery_attempts ?? 0) + 1;
        await markEvent(event.id, 'failed', fallbackAttempts, String(eventError?.message ?? 'Unknown notification error'));
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: events.length - skipped, skipped }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ ok: false, error: String(error?.message ?? error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
