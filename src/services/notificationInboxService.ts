import { isSupabaseDataEnabled, supabase } from './supabase';

export type InboxDecisionStatus = 'pending' | 'approved' | 'rejected' | 'info';

export type InboxNotificationRecord = {
  id: string;
  eventType: string;
  title: string;
  body: string;
  decisionStatus: InboxDecisionStatus;
  decisionNote: string;
  createdAt: string;
  communityId: string | null;
};

export type InboxNotificationPage = {
  rows: InboxNotificationRecord[];
  hasMore: boolean;
};

const PAGE_SIZE_DEFAULT = 20;

function normalizeDecisionStatus(value: any): InboxDecisionStatus {
  const raw = String(value ?? '').toLowerCase();
  if (raw === 'pending' || raw === 'approved' || raw === 'rejected') return raw;
  return 'info';
}

function mapRow(row: any): InboxNotificationRecord {
  return {
    id: String(row.id),
    eventType: String(row.event_type ?? 'info'),
    title: String(row.title ?? ''),
    body: String(row.body ?? ''),
    decisionStatus: normalizeDecisionStatus(row.decision_status),
    decisionNote: String(row.decision_note ?? ''),
    createdAt: String(row.created_at ?? ''),
    communityId: row.community_id ? String(row.community_id) : null,
  };
}

export async function getInboxNotificationsByEmail(input: {
  email: string;
  offset?: number;
  limit?: number;
}): Promise<InboxNotificationPage> {
  if (!isSupabaseDataEnabled()) {
    return { rows: [], hasMore: false };
  }

  const normalizedEmail = String(input.email ?? '').trim().toLowerCase();
  if (!normalizedEmail) {
    return { rows: [], hasMore: false };
  }

  const offset = Math.max(0, Number(input.offset ?? 0));
  const limit = Math.max(1, Number(input.limit ?? PAGE_SIZE_DEFAULT));

  const { data, error } = await supabase
    .from('push_notification_inbox')
    .select('id, event_type, title, body, decision_status, decision_note, created_at, community_id')
    .eq('recipient_email', normalizedEmail)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    const details = [error.message, error.details, error.hint].filter(Boolean).join(' - ');
    throw new Error(details || 'Bildirimler okunamadı.');
  }

  const rows = (data ?? []).map(mapRow);
  return {
    rows,
    hasMore: rows.length === limit,
  };
}
