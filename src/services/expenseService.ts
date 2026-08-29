import { expenses as mockExpenses } from '../data/mock';
import { isSupabaseDataEnabled, supabase } from './supabase';
import { NOT_SPECIFIED_LABEL } from '../constants/userLabels';

export type ExpenseType = 'mama' | 'veteriner' | 'diger';
export type ExpenseApprovalStatus = 'pending' | 'approved' | 'rejected';

export type ExpenseRecord = {
  id: string;
  communityId: string;
  title: string;
  type: ExpenseType;
  vendorName: string;
  communityVeterinarianId: string | null;
  expenseAt: string;
  amount: number;
  dueAmount: number;
  note: string;
  receiptUrl: string;
  receiptUrls: string[];
  approvalStatus: ExpenseApprovalStatus;
  submittedBy: string | null;
  actionedBy: string | null;
  actionedAt: string | null;
  createdAt: string;
};

export type ExpenseAllocationSummary = {
  expenseId: string;
  allocationCount: number;
  allocatedTotal: number;
};

function toNumber(value: any): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function toIso(value: any, fallbackIso: string): string {
  if (!value) return fallbackIso;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallbackIso;
  return parsed.toISOString();
}

function formatError(error: any, fallback: string): Error {
  const details = [error?.message, error?.details, error?.hint].filter(Boolean).join(' - ');
  return new Error(details || fallback);
}

