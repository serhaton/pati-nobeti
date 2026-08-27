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

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';

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

async function markEvent(eventId: string, status: 'sent' | 'failed', attempts: number, errorText?: string) {
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
    .select('user_id')
    .eq('community_id', communityId)
    .eq('role', 'admin')
    .in('status', ['active', 'approved']);

  if (error) {
    throw new Error(`Admin kullanıcıları okunamadı: ${error.message}`);
  }

  return (data ?? []).map((row: any) => String(row.user_id));
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
    .select('expo_push_token')
    .eq('is_active', true)
    .in('user_id', adminUserIds);

  if (error) {
    throw new Error(`Admin cihaz tokenları okunamadı: ${error.message}`);
  }

  return Array.from(new Set((data ?? []).map((row: any) => String(row.expo_push_token)).filter(Boolean)));
}

async function getUserPushTokens(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_devices')
    .select('expo_push_token')
    .eq('is_active', true)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Kullanıcı cihaz tokenları okunamadı: ${error.message}`);
  }

  return Array.from(new Set((data ?? []).map((row: any) => String(row.expo_push_token)).filter(Boolean)));
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

async function processEvent(event: NotificationEventRow) {
  const attempts = Number(event.delivery_attempts ?? 0) + 1;

  if (event.event_type === 'community_approved') {
    const recipientUserId = String(event.actor_user_id ?? '').trim();
    if (!recipientUserId) {
      await markEvent(event.id, 'failed', attempts, 'No community creator user id found for approved event.');
      return;
    }

    const recipientTokens = await getUserPushTokens(recipientUserId);
    if (recipientTokens.length === 0) {
      await markEvent(event.id, 'failed', attempts, 'No active push token found for community creator.');
      return;
    }

    const { title, body } = await buildNotificationContent(event);
    const messages: ExpoPushMessage[] = recipientTokens.map((token) => ({
      to: token,
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

  const adminTokens = await getAdminPushTokens(adminUserIds);
  if (adminTokens.length === 0) {
    await markEvent(event.id, 'failed', attempts, 'No active push token found for admins.');
    return;
  }

  const { title, body } = await buildNotificationContent(event);
  const messages: ExpoPushMessage[] = adminTokens.map((token) => ({
    to: token,
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

    let eventId: string | null = null;
    try {
      const body = await req.json();
      const rawEventId = String(body?.eventId ?? '').trim();
      eventId = rawEventId || null;
    } catch {
      eventId = null;
    }

    const baseQuery = supabase
      .from('notification_events')
      .select('id, event_type, community_id, source_table, source_id, actor_user_id, payload, delivery_status, delivery_attempts');

    const query = eventId
      ? baseQuery.eq('id', eventId).limit(1)
      : baseQuery.eq('delivery_status', 'pending').order('created_at', { ascending: true }).limit(50);

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
      if (event.delivery_status !== 'pending') {
        skipped += 1;
        continue;
      }

      try {
        await processEvent(event);
      } catch (eventError: any) {
        const attempts = Number(event.delivery_attempts ?? 0) + 1;
        await markEvent(event.id, 'failed', attempts, String(eventError?.message ?? 'Unknown notification error'));
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
