import { getCommunityMembers } from '../data/mock';
import { isSupabaseDataEnabled, supabase } from './supabase';

export type ContributionApprovalStatus = 'pending' | 'approved' | 'rejected';

export type ContributionAllocation = {
  id: string;
  contributionId: string;
  expenseId: string;
  expenseTitle: string;
  amount: number;
  allocatedAt: string;
};

export type ContributionRecord = {
  id: string;
  communityId: string;
  contributorUserId: string | null;
  amount: number;
  transferAt: string;
  note: string;
  receiptUrl: string;
  receiptUrls: string[];
  approvalStatus: ContributionApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  allocations: ContributionAllocation[];
  allocatedAmount: number;
  remainingAmount: number;
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

function normalizeStatus(value: any): ContributionApprovalStatus {
  const raw = String(value ?? 'pending').toLowerCase();
  if (raw === 'approved' || raw === 'rejected') return raw;
  return 'pending';
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

function formatError(error: any, fallback: string): Error {
  const details = [error?.message, error?.details, error?.hint].filter(Boolean).join(' - ');
  return new Error(details || fallback);
}

function mapAllocationRow(row: any): ContributionAllocation {
  const expenseTitle = row.expenses?.title ?? row.expense?.title ?? 'Masraf';

  return {
    id: String(row.id),
    contributionId: String(row.contribution_id),
    expenseId: String(row.expense_id),
    expenseTitle: String(expenseTitle),
    amount: roundMoney(toNumber(row.amount)),
    allocatedAt: toIso(row.allocated_at, new Date().toISOString()),
  };
}

function mapRow(row: any, allocations: ContributionAllocation[]): ContributionRecord {
  const createdAt = toIso(row.created_at, new Date().toISOString());
  const receiptUrls = parseReceiptUrls(row);
  const allocatedAmount = roundMoney(allocations.reduce((sum, item) => sum + item.amount, 0));
  const totalAmount = roundMoney(toNumber(row.amount));

  return {
    id: String(row.id),
    communityId: String(row.community_id),
    contributorUserId: row.contributor_user_id ? String(row.contributor_user_id) : (row.user_id ? String(row.user_id) : null),
    amount: totalAmount,
    transferAt: toIso(row.transfer_at, createdAt),
    note: String(row.note ?? ''),
    receiptUrl: receiptUrls[0] ?? String(row.receipt_url ?? ''),
    receiptUrls,
    approvalStatus: normalizeStatus(row.approval_status),
    approvedBy: row.approved_by ? String(row.approved_by) : null,
    approvedAt: row.approved_at ? toIso(row.approved_at, createdAt) : null,
    createdAt,
    allocations,
    allocatedAmount,
    remainingAmount: roundMoney(Math.max(0, totalAmount - allocatedAmount)),
  };
}

let mockContributions: ContributionRecord[] = [];

async function fetchAllocationMap(contributionIds: string[]): Promise<Map<string, ContributionAllocation[]>> {
  const map = new Map<string, ContributionAllocation[]>();
  contributionIds.forEach((id) => map.set(id, []));
  if (contributionIds.length === 0) return map;

  const { data, error } = await supabase
    .from('contribution_allocations')
    .select('id, contribution_id, expense_id, amount, allocated_at, expenses(title)')
    .in('contribution_id', contributionIds)
    .order('allocated_at', { ascending: true });

  if (error) {
    throw formatError(error, 'Yardım dağıtım kayıtları okunamadı.');
  }

  for (const row of data ?? []) {
    const allocation = mapAllocationRow(row);
    const list = map.get(allocation.contributionId) ?? [];
    list.push(allocation);
    map.set(allocation.contributionId, list);
  }

  return map;
}

function mapMockRows(rows: ContributionRecord[]): ContributionRecord[] {
  return rows.map((item) => {
    const allocatedAmount = roundMoney(item.allocations.reduce((sum, a) => sum + a.amount, 0));
    return {
      ...item,
      allocatedAmount,
      remainingAmount: roundMoney(Math.max(0, item.amount - allocatedAmount)),
    };
  });
}

export async function getPendingContributionsForCommunity(communityId: string): Promise<ContributionRecord[]> {
  if (!isSupabaseDataEnabled()) {
    return mapMockRows(
      mockContributions
        .filter((item) => item.communityId === communityId && item.approvalStatus === 'pending')
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    );
  }

  const { data, error } = await supabase
    .from('contributions')
    .select('id, community_id, user_id, contributor_user_id, amount, transfer_at, note, receipt_url, receipt_urls, approval_status, approved_by, approved_at, created_at')
    .eq('community_id', communityId)
    .eq('approval_status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    throw formatError(error, 'Bekleyen pati uzatma kayıtları okunamadı.');
  }

  const rows = data ?? [];
  const allocationMap = await fetchAllocationMap(rows.map((row: any) => String(row.id)));
  return rows.map((row: any) => mapRow(row, allocationMap.get(String(row.id)) ?? []));
}

export async function getContributionsByContributor(communityId: string, contributorUserId: string): Promise<ContributionRecord[]> {
  if (!isSupabaseDataEnabled()) {
    return mapMockRows(
      mockContributions
        .filter((item) => item.communityId === communityId && item.contributorUserId === contributorUserId)
        .sort((left, right) => right.transferAt.localeCompare(left.transferAt))
    );
  }

  const { data, error } = await supabase
    .from('contributions')
    .select('id, community_id, user_id, contributor_user_id, amount, transfer_at, note, receipt_url, receipt_urls, approval_status, approved_by, approved_at, created_at')
    .eq('community_id', communityId)
    .eq('contributor_user_id', contributorUserId)
    .order('transfer_at', { ascending: false });

  if (error) {
    throw formatError(error, 'Pati uzatma kayıtları okunamadı.');
  }

  const rows = data ?? [];
  const allocationMap = await fetchAllocationMap(rows.map((row: any) => String(row.id)));
  return rows.map((row: any) => mapRow(row, allocationMap.get(String(row.id)) ?? []));
}

export async function getContributionsByCommunity(communityId: string): Promise<ContributionRecord[]> {
  if (!isSupabaseDataEnabled()) {
    return mapMockRows(
      mockContributions
        .filter((item) => item.communityId === communityId)
        .sort((left, right) => right.transferAt.localeCompare(left.transferAt))
    );
  }

  const { data, error } = await supabase
    .from('contributions')
    .select('id, community_id, user_id, contributor_user_id, amount, transfer_at, note, receipt_url, receipt_urls, approval_status, approved_by, approved_at, created_at')
    .eq('community_id', communityId)
    .order('transfer_at', { ascending: false });

  if (error) {
    throw formatError(error, 'Topluluk pati uzatma kayıtları okunamadı.');
  }

  const rows = data ?? [];
  const allocationMap = await fetchAllocationMap(rows.map((row: any) => String(row.id)));
  return rows.map((row: any) => mapRow(row, allocationMap.get(String(row.id)) ?? []));
}

export async function getAllocatableContributionsForCommunity(communityId: string): Promise<ContributionRecord[]> {
  if (!isSupabaseDataEnabled()) {
    return mapMockRows(
      mockContributions
        .filter((item) => item.communityId === communityId && item.approvalStatus === 'approved')
        .sort((left, right) => right.transferAt.localeCompare(left.transferAt))
    ).filter((item) => item.remainingAmount > 0);
  }

  const { data, error } = await supabase
    .from('contributions')
    .select('id, community_id, user_id, contributor_user_id, amount, transfer_at, note, receipt_url, receipt_urls, approval_status, approved_by, approved_at, created_at')
    .eq('community_id', communityId)
    .eq('approval_status', 'approved')
    .order('transfer_at', { ascending: false });

  if (error) {
    throw formatError(error, 'Onaylı yardımlar okunamadı.');
  }

  const rows = data ?? [];
  const allocationMap = await fetchAllocationMap(rows.map((row: any) => String(row.id)));
  return rows
    .map((row: any) => mapRow(row, allocationMap.get(String(row.id)) ?? []))
    .filter((item) => item.remainingAmount > 0);
}

export async function createContribution(input: {
  communityId: string;
  actorUserId: string;
  contributorUserId: string;
  amount: number;
  transferAtIso: string;
  note?: string;
  receiptUrls: string[];
}): Promise<ContributionRecord> {
  const nowIso = new Date().toISOString();
  const normalizedAmount = roundMoney(input.amount);
  const normalizedReceiptUrls = input.receiptUrls.map((item) => item.trim()).filter(Boolean);
  const primaryReceiptUrl = normalizedReceiptUrls[0] ?? '';

  if (!isSupabaseDataEnabled()) {
    const record: ContributionRecord = {
      id: `contribution-${Date.now()}`,
      communityId: input.communityId,
      contributorUserId: input.contributorUserId,
      amount: normalizedAmount,
      transferAt: input.transferAtIso,
      note: String(input.note ?? '').trim(),
      receiptUrl: primaryReceiptUrl,
      receiptUrls: normalizedReceiptUrls,
      approvalStatus: 'pending',
      approvedBy: null,
      approvedAt: null,
      createdAt: nowIso,
      allocations: [],
      allocatedAmount: 0,
      remainingAmount: normalizedAmount,
    };
    mockContributions = [record, ...mockContributions];
    return record;
  }

  const { data, error } = await supabase
    .from('contributions')
    .insert({
      community_id: input.communityId,
      user_id: input.contributorUserId,
      contributor_user_id: input.contributorUserId,
      amount: normalizedAmount,
      transfer_at: input.transferAtIso,
      note: String(input.note ?? '').trim() || null,
      receipt_url: primaryReceiptUrl || null,
      receipt_urls: normalizedReceiptUrls,
      approval_status: 'pending',
      created_by: input.actorUserId,
    })
    .select('id, community_id, user_id, contributor_user_id, amount, transfer_at, note, receipt_url, receipt_urls, approval_status, approved_by, approved_at, created_at')
    .single();

  if (error) {
    throw formatError(error, 'Pati uzatma kaydı oluşturulamadı.');
  }

  return mapRow(data, []);
}

export async function allocateContributionToExpenses(input: {
  contributionId: string;
  communityId: string;
  approvedBy: string;
  primaryExpenseId: string;
  autoDistributeRemaining?: boolean;
}): Promise<{ allocatedAmount: number; remainingAmount: number }> {
  const nowIso = new Date().toISOString();
  const shouldAutoDistribute = input.autoDistributeRemaining ?? true;

  if (!isSupabaseDataEnabled()) {
    const contribution = mockContributions.find((item) => item.id === input.contributionId && item.communityId === input.communityId);
    if (!contribution) {
      throw new Error('Pati uzatma kaydı bulunamadı.');
    }

    if (contribution.approvalStatus === 'pending') {
      contribution.approvalStatus = 'approved';
      contribution.approvedBy = input.approvedBy;
      contribution.approvedAt = nowIso;
    }

    return {
      allocatedAmount: contribution.allocatedAmount,
      remainingAmount: contribution.remainingAmount,
    };
  }

  const { data: contributionRow, error: contributionReadError } = await supabase
    .from('contributions')
    .select('id, amount, approval_status, community_id')
    .eq('id', input.contributionId)
    .eq('community_id', input.communityId)
    .single();

  if (contributionReadError) {
    throw formatError(contributionReadError, 'Pati uzatma kaydı okunamadı.');
  }

  const contributionAmount = roundMoney(toNumber(contributionRow.amount));

  if (normalizeStatus(contributionRow.approval_status) === 'pending') {
    const { error: approveError } = await supabase
      .from('contributions')
      .update({
        approval_status: 'approved',
        approved_by: input.approvedBy,
        approved_at: nowIso,
      })
      .eq('id', input.contributionId)
      .eq('community_id', input.communityId);

    if (approveError) {
      throw formatError(approveError, 'Pati uzatma kaydı onaylanamadı.');
    }
  }

  const { data: existingAllocations, error: allocationReadError } = await supabase
    .from('contribution_allocations')
    .select('amount')
    .eq('contribution_id', input.contributionId)
    .eq('community_id', input.communityId);

  if (allocationReadError) {
    throw formatError(allocationReadError, 'Mevcut yardım dağıtımları okunamadı.');
  }

  const alreadyAllocated = roundMoney((existingAllocations ?? []).reduce((sum: number, row: any) => sum + toNumber(row.amount), 0));
  let remainingAmount = roundMoney(Math.max(0, contributionAmount - alreadyAllocated));

  if (remainingAmount <= 0) {
    return { allocatedAmount: contributionAmount, remainingAmount: 0 };
  }

  const { data: openExpenses, error: expenseReadError } = await supabase
    .from('expenses')
    .select('id, title, due_amount, amount, approval_status, expense_at')
    .eq('community_id', input.communityId)
    .eq('approval_status', 'approved')
    .gt('due_amount', 0)
    .order('expense_at', { ascending: true });

  if (expenseReadError) {
    throw formatError(expenseReadError, 'Açık masraflar okunamadı.');
  }

  const expenses = openExpenses ?? [];
  const primaryExpense = expenses.find((item: any) => String(item.id) === input.primaryExpenseId);
  if (!primaryExpense) {
    throw new Error('Seçilen masraf bulunamadı veya kapalı durumda.');
  }

  const otherExpenses = shouldAutoDistribute
    ? expenses.filter((item: any) => String(item.id) !== input.primaryExpenseId)
    : [];
  const candidateExpenses = [primaryExpense, ...otherExpenses];

  let allocatedNow = 0;

  for (const expense of candidateExpenses) {
    if (remainingAmount <= 0) break;

    const expenseDue = roundMoney(toNumber(expense.due_amount ?? expense.amount));
    if (expenseDue <= 0) continue;

    const allocationAmount = roundMoney(Math.min(remainingAmount, expenseDue));
    if (allocationAmount <= 0) continue;

    const nextDue = roundMoney(Math.max(0, expenseDue - allocationAmount));

    const { error: expenseUpdateError } = await supabase
      .from('expenses')
      .update({ due_amount: nextDue })
      .eq('id', expense.id)
      .eq('community_id', input.communityId);

    if (expenseUpdateError) {
      throw formatError(expenseUpdateError, 'Masraf borcu güncellenemedi.');
    }

    const { error: allocationInsertError } = await supabase
      .from('contribution_allocations')
      .insert({
        community_id: input.communityId,
        contribution_id: input.contributionId,
        expense_id: expense.id,
        amount: allocationAmount,
        allocated_by: input.approvedBy,
        allocated_at: nowIso,
      });

    if (allocationInsertError) {
      throw formatError(allocationInsertError, 'Yardım dağıtımı kaydedilemedi.');
    }

    remainingAmount = roundMoney(Math.max(0, remainingAmount - allocationAmount));
    allocatedNow = roundMoney(allocatedNow + allocationAmount);
  }

  const totalAllocated = roundMoney(alreadyAllocated + allocatedNow);
  return {
    allocatedAmount: totalAllocated,
    remainingAmount,
  };
}

export async function removeContributionAllocation(input: {
  allocationId: string;
  communityId: string;
}): Promise<void> {
  if (!isSupabaseDataEnabled()) {
    for (const contribution of mockContributions) {
      const nextAllocations = contribution.allocations.filter((item) => item.id !== input.allocationId);
      if (nextAllocations.length !== contribution.allocations.length) {
        contribution.allocations = nextAllocations;
        return;
      }
    }
    throw new Error('Dağıtım kaydı bulunamadı.');
  }

  const { data: allocationRow, error: allocationReadError } = await supabase
    .from('contribution_allocations')
    .select('id, expense_id, amount')
    .eq('id', input.allocationId)
    .eq('community_id', input.communityId)
    .single();

  if (allocationReadError) {
    throw formatError(allocationReadError, 'Dağıtım kaydı okunamadı.');
  }

  const allocationAmount = roundMoney(toNumber(allocationRow.amount));
  const expenseId = String(allocationRow.expense_id);

  const { data: expenseRow, error: expenseReadError } = await supabase
    .from('expenses')
    .select('id, amount, due_amount')
    .eq('id', expenseId)
    .eq('community_id', input.communityId)
    .single();

  if (expenseReadError) {
    throw formatError(expenseReadError, 'Masraf kaydı okunamadı.');
  }

  const currentDue = roundMoney(toNumber(expenseRow.due_amount));
  const expenseAmount = roundMoney(toNumber(expenseRow.amount));
  const nextDue = roundMoney(Math.min(expenseAmount, currentDue + allocationAmount));

  const { error: expenseUpdateError } = await supabase
    .from('expenses')
    .update({ due_amount: nextDue })
    .eq('id', expenseId)
    .eq('community_id', input.communityId);

  if (expenseUpdateError) {
    throw formatError(expenseUpdateError, 'Masraf borcu geri açılamadı.');
  }

  const { error: allocationDeleteError } = await supabase
    .from('contribution_allocations')
    .delete()
    .eq('id', input.allocationId)
    .eq('community_id', input.communityId);

  if (allocationDeleteError) {
    throw formatError(allocationDeleteError, 'Dağıtım kaydı silinemedi.');
  }
}

export async function updateContribution(input: {
  contributionId: string;
  communityId: string;
  contributorUserId: string;
  amount: number;
  transferAtIso: string;
  note?: string;
}): Promise<ContributionRecord> {
  const normalizedAmount = roundMoney(input.amount);

  if (!isSupabaseDataEnabled()) {
    const index = mockContributions.findIndex(
      (item) => item.id === input.contributionId && item.communityId === input.communityId
    );
    if (index < 0) {
      throw new Error('Pati uzatma kaydı bulunamadı.');
    }

    const existing = mockContributions[index];
    const updated: ContributionRecord = {
      ...existing,
      contributorUserId: input.contributorUserId,
      amount: normalizedAmount,
      transferAt: input.transferAtIso,
      note: String(input.note ?? '').trim(),
    };
    mockContributions[index] = updated;
    return updated;
  }

  const { data, error } = await supabase
    .from('contributions')
    .update({
      contributor_user_id: input.contributorUserId,
      user_id: input.contributorUserId,
      amount: normalizedAmount,
      transfer_at: input.transferAtIso,
      note: String(input.note ?? '').trim() || null,
    })
    .eq('id', input.contributionId)
    .eq('community_id', input.communityId)
    .select('id, community_id, user_id, contributor_user_id, amount, transfer_at, note, receipt_url, receipt_urls, approval_status, approved_by, approved_at, created_at')
    .single();

  if (error) {
    throw formatError(error, 'Pati uzatma kaydı güncellenemedi.');
  }

  const allocationMap = await fetchAllocationMap([String(data.id)]);
  return mapRow(data, allocationMap.get(String(data.id)) ?? []);
}

export async function approveContribution(input: {
  contributionId: string;
  communityId: string;
  approvedBy: string;
}): Promise<void> {
  const nowIso = new Date().toISOString();

  if (!isSupabaseDataEnabled()) {
    mockContributions = mockContributions.map((item) => {
      if (item.id !== input.contributionId || item.communityId !== input.communityId) return item;
      return {
        ...item,
        approvalStatus: 'approved',
        approvedBy: input.approvedBy,
        approvedAt: nowIso,
      };
    });
    return;
  }

  const { error } = await supabase
    .from('contributions')
    .update({
      approval_status: 'approved',
      approved_by: input.approvedBy,
      approved_at: nowIso,
    })
    .eq('id', input.contributionId)
    .eq('community_id', input.communityId);

  if (error) {
    throw formatError(error, 'Pati uzatma kaydı onaylanamadı.');
  }
}

export async function rejectContribution(input: {
  contributionId: string;
  communityId: string;
}): Promise<void> {
  if (!isSupabaseDataEnabled()) {
    mockContributions = mockContributions.map((item) => {
      if (item.id !== input.contributionId || item.communityId !== input.communityId) return item;
      return {
        ...item,
        approvalStatus: 'rejected',
        approvedBy: null,
        approvedAt: null,
      };
    });
    return;
  }

  const { error } = await supabase
    .from('contributions')
    .update({
      approval_status: 'rejected',
      approved_by: null,
      approved_at: null,
    })
    .eq('id', input.contributionId)
    .eq('community_id', input.communityId);

  if (error) {
    throw formatError(error, 'Pati uzatma kaydı reddedilemedi.');
  }
}

export async function deleteContribution(input: {
  contributionId: string;
  communityId: string;
}): Promise<void> {
  if (!isSupabaseDataEnabled()) {
    const prevLength = mockContributions.length;
    mockContributions = mockContributions.filter(
      (item) => !(item.id === input.contributionId && item.communityId === input.communityId)
    );

    if (mockContributions.length === prevLength) {
      throw new Error('Pati uzatma kaydı bulunamadı.');
    }
    return;
  }

  const { error } = await supabase
    .from('contributions')
    .delete()
    .eq('id', input.contributionId)
    .eq('community_id', input.communityId);

  if (error) {
    throw formatError(error, 'Pati uzatma kaydı silinemedi.');
  }
}

export function getContributorDisplayName(communityId: string, userId: string | null): string {
  if (!userId) return 'Belirtilmedi';
  const member = getCommunityMembers(communityId).find((item) => item.userId === userId);
  if (!member) return userId;
  return member.user?.fullName ?? member.user?.username ?? userId;
}