async function sendDirectNotificationToUser(input: {
  recipientUserId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  if (!isSupabaseDataEnabled()) return;

  const recipientUserId = String(input.recipientUserId ?? '').trim();
  const title = String(input.title ?? '').trim();
  const body = String(input.body ?? '').trim();
  if (!recipientUserId || !title || !body) return;

  try {
    await supabase.functions.invoke('admin-approval-push', {
      body: {
        directNotification: {
          recipientUserId,
          title,
          body,
          data: input.data ?? {},
        },
      },
    });
  } catch (error: any) {
    console.warn('[expense][direct-notification:failed]', {
      recipientUserId,
      message: error?.message ?? null,
    });
  }
}

function normalizeType(row: any): ExpenseType {
  const raw = String(row.expense_type ?? row.category ?? '').toLowerCase();
  if (raw === 'vet' || raw === 'veteriner') return 'veteriner';
  if (raw === 'other' || raw === 'diger') return 'diger';
  return 'mama';
}

function normalizeStatus(row: any): ExpenseApprovalStatus {
  const raw = String(row.approval_status ?? 'approved').toLowerCase();
  if (raw === 'pending' || raw === 'rejected') return raw;
  return 'approved';
}

function parseReceiptUrls(row: any): string[] {
  const raw = row.receipt_urls;
  if (Array.isArray(raw)) {
    return raw
      .map((item) => String(item ?? '').trim())
      .filter((item) => item.length > 0);
  }

  const single = String(row.receipt_url ?? '').trim();
  return single ? [single] : [];
}

function mapRow(row: any): ExpenseRecord {
  const createdAt = toIso(row.created_at, new Date().toISOString());
  const receiptUrls = parseReceiptUrls(row);
  const primaryReceiptUrl = receiptUrls[0] ?? String(row.receipt_url ?? '');

  return {
    id: String(row.id),
    communityId: String(row.community_id),
    title: String(row.title ?? 'Masraf'),
    type: normalizeType(row),
    vendorName: String(row.vendor_text ?? row.vendor ?? NOT_SPECIFIED_LABEL),
    communityVeterinarianId: row.community_veterinarian_id ? String(row.community_veterinarian_id) : null,
    expenseAt: toIso(row.expense_at, createdAt),
    amount: toNumber(row.amount),
    dueAmount: toNumber(row.due_amount ?? row.amount),
    note: String(row.note ?? ''),
    receiptUrl: primaryReceiptUrl,
    receiptUrls,
    approvalStatus: normalizeStatus(row),
    submittedBy: row.submitted_by ? String(row.submitted_by) : null,
    actionedBy: row.actioned_by ? String(row.actioned_by) : null,
    actionedAt: row.actioned_at ? toIso(row.actioned_at, createdAt) : null,
    createdAt,
  };
}

let mockExpenseRecords: ExpenseRecord[] = mockExpenses.map((item) => {
  const nowIso = new Date().toISOString();
  const normalizedType: ExpenseType = item.category.toLowerCase().includes('veteriner') ? 'veteriner' : 'mama';

  return {
    id: item.id,
    communityId: item.communityId,
    title: item.title,
    type: normalizedType,
    vendorName: item.vendor,
    communityVeterinarianId: null,
    expenseAt: nowIso,
    amount: Number(item.amount),
    dueAmount: Number(item.amount - item.paid),
    note: '',
    receiptUrl: 'mock://receipt',
    receiptUrls: ['mock://receipt'],
    approvalStatus: 'approved',
    submittedBy: null,
    actionedBy: null,
    actionedAt: nowIso,
    createdAt: nowIso,
  };
});

export async function getApprovedExpensesByCommunity(communityId: string): Promise<ExpenseRecord[]> {
  if (!isSupabaseDataEnabled()) {
    return mockExpenseRecords
      .filter((item) => item.communityId === communityId && item.approvalStatus === 'approved')
      .sort((left, right) => right.expenseAt.localeCompare(left.expenseAt));
  }

  const { data, error } = await supabase
    .from('expenses')
    .select('id, community_id, title, category, expense_type, community_veterinarian_id, vendor, vendor_text, expense_at, amount, due_amount, note, receipt_url, receipt_urls, approval_status, submitted_by, actioned_by, actioned_at, created_at')
    .eq('community_id', communityId)
    .eq('approval_status', 'approved')
    .order('expense_at', { ascending: false });

  if (error) {
    throw formatError(error, 'Onaylı masraflar okunamadı.');
  }

  return (data ?? []).map(mapRow);
}

export async function getExpensesByCommunity(communityId: string): Promise<ExpenseRecord[]> {
  if (!isSupabaseDataEnabled()) {
    return mockExpenseRecords
      .filter((item) => item.communityId === communityId)
      .sort((left, right) => right.expenseAt.localeCompare(left.expenseAt));
  }

  const { data, error } = await supabase
    .from('expenses')
    .select('id, community_id, title, category, expense_type, community_veterinarian_id, vendor, vendor_text, expense_at, amount, due_amount, note, receipt_url, receipt_urls, approval_status, submitted_by, actioned_by, actioned_at, created_at')
    .eq('community_id', communityId)
    .order('expense_at', { ascending: false });

  if (error) {
    throw formatError(error, 'Masraflar okunamadı.');
  }

  return (data ?? []).map(mapRow);
}

export async function getExpensesBySubmitter(input: {
  communityId: string;
  submitterUserId: string;
}): Promise<ExpenseRecord[]> {
  if (!isSupabaseDataEnabled()) {
    return mockExpenseRecords
      .filter((item) => item.communityId === input.communityId && item.submittedBy === input.submitterUserId)
      .sort((left, right) => right.expenseAt.localeCompare(left.expenseAt));
  }

  const { data, error } = await supabase
    .from('expenses')
    .select('id, community_id, title, category, expense_type, community_veterinarian_id, vendor, vendor_text, expense_at, amount, due_amount, note, receipt_url, receipt_urls, approval_status, submitted_by, actioned_by, actioned_at, created_at')
    .eq('community_id', input.communityId)
    .eq('submitted_by', input.submitterUserId)
    .order('expense_at', { ascending: false });

  if (error) {
    throw formatError(error, 'Masraf geçmişi okunamadı.');
  }

  return (data ?? []).map(mapRow);
}

export async function getPendingExpensesForCommunity(communityId: string): Promise<ExpenseRecord[]> {
  if (!isSupabaseDataEnabled()) {
    return mockExpenseRecords
      .filter((item) => item.communityId === communityId && item.approvalStatus === 'pending')
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  const { data, error } = await supabase
    .from('expenses')
    .select('id, community_id, title, category, expense_type, community_veterinarian_id, vendor, vendor_text, expense_at, amount, due_amount, note, receipt_url, receipt_urls, approval_status, submitted_by, actioned_by, actioned_at, created_at')
    .eq('community_id', communityId)
    .eq('approval_status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    throw formatError(error, 'Bekleyen masraflar okunamadı.');
  }

  return (data ?? []).map(mapRow);
}

export async function createExpense(input: {
  communityId: string;
  submittedBy: string;
  performedByUserId?: string;
  isCommunityAdmin: boolean;
  title: string;
  type: ExpenseType;
  amount: number;
  expenseAtIso: string;
  note?: string;
  receiptUrls: string[];
  vendorName: string;
  communityVeterinarianId?: string | null;
}): Promise<ExpenseRecord> {
  const nowIso = new Date().toISOString();
  const approvalStatus: ExpenseApprovalStatus = input.isCommunityAdmin ? 'approved' : 'pending';
  const normalizedAmount = roundMoney(input.amount);
  const normalizedReceiptUrls = input.receiptUrls.map((item) => item.trim()).filter(Boolean);
  const primaryReceiptUrl = normalizedReceiptUrls[0] ?? '';
  const effectiveSubmittedBy = (input.performedByUserId ?? input.submittedBy).trim() || input.submittedBy;

  if (!isSupabaseDataEnabled()) {
    const record: ExpenseRecord = {
      id: `expense-${Date.now()}`,
      communityId: input.communityId,
      title: input.title,
      type: input.type,
      vendorName: input.vendorName,
      communityVeterinarianId: input.communityVeterinarianId ?? null,
      expenseAt: input.expenseAtIso,
      amount: normalizedAmount,
      dueAmount: normalizedAmount,
      note: String(input.note ?? '').trim(),
      receiptUrl: primaryReceiptUrl,
      receiptUrls: normalizedReceiptUrls,
      approvalStatus,
      submittedBy: effectiveSubmittedBy,
      actionedBy: input.isCommunityAdmin ? input.submittedBy : null,
      actionedAt: input.isCommunityAdmin ? nowIso : null,
      createdAt: nowIso,
    };

    mockExpenseRecords = [record, ...mockExpenseRecords];
    return record;
  }

  const { data, error } = await supabase
    .from('expenses')
    .insert({
      community_id: input.communityId,
      submitted_by: effectiveSubmittedBy,
      submitted_at: nowIso,
      title: input.title,
      category: input.type === 'veteriner' ? 'Veteriner' : input.type === 'diger' ? 'Diger' : 'Mama',
      expense_type: input.type,
      amount: normalizedAmount,
      due_amount: normalizedAmount,
      expense_at: input.expenseAtIso,
      note: String(input.note ?? '').trim() || null,
      receipt_url: primaryReceiptUrl || null,
      receipt_urls: normalizedReceiptUrls,
      vendor: input.vendorName,
      vendor_text: input.vendorName,
      community_veterinarian_id: input.communityVeterinarianId ?? null,
      approval_status: approvalStatus,
      actioned_by: input.isCommunityAdmin ? input.submittedBy : null,
      actioned_at: input.isCommunityAdmin ? nowIso : null,
      paid_by: effectiveSubmittedBy,
    })
    .select('id, community_id, title, category, expense_type, community_veterinarian_id, vendor, vendor_text, expense_at, amount, due_amount, note, receipt_url, receipt_urls, approval_status, submitted_by, actioned_by, actioned_at, created_at')
    .single();

  if (error) {
    throw formatError(error, 'Masraf kaydı oluşturulamadı.');
  }

  if (approvalStatus === 'pending') {
    try {
      await supabase.functions.invoke('admin-approval-push', {
        body: {},
      });
    } catch (dispatchError: any) {
      console.warn('[expense:create][notify-dispatch-fallback:failed]', {
        communityId: input.communityId,
        message: dispatchError?.message ?? null,
      });
    }
  }

  return mapRow(data);
}

export async function updateExpense(input: {
  expenseId: string;
  communityId: string;
  title: string;
  type: ExpenseType;
  amount: number;
  expenseAtIso: string;
  note?: string;
  receiptUrls: string[];
  vendorName: string;
  communityVeterinarianId?: string | null;
  performedByUserId: string;
}): Promise<{ expense: ExpenseRecord; clearedAllocationCount: number }> {
  const normalizedAmount = roundMoney(input.amount);
  const normalizedReceiptUrls = input.receiptUrls.map((item) => item.trim()).filter(Boolean);
  const primaryReceiptUrl = normalizedReceiptUrls[0] ?? '';

  if (!isSupabaseDataEnabled()) {
    const index = mockExpenseRecords.findIndex((item) => item.id === input.expenseId && item.communityId === input.communityId);
    if (index < 0) {
      throw new Error('Masraf kaydı bulunamadı.');
    }

    const existing = mockExpenseRecords[index];
    const updated: ExpenseRecord = {
      ...existing,
      title: input.title,
      type: input.type,
      amount: normalizedAmount,
      dueAmount: normalizedAmount,
      expenseAt: input.expenseAtIso,
      note: String(input.note ?? '').trim(),
      receiptUrl: primaryReceiptUrl,
      receiptUrls: normalizedReceiptUrls,
      vendorName: input.vendorName,
      communityVeterinarianId: input.communityVeterinarianId ?? null,
      submittedBy: input.performedByUserId,
    };

    mockExpenseRecords[index] = updated;
    return { expense: updated, clearedAllocationCount: 0 };
  }

  const { data: allocationRows, error: allocationReadError } = await supabase
    .from('contribution_allocations')
    .select('id')
    .eq('community_id', input.communityId)
    .eq('expense_id', input.expenseId);

  if (allocationReadError) {
    throw formatError(allocationReadError, 'Masrafa bağlı dağıtımlar okunamadı.');
  }

  const clearedAllocationCount = (allocationRows ?? []).length;

  if (clearedAllocationCount > 0) {
    const { error: allocationDeleteError } = await supabase
      .from('contribution_allocations')
      .delete()
      .eq('community_id', input.communityId)
      .eq('expense_id', input.expenseId);

    if (allocationDeleteError) {
      throw formatError(allocationDeleteError, 'Masrafa bağlı dağıtımlar temizlenemedi.');
    }
  }

  const { data, error } = await supabase
    .from('expenses')
    .update({
      title: input.title,
      category: input.type === 'veteriner' ? 'Veteriner' : input.type === 'diger' ? 'Diger' : 'Mama',
      expense_type: input.type,
      amount: normalizedAmount,
      due_amount: normalizedAmount,
      expense_at: input.expenseAtIso,
      note: String(input.note ?? '').trim() || null,
      receipt_url: primaryReceiptUrl || null,
      receipt_urls: normalizedReceiptUrls,
      vendor: input.vendorName,
      vendor_text: input.vendorName,
      community_veterinarian_id: input.communityVeterinarianId ?? null,
      submitted_by: input.performedByUserId,
      paid_by: input.performedByUserId,
    })
    .eq('id', input.expenseId)
    .eq('community_id', input.communityId)
    .select('id, community_id, title, category, expense_type, community_veterinarian_id, vendor, vendor_text, expense_at, amount, due_amount, note, receipt_url, receipt_urls, approval_status, submitted_by, actioned_by, actioned_at, created_at')
    .single();

  if (error) {
    throw formatError(error, 'Masraf kaydı güncellenemedi.');
  }

  return { expense: mapRow(data), clearedAllocationCount };
}

export async function getExpenseAllocationSummaries(input: {
  communityId: string;
  expenseIds: string[];
}): Promise<Map<string, ExpenseAllocationSummary>> {
  const summaries = new Map<string, ExpenseAllocationSummary>();
  const uniqueExpenseIds = Array.from(new Set(input.expenseIds.map((item) => item.trim()).filter(Boolean)));

  uniqueExpenseIds.forEach((expenseId) => {
    summaries.set(expenseId, {
      expenseId,
      allocationCount: 0,
      allocatedTotal: 0,
    });
  });

  if (uniqueExpenseIds.length === 0 || !isSupabaseDataEnabled()) {
    return summaries;
  }

  const { data, error } = await supabase
    .from('contribution_allocations')
    .select('expense_id, amount')
    .eq('community_id', input.communityId)
    .in('expense_id', uniqueExpenseIds);

  if (error) {
    throw formatError(error, 'Masraf dağıtım özetleri okunamadı.');
  }

  for (const row of data ?? []) {
    const expenseId = String(row.expense_id);
    const existing = summaries.get(expenseId) ?? {
      expenseId,
      allocationCount: 0,
      allocatedTotal: 0,
    };

    summaries.set(expenseId, {
      expenseId,
      allocationCount: existing.allocationCount + 1,
      allocatedTotal: roundMoney(existing.allocatedTotal + toNumber(row.amount)),
    });
  }

  return summaries;
}

export async function deleteExpense(input: {
  expenseId: string;
  communityId: string;
}): Promise<void> {
  if (!isSupabaseDataEnabled()) {
    const next = mockExpenseRecords.filter((item) => !(item.id === input.expenseId && item.communityId === input.communityId));
    if (next.length === mockExpenseRecords.length) {
      throw new Error('Masraf kaydı bulunamadı.');
    }
    mockExpenseRecords = next;
    return;
  }

  const { error } = await supabase
    .from('expenses')
    .delete()
    .eq('id', input.expenseId)
    .eq('community_id', input.communityId);

  if (error) {
    throw formatError(error, 'Masraf kaydı silinemedi.');
  }
}

export async function approveExpense(input: {
  expenseId: string;
  communityId: string;
  actionedBy: string;
  recipientUserId?: string | null;
  communityName?: string;
  expenseTitle?: string;
}): Promise<void> {
  const nowIso = new Date().toISOString();

  if (!isSupabaseDataEnabled()) {
    mockExpenseRecords = mockExpenseRecords.map((item) => {
      if (item.id !== input.expenseId || item.communityId !== input.communityId) return item;
      return {
        ...item,
        approvalStatus: 'approved',
        actionedBy: input.actionedBy,
        actionedAt: nowIso,
      };
    });
    return;
  }

  const { error } = await supabase
    .from('expenses')
    .update({
      approval_status: 'approved',
      actioned_by: input.actionedBy,
      actioned_at: nowIso,
    })
    .eq('id', input.expenseId)
    .eq('community_id', input.communityId);

  if (error) {
    throw formatError(error, 'Masraf onaylanamadı.');
  }

  let recipientUserId = String(input.recipientUserId ?? '').trim();
  let expenseTitle = String(input.expenseTitle ?? '').trim();

  if (!recipientUserId || !expenseTitle) {
    const { data: expenseRow } = await supabase
      .from('expenses')
      .select('submitted_by, title')
      .eq('id', input.expenseId)
      .eq('community_id', input.communityId)
      .maybeSingle();

    if (!recipientUserId) {
      recipientUserId = String(expenseRow?.submitted_by ?? '').trim();
    }
    if (!expenseTitle) {
      expenseTitle = String(expenseRow?.title ?? '').trim();
    }
  }

  if (recipientUserId) {
    const communityName = String(input.communityName ?? '').trim() || 'Topluluk';
    const safeExpenseTitle = expenseTitle || 'Masraf';

    await sendDirectNotificationToUser({
      recipientUserId,
      title: 'Masraf kaydınız onaylandı',
      body: `${communityName} / ${safeExpenseTitle} kaydı onaylandı.`,
      data: {
        screen: 'expenses',
        communityId: input.communityId,
        eventType: 'expense_approved',
        expenseId: input.expenseId,
        decisionStatus: 'approved',
      },
    });
  }
}

export async function rejectExpense(input: {
  expenseId: string;
  communityId: string;
  actionedBy: string;
  rejectionReason?: string;
  recipientUserId?: string | null;
  communityName?: string;
  expenseTitle?: string;
}): Promise<void> {
  const nowIso = new Date().toISOString();

  if (!isSupabaseDataEnabled()) {
    mockExpenseRecords = mockExpenseRecords.map((item) => {
      if (item.id !== input.expenseId || item.communityId !== input.communityId) return item;
      return {
        ...item,
        approvalStatus: 'rejected',
        actionedBy: input.actionedBy,
        actionedAt: nowIso,
      };
    });
    return;
  }

  const { error } = await supabase
    .from('expenses')
    .update({
      approval_status: 'rejected',
      actioned_by: input.actionedBy,
      actioned_at: nowIso,
    })
    .eq('id', input.expenseId)
    .eq('community_id', input.communityId);

  if (error) {
    throw formatError(error, 'Masraf reddedilemedi.');
  }

  const reason = String(input.rejectionReason ?? '').trim();
  let recipientUserId = String(input.recipientUserId ?? '').trim();
  let expenseTitle = String(input.expenseTitle ?? '').trim();

  if (!recipientUserId || !expenseTitle) {
    const { data: expenseRow } = await supabase
      .from('expenses')
      .select('submitted_by, title')
      .eq('id', input.expenseId)
      .eq('community_id', input.communityId)
      .maybeSingle();

    if (!recipientUserId) {
      recipientUserId = String(expenseRow?.submitted_by ?? '').trim();
    }
    if (!expenseTitle) {
      expenseTitle = String(expenseRow?.title ?? '').trim();
    }
  }

  if (!recipientUserId) return;

  const communityName = String(input.communityName ?? '').trim() || 'Topluluk';
  const safeExpenseTitle = expenseTitle || 'Masraf';

  await sendDirectNotificationToUser({
    recipientUserId,
    title: 'Masraf kaydınız reddedildi',
    body: reason
      ? `${communityName} / ${safeExpenseTitle} red nedeni: ${reason}`
      : `${communityName} / ${safeExpenseTitle} kaydı reddedildi.`,
    data: {
      screen: 'expenses',
      communityId: input.communityId,
      eventType: 'expense_rejected',
      expenseId: input.expenseId,
      decisionStatus: 'rejected',
      decisionNote: reason,
    },
  });
}
