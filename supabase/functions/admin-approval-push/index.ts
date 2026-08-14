import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

type NotificationEventRow = {
  id: string;
  event_type: 'join_request_pending' | 'expense_pending' | 'contribution_pending';
  community_id: string;
  source_table: string;
  source_id: string;
  payload: Record<string, unknown>;
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

function buildNotificationContent(event: NotificationEventRow): { title: string; body: string } {
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

  const adminUserIds = await getAdminUserIds(event.community_id);
  if (adminUserIds.length === 0) {
    await markEvent(event.id, 'failed', attempts, 'No active admin found for community.');
    return;
  }

  const adminTokens = await getAdminPushTokens(adminUserIds);
  if (adminTokens.length === 0) {
    await markEvent(event.id, 'failed', attempts, 'No active push token found for admins.');
    return;
  }

  const { title, body } = buildNotificationContent(event);
  const messages: ExpoPushMessage[] = adminTokens.map((token) => ({
    to: token,
    sound: 'default',
    title,
    body,
    data: {
      screen: 'community',
      communityId: event.community_id,
      eventType: event.event_type,
      sourceTable: event.source_table,
      sourceId: event.source_id,
    },
  }));

  await sendExpoPush(messages);
  await markEvent(event.id, 'sent', attempts);
}

Deno.serve(async () => {
  try {
    const { data, error } = await supabase
      .from('notification_events')
      .select('id, event_type, community_id, source_table, source_id, payload, delivery_attempts')
      .eq('delivery_status', 'pending')
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const events = (data ?? []) as NotificationEventRow[];

    for (const event of events) {
      try {
        await processEvent(event);
      } catch (eventError: any) {
        const attempts = Number(event.delivery_attempts ?? 0) + 1;
        await markEvent(event.id, 'failed', attempts, String(eventError?.message ?? 'Unknown notification error'));
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: events.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ ok: false, error: String(error?.message ?? error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
