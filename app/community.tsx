import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, ActivityIndicator, View, Text, TouchableOpacity } from 'react-native';
import { RefreshableScrollView } from '../src/components/RefreshableScrollView';
import { Card } from '../src/components/Card';
import { useCommunity } from '../src/context/CommunityContext';
import { useAuth } from '../src/context/AuthContext';
import { colors } from '../src/theme';
import { getAnimalsByCommunity } from '../src/data/animalStore';
import { getCommunityMembers } from '../src/data/mock';
import {
  approveJoinRequest,
  getPendingJoinRequestsForCommunity,
  PendingJoinRequest,
  rejectJoinRequest,
} from '../src/services/communityService';
import {
  ExpenseRecord,
  getApprovedExpensesByCommunity,
  getPendingExpensesForCommunity,
} from '../src/services/expenseService';
import {
  allocateContributionToExpenses,
  ContributionRecord,
  getContributionsByCommunity,
  getAllocatableContributionsForCommunity,
  getContributorDisplayName,
  getPendingContributionsForCommunity,
} from '../src/services/contributionService';
import { isSupabaseDataEnabled } from '../src/services/supabase';

export default function Community() {
  const params = useLocalSearchParams<{ source?: string }>();
  const { selectedCommunity, refreshCommunities } = useCommunity();
  const { currentUser } = useAuth();
  const [pendingRequests, setPendingRequests] = useState<PendingJoinRequest[]>([]);
  const [pendingExpenseApprovals, setPendingExpenseApprovals] = useState<ExpenseRecord[]>([]);
  const [pendingContributionApprovals, setPendingContributionApprovals] = useState<ContributionRecord[]>([]);
  const [allocatableContributions, setAllocatableContributions] = useState<ContributionRecord[]>([]);
  const [openApprovedExpenses, setOpenApprovedExpenses] = useState<ExpenseRecord[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [isLoadingExpenseApprovals, setIsLoadingExpenseApprovals] = useState(false);
  const [isLoadingContributionApprovals, setIsLoadingContributionApprovals] = useState(false);
  const [debtCreditBalance, setDebtCreditBalance] = useState(0);
  const [actioningRequestId, setActioningRequestId] = useState<string | null>(null);
  const [actioningContributionId, setActioningContributionId] = useState<string | null>(null);
  const [selectedExpenseByContributionId, setSelectedExpenseByContributionId] = useState<Record<string, string>>({});
  const source = Array.isArray(params.source) ? params.source[0] : params.source;

  function goBackBySource() {
    router.replace('/home');
  }

  const selectedCommunityId = selectedCommunity?.id ?? null;
  const isCommunityAdmin = !!currentUser && selectedCommunity?.adminUserIds.includes(currentUser.id);
  const memberNameById = useMemo(() => {
    if (!selectedCommunityId) return new Map<string, string>();
    const rows = getCommunityMembers(selectedCommunityId)
      .filter((member) => !!member.user)
      .map((member) => ({
        userId: member.userId,
        fullName: member.user?.fullName ?? member.user?.username ?? member.userId,
      }));
    return new Map(rows.map((item) => [item.userId, item.fullName]));
  }, [selectedCommunityId]);

  function getPerformerName(userId: string | null): string {
    if (!userId) return 'Belirtilmedi';
    return memberNameById.get(userId) ?? userId;
  }

  const communityMenuItems = [
    ...(isCommunityAdmin ? [
      ['🛡️', 'Üye Listesi ve Yetkiler', '/community-members'],
      ['🐾', 'Can dostlar', '/animal'],
      ['🩺', 'Veterinerler', '/veterinarians'],
      ['🗺️', 'Harita ve besleme noktalari', '/map'],
      ['🧾', 'Masraf', '/expenses'],
      ['🤝', 'Pati Uzat', '/pati-uzat'],
      ['💰', 'Kasa', '/finance'],
    ] : []),
    
  ] as const;
  const memberCount = useMemo(() => {
    if (!selectedCommunity) return 0;
    const computed = getCommunityMembers(selectedCommunity.id)
      .filter((member) => member.status === 'active')
      .length;
    const fallback = Number(selectedCommunity.members ?? 0);
    return computed > 0 ? computed : fallback;
  }, [selectedCommunity]);
  const animalCount = useMemo(() => {
    if (!selectedCommunity) return 0;
    const computed = getAnimalsByCommunity(selectedCommunity.id).length;
    const fallback = Number(selectedCommunity.animals ?? 0);
    return computed > 0 ? computed : fallback;
  }, [selectedCommunity]);

  const loadPendingRequests = useCallback(async () => {
    if (!selectedCommunityId || !isCommunityAdmin || !isSupabaseDataEnabled()) {
      setPendingRequests([]);
      return;
    }

    setIsLoadingRequests(true);
    try {
      const rows = await getPendingJoinRequestsForCommunity(selectedCommunityId);
      setPendingRequests(rows);
    } catch (error: any) {
      Alert.alert('İstek okuma hatası', String(error?.message ?? 'Katılım istekleri yüklenemedi.'));
    } finally {
      setIsLoadingRequests(false);
    }
  }, [isCommunityAdmin, selectedCommunityId]);

  const loadPendingExpenseApprovals = useCallback(async () => {
    if (!selectedCommunityId || !isCommunityAdmin || !isSupabaseDataEnabled()) {
      setPendingExpenseApprovals([]);
      setPendingContributionApprovals([]);
      setAllocatableContributions([]);
      setOpenApprovedExpenses([]);
      return;
    }

    setIsLoadingExpenseApprovals(true);
    setIsLoadingContributionApprovals(true);
    try {
      const [expenseRows, pendingContributionRows, allocatableContributionRows, approvedExpenseRows] = await Promise.all([
        getPendingExpensesForCommunity(selectedCommunityId),
        getPendingContributionsForCommunity(selectedCommunityId),
        getAllocatableContributionsForCommunity(selectedCommunityId),
        getApprovedExpensesByCommunity(selectedCommunityId),
      ]);
      setPendingExpenseApprovals(expenseRows);
      setPendingContributionApprovals(pendingContributionRows);
      setAllocatableContributions(allocatableContributionRows);
      setOpenApprovedExpenses(approvedExpenseRows.filter((item) => item.dueAmount > 0));

      const selectedMap: Record<string, string> = {};
      for (const contribution of [...pendingContributionRows, ...allocatableContributionRows]) {
        const firstOpenExpense = approvedExpenseRows.find((item) => item.dueAmount > 0);
        if (firstOpenExpense) {
          selectedMap[contribution.id] = firstOpenExpense.id;
        }
      }
      setSelectedExpenseByContributionId(selectedMap);
    } catch (error: any) {
      Alert.alert('Masraf okuma hatası', String(error?.message ?? 'Bekleyen masraflar okunamadı.'));
    } finally {
      setIsLoadingExpenseApprovals(false);
      setIsLoadingContributionApprovals(false);
    }
  }, [isCommunityAdmin, selectedCommunityId]);

  const loadFinanceKpi = useCallback(async () => {
    if (!selectedCommunityId) {
      setDebtCreditBalance(0);
      return;
    }

    try {
      const [approvedExpenseRows, contributionRows] = await Promise.all([
        getApprovedExpensesByCommunity(selectedCommunityId),
        getContributionsByCommunity(selectedCommunityId),
      ]);

      const openDebt = approvedExpenseRows.reduce((total, item) => total + item.dueAmount, 0);
      const approvedContributionRemaining = contributionRows
        .filter((item) => item.approvalStatus === 'approved')
        .reduce((total, item) => total + item.remainingAmount, 0);

      setDebtCreditBalance(approvedContributionRemaining - openDebt);
    } catch {
      setDebtCreditBalance(0);
    }
  }, [selectedCommunityId]);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;

      async function refreshScreenData() {
        await refreshCommunities();
        if (!mounted) return;
        await Promise.all([loadPendingRequests(), loadPendingExpenseApprovals(), loadFinanceKpi()]);
      }

      refreshScreenData();

      return () => {
        mounted = false;
      };
    }, [loadFinanceKpi, loadPendingExpenseApprovals, loadPendingRequests, refreshCommunities])
  );

  async function onApprove(request: PendingJoinRequest) {
    setActioningRequestId(request.id);
    try {
      await approveJoinRequest({
        requestId: request.id,
        communityId: request.communityId,
        userId: request.userId,
      });
      await refreshCommunities();
      await loadPendingRequests();
    } catch (error: any) {
      Alert.alert('Onay hatası', String(error?.message ?? 'İstek onaylanamadi.'));
    } finally {
      setActioningRequestId(null);
    }
  }

  async function onReject(request: PendingJoinRequest) {
    setActioningRequestId(request.id);
    try {
      await rejectJoinRequest({
        requestId: request.id,
        communityId: request.communityId,
        userId: request.userId,
      });
      await refreshCommunities();
      await loadPendingRequests();
    } catch (error: any) {
      Alert.alert('Red hatası', String(error?.message ?? 'İstek reddedilemedi.'));
    } finally {
      setActioningRequestId(null);
    }
  }

  async function onAllocateContribution(contribution: ContributionRecord) {
    if (!selectedCommunityId || !currentUser) return;

    const selectedExpenseId = selectedExpenseByContributionId[contribution.id];
    if (!selectedExpenseId) {
      Alert.alert('Eksik bilgi', 'Lütfen önce yardımın uygulanacağı masrafı seç.');
      return;
    }

    setActioningContributionId(contribution.id);
    try {
      await allocateContributionToExpenses({
        contributionId: contribution.id,
        communityId: selectedCommunityId,
        approvedBy: currentUser.id,
        primaryExpenseId: selectedExpenseId,
        autoDistributeRemaining: true,
      });
      await refreshCommunities();
      await loadPendingExpenseApprovals();
    } catch (error: any) {
      Alert.alert('Uygulama hatası', String(error?.message ?? 'Pati uzatma kaydı masraflara uygulanamadı.'));
    } finally {
      setActioningContributionId(null);
    }
  }

  if (!selectedCommunity) return null;

  return (
    <RefreshableScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 40 }}>
      <TouchableOpacity onPress={goBackBySource} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ paddingVertical: 6, paddingHorizontal: 8, alignSelf: 'flex-start' }}><Text style={{ fontSize: 38, lineHeight: 38 }}>‹</Text></TouchableOpacity>
      <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text, marginTop: 12 }}>{selectedCommunity.name}</Text>
      <Text style={{ color: colors.muted, marginTop: 5 }}>{selectedCommunity.neighborhood} · {memberCount} üye · {animalCount} can dost</Text>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 22 }}>
        <TouchableOpacity onPress={() => router.push({ pathname: '/animal', params: { source: 'community' } })} style={{ flex: 0.85 }}>
          <Card style={{ paddingVertical: 9, paddingHorizontal: 9 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Text style={{ fontSize: 18 }}>🐾</Text>
              <Text style={{ fontWeight: '800', fontSize: 14, color: colors.text }} numberOfLines={1} adjustsFontSizeToFit>
                {String(animalCount)}
              </Text>
            </View>
            <Text style={{ color: colors.muted, marginTop: 3, fontSize: 10 }} numberOfLines={1}>Can Dost</Text>
          </Card>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push({ pathname: '/community-members', params: { source: 'community' } })} style={{ flex: 0.85 }}>
          <Card style={{ paddingVertical: 9, paddingHorizontal: 9 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Text style={{ fontSize: 18 }}>👥</Text>
              <Text style={{ fontWeight: '800', fontSize: 14, color: colors.text }} numberOfLines={1} adjustsFontSizeToFit>
                {String(memberCount)}
              </Text>
            </View>
            <Text style={{ color: colors.muted, marginTop: 3, fontSize: 10 }} numberOfLines={1}>Üye Sayısı</Text>
          </Card>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push({ pathname: '/finance', params: { source: 'community' } })} style={{ flex: 1.3 }}>
          <Card
            style={{
              paddingVertical: 9,
              paddingHorizontal: 10,
              backgroundColor: debtCreditBalance >= 0 ? '#EAF7EC' : '#FDECEC',
              borderWidth: 1,
              borderColor: debtCreditBalance >= 0 ? '#B8DEBF' : '#F3B7B2',
            }}
          >
            <Text
              style={{ fontWeight: '800', fontSize: 15, color: debtCreditBalance >= 0 ? '#2F7A44' : '#9B3A34' }}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {debtCreditBalance >= 0 ? '+' : '-'}{Math.abs(debtCreditBalance).toLocaleString('tr-TR')} ₺
            </Text>
            <Text style={{ color: colors.muted, marginTop: 3, fontSize: 10 }} numberOfLines={1}>Borç / Alacak</Text>
          </Card>
        </TouchableOpacity>
      </View>

      {isCommunityAdmin ? (
        <>
          <Text style={{ fontSize: 19, fontWeight: '800', color: colors.text, marginTop: 28, marginBottom: 12 }}>Yönetici işlemleri</Text>
          <Card>
            <Text style={{ fontWeight: '800', color: colors.text, fontSize: 16 }}>
              {pendingRequests.length} yeni katılım isteği
            </Text>

            {isLoadingRequests ? (
              <View style={{ marginTop: 12, alignItems: 'center' }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : null}

            {!isLoadingRequests && pendingRequests.length === 0 ? (
              <Text style={{ color: colors.muted, marginTop: 10 }}>Bekleyen katılım isteği yok.</Text>
            ) : null}

            {pendingRequests.map((r) => (
              <View key={r.id} style={{ paddingTop: 15, marginTop: 13, borderTopWidth: 1, borderTopColor: colors.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontWeight: '800', color: colors.primary }}>
                      {r.requesterName
                        .split(' ')
                        .map((part) => part[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ fontWeight: '800', color: colors.text }}>{r.requesterName}</Text>
                    <Text style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}>{r.note || 'Not yok'}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 11 }}>
                  <TouchableOpacity
                    disabled={actioningRequestId === r.id}
                    onPress={() => onApprove(r)}
                    style={{ flex: 1, backgroundColor: colors.primary, borderRadius: 12, padding: 11, opacity: actioningRequestId === r.id ? 0.7 : 1 }}
                  >
                    <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>Onayla</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={actioningRequestId === r.id}
                    onPress={() => onReject(r)}
                    style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 11, opacity: actioningRequestId === r.id ? 0.7 : 1 }}
                  >
                    <Text style={{ color: colors.text, textAlign: 'center', fontWeight: '700' }}>Reddet</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

          </Card>

          <Card style={{ marginTop: 12 }}>
            <Text style={{ fontWeight: '800', color: colors.text, fontSize: 16 }}>
              {pendingExpenseApprovals.length} masraf onay bekliyor
            </Text>

            {isLoadingExpenseApprovals ? (
              <View style={{ marginTop: 12, alignItems: 'center' }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : null}

            {!isLoadingExpenseApprovals && pendingExpenseApprovals.length === 0 ? (
              <Text style={{ color: colors.muted, marginTop: 10 }}>Bekleyen masraf onayı yok.</Text>
            ) : null}

            {pendingExpenseApprovals.map((expense) => (
              <View key={expense.id} style={{ paddingTop: 15, marginTop: 13, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Text style={{ fontWeight: '800', color: colors.text }}>{expense.title}</Text>
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}>
                  {expense.type === 'veteriner' ? 'Veteriner' : 'Mama'} · {expense.vendorName}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}>
                  Yapan: {getPerformerName(expense.submittedBy)}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}>
                  {new Date(expense.expenseAt).toLocaleString('tr-TR')} · {expense.amount.toLocaleString('tr-TR')} ₺
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    router.push({
                      pathname: '/expenses',
                      params: {
                        mode: 'expenses-manage',
                        source: 'community',
                        reviewExpenseId: expense.id,
                      },
                    });
                  }}
                  style={{ marginTop: 11, backgroundColor: colors.primary, borderRadius: 12, padding: 11 }}
                >
                  <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>Masrafı İncele</Text>
                </TouchableOpacity>
              </View>
            ))}
          </Card>

          <Card style={{ marginTop: 12 }}>
            <Text style={{ fontWeight: '800', color: colors.text, fontSize: 16 }}>
              {pendingContributionApprovals.length} Pati Uzat kaydı onay bekliyor
            </Text>

            {isLoadingContributionApprovals ? (
              <View style={{ marginTop: 12, alignItems: 'center' }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : null}

            {!isLoadingContributionApprovals && pendingContributionApprovals.length === 0 ? (
              <Text style={{ color: colors.muted, marginTop: 10 }}>Bekleyen Pati Uzat kaydı yok.</Text>
            ) : null}

            {!isLoadingContributionApprovals && openApprovedExpenses.length === 0 ? (
              <Text style={{ color: colors.muted, marginTop: 10 }}>
                Yardımı uygulayacak açık onaylı masraf bulunmuyor.
              </Text>
            ) : null}

            {pendingContributionApprovals.map((contribution) => (
              <View key={contribution.id} style={{ paddingTop: 15, marginTop: 13, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Text style={{ fontWeight: '800', color: colors.text }}>
                  {contribution.amount.toLocaleString('tr-TR')} ₺ yardım
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}>
                  Kalan: {contribution.remainingAmount.toLocaleString('tr-TR')} ₺
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}>
                  Üye: {getContributorDisplayName(contribution.communityId, contribution.contributorUserId)}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}>
                  Tarih: {new Date(contribution.transferAt).toLocaleString('tr-TR')}
                </Text>

                <TouchableOpacity
                  onPress={() => {
                    router.push({
                      pathname: '/pati-uzat',
                      params: {
                        view: 'community',
                        source: 'community',
                        reviewContributionId: contribution.id,
                      },
                    });
                  }}
                  style={{
                    marginTop: 11,
                    backgroundColor: colors.primary,
                    borderRadius: 12,
                    padding: 11,
                  }}
                >
                  <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>Pati Uzat İncele</Text>
                </TouchableOpacity>
              </View>
            ))}
          </Card>

          <Card style={{ marginTop: 12 }}>
            <Text style={{ fontWeight: '800', color: colors.text, fontSize: 16 }}>
              {allocatableContributions.length} kalan yardım yeniden dağıtılabilir
            </Text>

            {allocatableContributions.length === 0 ? (
              <Text style={{ color: colors.muted, marginTop: 10 }}>Kalan yardım bulunmuyor.</Text>
            ) : null}

            {allocatableContributions.map((contribution) => (
              <View key={`allocatable-${contribution.id}`} style={{ paddingTop: 15, marginTop: 13, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Text style={{ fontWeight: '800', color: colors.text }}>
                  {contribution.amount.toLocaleString('tr-TR')} ₺ yardım
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}>
                  Kalan: {contribution.remainingAmount.toLocaleString('tr-TR')} ₺
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}>
                  Üye: {getContributorDisplayName(contribution.communityId, contribution.contributorUserId)}
                </Text>

                {contribution.allocations.length > 0 ? (
                  <View style={{ marginTop: 6 }}>
                    {contribution.allocations.map((allocation) => (
                      <Text key={allocation.id} style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
                        • {allocation.expenseTitle}: {allocation.amount.toLocaleString('tr-TR')} ₺
                      </Text>
                    ))}
                  </View>
                ) : null}

                <View style={{ marginTop: 9, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: '#fff' }}>
                  {openApprovedExpenses.map((expense) => {
                    const isSelected = selectedExpenseByContributionId[contribution.id] === expense.id;
                    return (
                      <TouchableOpacity
                        key={`${contribution.id}-${expense.id}`}
                        onPress={() => setSelectedExpenseByContributionId((prev) => ({ ...prev, [contribution.id]: expense.id }))}
                        style={{
                          padding: 10,
                          borderTopWidth: 1,
                          borderTopColor: colors.border,
                          backgroundColor: isSelected ? '#EEF5EE' : '#fff',
                        }}
                      >
                        <Text style={{ color: colors.text, fontWeight: isSelected ? '800' : '600' }}>{expense.title}</Text>
                        <Text style={{ color: colors.muted, marginTop: 2 }}>
                          Kalan borç: {expense.dueAmount.toLocaleString('tr-TR')} ₺
                        </Text>
                        <Text style={{ color: colors.muted, marginTop: 2 }}>
                          Yapan: {getPerformerName(expense.submittedBy)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TouchableOpacity
                  disabled={actioningContributionId === contribution.id || openApprovedExpenses.length === 0 || contribution.remainingAmount <= 0}
                  onPress={() => onAllocateContribution(contribution)}
                  style={{
                    marginTop: 11,
                    backgroundColor: colors.primary,
                    borderRadius: 12,
                    padding: 11,
                    opacity: actioningContributionId === contribution.id || openApprovedExpenses.length === 0 || contribution.remainingAmount <= 0 ? 0.6 : 1,
                  }}
                >
                  <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>Kalan Yardımı Masrafa Dağıt</Text>
                </TouchableOpacity>
              </View>
            ))}
          </Card>

        </>
      ) : null}

      <Text style={{ fontSize: 19, fontWeight: '800', color: colors.text, marginTop: 28, marginBottom: 12 }}>Topluluk menüsü</Text>
      {communityMenuItems.map(([icon,label,path]) => (
        <TouchableOpacity
          key={label}
          onPress={() => {
            if (path === '/pati-uzat') {
              router.push({
                pathname: '/pati-uzat',
                params: { view: isCommunityAdmin ? 'community' : 'mine', source: 'community' },
              });
              return;
            }
            if (path === '/expenses') {
              router.push({
                pathname: '/expenses',
                params: { mode: 'expenses-manage', source: 'community' },
              });
              return;
            }
            if (path === '/animal') {
              router.push({
                pathname: '/animal',
                params: { source: 'community' },
              });
              return;
            }
            if (path === '/community-members' || path === '/finance' || path === '/veterinarians' || path === '/map') {
              router.push({
                pathname: path,
                params: { source: 'community' },
              });
              return;
            }
            router.push(path as any);
          }}
        >
          <Card style={{ marginBottom: 9 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 24, width: 38 }}>{icon}</Text>
              <Text style={{ fontWeight: '700', color: colors.text, flex: 1 }}>{label}</Text>
              <Text style={{ fontSize: 23 }}>›</Text>
            </View>
          </Card>
        </TouchableOpacity>
      ))}
    </RefreshableScrollView>
  );
}
