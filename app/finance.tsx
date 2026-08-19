import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Modal, Text, TouchableOpacity, View } from 'react-native';
import { RefreshableScrollView } from '../src/components/RefreshableScrollView';
import { Card } from '../src/components/Card';
import { BottomBannerAd } from '../src/components/BottomBannerAd';
import { useAuth } from '../src/context/AuthContext';
import { useCommunity } from '../src/context/CommunityContext';
import { colors } from '../src/theme';
import { ExpenseRecord, getApprovedExpensesByCommunity } from '../src/services/expenseService';
import { ContributionRecord, getContributionsByCommunity } from '../src/services/contributionService';
import { getCommunityMembers } from '../src/data/mock';
import { downloadAndOpenRemoteFile } from '../src/services/fileDownload';

function formatContributionStatus(status: ContributionRecord['approvalStatus']): string {
  if (status === 'approved') return 'Onaylandı';
  if (status === 'rejected') return 'Reddedildi';
  return 'Onay bekliyor';
}

function formatExpenseStatus(status: ExpenseRecord['approvalStatus']): string {
  if (status === 'approved') return 'Onaylandı';
  if (status === 'rejected') return 'Reddedildi';
  return 'Onay bekliyor';
}

export default function Kasa() {
  const params = useLocalSearchParams<{ source?: string }>();
  const { currentUser } = useAuth();
  const { selectedCommunity } = useCommunity();
  const selectedCommunityId = selectedCommunity?.id ?? null;
  const source = Array.isArray(params.source) ? params.source[0] : params.source;

  function goBackBySource() {
    if (source === 'community') {
      router.replace('/community');
      return;
    }
    router.replace('/home');
  }

  const [isLoading, setIsLoading] = useState(false);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [contributions, setContributions] = useState<ContributionRecord[]>([]);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseRecord | null>(null);
  const [selectedContribution, setSelectedContribution] = useState<ContributionRecord | null>(null);

  const memberNameById = useMemo(() => {
    if (!selectedCommunityId) return new Map<string, string>();
    const rows = getCommunityMembers(selectedCommunityId)
      .filter((member) => member.status === 'active' && member.user)
      .map((member) => ({
        userId: member.userId,
        fullName: member.user?.fullName ?? member.user?.username ?? member.userId,
      }));
    return new Map(rows.map((item) => [item.userId, item.fullName]));
  }, [selectedCommunityId]);

  const expenseById = useMemo(() => {
    return new Map(expenses.map((item) => [item.id, item]));
  }, [expenses]);

  const scopedExpenses = useMemo(() => {
    if (!selectedCommunityId) return [] as ExpenseRecord[];
    return expenses.filter((item) => item.communityId === selectedCommunityId);
  }, [expenses, selectedCommunityId]);

  const scopedContributions = useMemo(() => {
    if (!selectedCommunityId) return [] as ContributionRecord[];
    return contributions.filter((item) => item.communityId === selectedCommunityId);
  }, [contributions, selectedCommunityId]);

  const openDebt = useMemo(() => scopedExpenses.reduce((total, item) => total + item.dueAmount, 0), [scopedExpenses]);

  const approvedExpenseTotal = useMemo(
    () => scopedExpenses.reduce((total, item) => total + item.amount, 0),
    [scopedExpenses]
  );

  const remainingApprovedContributions = useMemo(
    () => scopedContributions
      .filter((item) => item.approvalStatus === 'approved')
      .reduce((total, item) => total + item.remainingAmount, 0),
    [scopedContributions]
  );

  const approvedContributionTotal = useMemo(
    () => scopedContributions
      .filter((item) => item.approvalStatus === 'approved')
      .reduce((total, item) => total + item.amount, 0),
    [scopedContributions]
  );

  const debtCreditBalance = useMemo(
    () => remainingApprovedContributions - openDebt,
    [remainingApprovedContributions, openDebt]
  );

  const financeTimeline = useMemo(() => {
    const expenseRows = scopedExpenses.map((expense) => ({
      kind: 'expense' as const,
      id: `expense-${expense.id}`,
      date: expense.expenseAt,
      expense,
    }));

    const contributionRows = scopedContributions
      .filter((item) => item.approvalStatus === 'approved')
      .map((contribution) => ({
        kind: 'contribution' as const,
        id: `contribution-${contribution.id}`,
        date: contribution.transferAt,
        contribution,
      }));

    return [...expenseRows, ...contributionRows].sort((left, right) => right.date.localeCompare(left.date));
  }, [scopedContributions, scopedExpenses]);

  function openReceipt(url: string, baseName: string) {
    downloadAndOpenRemoteFile({ url, baseName }).catch(() => {
      Alert.alert('Dosya açılamadı', 'Dosya indirilemedi veya cihazda açılamadı.');
    });
  }

  function openReceipts(urls: string[], baseName: string) {
    const cleanUrls = urls.map((item) => item.trim()).filter(Boolean);
    if (cleanUrls.length === 0) {
      Alert.alert('Dosya bulunamadı', 'Bu kayıt için dosya bağlantısı bulunamadı.');
      return;
    }

    if (cleanUrls.length === 1) {
      openReceipt(cleanUrls[0], baseName);
      return;
    }

    Alert.alert(
      'Dosyalar',
      'Açmak istediğin dosyayı seç.',
      [
        ...cleanUrls.map((url, index) => ({ text: `Dosya ${index + 1}`, onPress: () => openReceipt(url, baseName) })),
        { text: 'İptal', style: 'cancel' as const },
      ]
    );
  }

  function openAllocationExpense(expenseId: string) {
    const expense = expenseById.get(expenseId);
    if (!expense) {
      Alert.alert('Masraf bulunamadı', 'Bağlı masraf kaydı açılamadı.');
      return;
    }

    setSelectedContribution(null);
    setSelectedExpense(expense);
  }

  const loadKasaData = useCallback(async () => {
    if (!selectedCommunityId) {
      setExpenses([]);
      setContributions([]);
      return;
    }

    setIsLoading(true);
    try {
      const [expenseRows, contributionRows] = await Promise.all([
        getApprovedExpensesByCommunity(selectedCommunityId),
        getContributionsByCommunity(selectedCommunityId),
      ]);

      setExpenses(expenseRows);
      setContributions(contributionRows);
    } catch (error: any) {
      Alert.alert('Kasa verisi hatası', String(error?.message ?? 'Kasa verileri yüklenemedi.'));
      setExpenses([]);
      setContributions([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedCommunityId]);

  useFocusEffect(
    useCallback(() => {
      loadKasaData();
    }, [loadKasaData])
  );

  if (!selectedCommunity) return null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <RefreshableScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 120 }}>
      <TouchableOpacity onPress={goBackBySource} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ paddingVertical: 6, paddingHorizontal: 8, alignSelf: 'flex-start' }}><Text style={{ fontSize: 38, lineHeight: 38 }}>‹</Text></TouchableOpacity>
      <View style={{ marginTop: 10 }}>
        <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text }}>Kasa</Text>
        <Text style={{ color: colors.muted }}>Topluluğun borç ve alacak akışı.</Text>
      </View>

      <Card
        style={{
          marginTop: 20,
          backgroundColor: debtCreditBalance >= 0 ? '#2F7A44' : '#A94842',
        }}
      >
        <Text style={{ color: '#DCE9DE' }}>Borç / Alacak</Text>
        <Text style={{ color: '#fff', fontSize: 32, fontWeight: '900', marginTop: 5 }}>
          {debtCreditBalance >= 0 ? '+' : '-'}{Math.abs(debtCreditBalance).toLocaleString('tr-TR')} ₺
        </Text>
        <Text style={{ color: '#DCE9DE', marginTop: 6 }}>
          {debtCreditBalance >= 0
            ? 'Alacak pozisyonu (kalan Pati Uzat bakiyesi açık borçtan fazla)'
            : 'Borç pozisyonu (açık borç, kalan Pati Uzat bakiyesinden fazla)'}
        </Text>
      </Card>

      <View style={{ marginTop: 18, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontWeight: '800', color: colors.text }}>Kasa Akışı</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: '#9B3A34' }}>
            B: {approvedExpenseTotal.toLocaleString('tr-TR')} ₺
          </Text>
          <Text style={{ fontSize: 12, fontWeight: '800', color: '#2F7A44' }}>
            A: {approvedContributionTotal.toLocaleString('tr-TR')} ₺
          </Text>
        </View>
      </View>

      {isLoading ? (
        <Card>
          <Text style={{ color: colors.muted }}>Kasa akışı yükleniyor...</Text>
        </Card>
      ) : null}

      {!isLoading && financeTimeline.length === 0 ? (
        <Card>
          <Text style={{ color: colors.muted }}>Henüz onaylı finans kaydı bulunmuyor.</Text>
        </Card>
      ) : null}

      {!isLoading && financeTimeline.map((row) => {
        if (row.kind === 'expense') {
          const item = row.expense;
          return (
            <TouchableOpacity key={row.id} onPress={() => setSelectedExpense(item)} activeOpacity={0.9}>
              <Card style={{ marginTop: 8, paddingVertical: 10, backgroundColor: '#FFF4F3', borderWidth: 1, borderColor: '#F1C1BE' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ alignSelf: 'flex-start', fontSize: 10, fontWeight: '800', color: '#9B3A34', backgroundColor: '#FAD9D6', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 }}>BORÇ</Text>
                    <Text style={{ marginTop: 5, fontWeight: '800', color: colors.text }} numberOfLines={1}>{item.title}</Text>
                    <Text style={{ color: colors.muted, marginTop: 2, fontSize: 12 }} numberOfLines={1}>{item.vendorName}</Text>
                    <Text style={{ color: colors.muted, marginTop: 2, fontSize: 12 }} numberOfLines={1}>
                      Yapan: {item.submittedBy ? (memberNameById.get(item.submittedBy) ?? item.submittedBy) : 'Belirtilmedi'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontWeight: '900', color: colors.text, fontSize: 14 }}>{item.amount.toLocaleString('tr-TR')} ₺</Text>
                    <Text style={{ color: colors.muted, fontSize: 10, marginTop: 1 }}>toplam borç</Text>
                    <Text style={{ fontWeight: '900', color: '#9B3A34', fontSize: 14, marginTop: 3 }}>{item.dueAmount.toLocaleString('tr-TR')} ₺</Text>
                    <Text style={{ color: colors.muted, fontSize: 10, marginTop: 1 }}>kalan borç</Text>
                  </View>
                </View>
                <Text style={{ color: colors.muted, marginTop: 5, fontSize: 11 }}>{new Date(item.expenseAt).toLocaleString('tr-TR')}</Text>
              </Card>
            </TouchableOpacity>
          );
        }

        const item = row.contribution;
        return (
          <TouchableOpacity key={row.id} onPress={() => setSelectedContribution(item)} activeOpacity={0.9}>
            <Card style={{ marginTop: 8, paddingVertical: 10, backgroundColor: '#EDF8F0', borderWidth: 1, borderColor: '#B9E1C2' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ alignSelf: 'flex-start', fontSize: 10, fontWeight: '800', color: '#2F7A44', backgroundColor: '#D8F0DE', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 }}>PATI UZAT</Text>
                  <Text style={{ marginTop: 5, fontWeight: '800', color: colors.text }} numberOfLines={1}>Pati destek kaydı</Text>
                  <Text style={{ color: colors.muted, marginTop: 2, fontSize: 12 }} numberOfLines={1}>Üye: {item.contributorUserId ? (memberNameById.get(item.contributorUserId) ?? item.contributorUserId) : (currentUser?.fullName ?? 'Belirtilmedi')}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontWeight: '900', color: colors.text, fontSize: 14 }}>{item.amount.toLocaleString('tr-TR')} ₺</Text>
                  <Text style={{ color: colors.muted, fontSize: 10, marginTop: 1 }}>toplam destek</Text>
                  <Text style={{ fontWeight: '900', color: '#2F7A44', fontSize: 14, marginTop: 3 }}>{item.remainingAmount.toLocaleString('tr-TR')} ₺</Text>
                  <Text style={{ color: colors.muted, fontSize: 10, marginTop: 1 }}>kalan bakiye</Text>
                </View>
              </View>
              <Text style={{ color: colors.muted, marginTop: 5, fontSize: 11 }}>{new Date(item.transferAt).toLocaleString('tr-TR')}</Text>
            </Card>
          </TouchableOpacity>
        );
      })}

      <Modal visible={!!selectedExpense} animationType='slide' onRequestClose={() => setSelectedExpense(null)}>
        <RefreshableScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 40 }}>
          <TouchableOpacity onPress={() => setSelectedExpense(null)}><Text style={{ fontSize: 38, lineHeight: 38 }}>‹</Text></TouchableOpacity>
          <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text, marginTop: 10 }}>Masraf Detayı</Text>
          {selectedExpense ? (
            <Card style={{ marginTop: 18 }}>
              <Text style={{ fontWeight: '800', color: colors.text }}>{selectedExpense.title}</Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>{selectedExpense.vendorName}</Text>
              <Text style={{ color: colors.muted, marginTop: 2 }}>{new Date(selectedExpense.expenseAt).toLocaleString('tr-TR')}</Text>
              <Text style={{ color: colors.muted, marginTop: 2 }}>Durum: {formatExpenseStatus(selectedExpense.approvalStatus)}</Text>
              <Text style={{ color: colors.muted, marginTop: 2 }}>Yapan: {selectedExpense.submittedBy ? (memberNameById.get(selectedExpense.submittedBy) ?? selectedExpense.submittedBy) : 'Belirtilmedi'}</Text>
              <Text style={{ marginTop: 10, fontWeight: '800', color: colors.text }}>Toplam: {selectedExpense.amount.toLocaleString('tr-TR')} ₺</Text>
              <Text style={{ marginTop: 2, fontWeight: '800', color: selectedExpense.dueAmount > 0 ? '#9B3A34' : '#2F7A44' }}>Kalan borç: {selectedExpense.dueAmount.toLocaleString('tr-TR')} ₺</Text>
              {selectedExpense.note ? <Text style={{ color: colors.muted, marginTop: 8 }}>Not: {selectedExpense.note}</Text> : null}
              <TouchableOpacity
                onPress={() => openReceipts(selectedExpense.receiptUrls.length ? selectedExpense.receiptUrls : [selectedExpense.receiptUrl], 'masraf-fisi')}
                style={{ marginTop: 14, backgroundColor: colors.primary, borderRadius: 10, padding: 11 }}
              >
                <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800' }}>Fişi İndir / Aç</Text>
              </TouchableOpacity>
            </Card>
          ) : null}
        </RefreshableScrollView>
      </Modal>

      <Modal visible={!!selectedContribution} animationType='slide' onRequestClose={() => setSelectedContribution(null)}>
        <RefreshableScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 40 }}>
          <TouchableOpacity onPress={() => setSelectedContribution(null)}><Text style={{ fontSize: 38, lineHeight: 38 }}>‹</Text></TouchableOpacity>
          <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text, marginTop: 10 }}>Pati Uzat Detayı</Text>
          {selectedContribution ? (
            <Card style={{ marginTop: 18 }}>
              <Text style={{ fontWeight: '800', color: colors.text }}>{selectedContribution.amount.toLocaleString('tr-TR')} ₺ destek</Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>Tarih: {new Date(selectedContribution.transferAt).toLocaleString('tr-TR')}</Text>
              <Text style={{ color: colors.muted, marginTop: 2 }}>Durum: {formatContributionStatus(selectedContribution.approvalStatus)}</Text>
              <Text style={{ color: colors.muted, marginTop: 2 }}>Üye: {selectedContribution.contributorUserId ? (memberNameById.get(selectedContribution.contributorUserId) ?? selectedContribution.contributorUserId) : (currentUser?.fullName ?? 'Belirtilmedi')}</Text>
              <Text style={{ marginTop: 10, fontWeight: '800', color: colors.text }}>Kalan bakiye: {selectedContribution.remainingAmount.toLocaleString('tr-TR')} ₺</Text>
              {selectedContribution.note ? <Text style={{ color: colors.muted, marginTop: 8 }}>Not: {selectedContribution.note}</Text> : null}

              {selectedContribution.allocations.length > 0 ? (
                <View style={{ marginTop: 10 }}>
                  <Text style={{ fontWeight: '800', color: colors.text }}>Dağıtımlar</Text>
                  {selectedContribution.allocations.map((allocation) => (
                    <TouchableOpacity
                      key={allocation.id}
                      onPress={() => openAllocationExpense(allocation.expenseId)}
                      style={{
                        marginTop: 6,
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: 12,
                        backgroundColor: '#fff',
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={{ color: colors.text, fontWeight: '700' }}>{allocation.expenseTitle}</Text>
                          <Text style={{ color: colors.muted, marginTop: 2 }}>
                            {allocation.amount.toLocaleString('tr-TR')} ₺ · {new Date(allocation.allocatedAt).toLocaleString('tr-TR')}
                          </Text>
                        </View>
                        <Text style={{ color: colors.muted, fontSize: 18 }}>›</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

              <TouchableOpacity
                onPress={() => openReceipts(selectedContribution.receiptUrls.length ? selectedContribution.receiptUrls : [selectedContribution.receiptUrl], 'pati-uzat-dekont')}
                style={{ marginTop: 14, backgroundColor: colors.primary, borderRadius: 10, padding: 11 }}
              >
                <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800' }}>Dekontu İndir / Aç</Text>
              </TouchableOpacity>
            </Card>
          ) : null}
        </RefreshableScrollView>
      </Modal>
      </RefreshableScrollView>
      <BottomBannerAd />
    </View>
  );
}
