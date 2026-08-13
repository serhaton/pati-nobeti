import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity } from 'react-native';
import { useAuth } from '../src/context/AuthContext';
import { Card } from '../src/components/Card';
import { Logo } from '../src/components/Logo';
import { useCommunity } from '../src/context/CommunityContext';
import { colors } from '../src/theme';
import { getTodayFeedingRecordCountByCommunity } from '../src/data/feedingPointStore';
import { ExpenseRecord, getApprovedExpensesByCommunity } from '../src/services/expenseService';
import { ContributionRecord, getContributionsByCommunity } from '../src/services/contributionService';

export default function Home() {
  const { selectedCommunity } = useCommunity();
  const { currentUser } = useAuth();
  const [approvedExpenses, setApprovedExpenses] = useState<ExpenseRecord[]>([]);
  const [contributions, setContributions] = useState<ContributionRecord[]>([]);

  const isCommunityAdmin = !!currentUser && selectedCommunity?.adminUserIds.includes(currentUser.id);
  const todayFedCount = selectedCommunity ? getTodayFeedingRecordCountByCommunity(selectedCommunity.id) : 0;

  const openDebt = useMemo(
    () => approvedExpenses.reduce((total, item) => total + item.dueAmount, 0),
    [approvedExpenses]
  );

  const approvedContributionRemainingTotal = useMemo(
    () => contributions
      .filter((item) => item.approvalStatus === 'approved')
      .reduce((total, item) => total + item.remainingAmount, 0),
    [contributions]
  );

  const debtCreditBalance = useMemo(
    () => approvedContributionRemainingTotal - openDebt,
    [approvedContributionRemainingTotal, openDebt]
  );

  const loadFinanceSummary = useCallback(async () => {
    if (!selectedCommunity?.id) {
      setApprovedExpenses([]);
      setContributions([]);
      return;
    }

    try {
      const [approvedRows, contributionRows] = await Promise.all([
        getApprovedExpensesByCommunity(selectedCommunity.id),
        getContributionsByCommunity(selectedCommunity.id),
      ]);

      setApprovedExpenses(approvedRows);
      setContributions(contributionRows);
    } catch {
      setApprovedExpenses([]);
      setContributions([]);
    }
  }, [selectedCommunity?.id]);

  useFocusEffect(
    useCallback(() => {
      loadFinanceSummary();
    }, [loadFinanceSummary])
  );

  if (!selectedCommunity) return null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 35 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View>
          <Logo small />
          <Text style={{ color: colors.primary, marginTop: 6, fontWeight: '700' }}>{selectedCommunity.name}</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/profile')}>
          <Text style={{ fontSize: 28 }}>👤</Text>
        </TouchableOpacity>
      </View>

      <View style={{ marginTop: 26 }}>
        <Text style={{ color: colors.muted, fontSize: 14 }}>Gunaydin {currentUser?.fullName ?? 'Gonullu'} 👋</Text>
        <Text style={{ color: colors.text, fontSize: 27, fontWeight: '800', marginTop: 5 }}>Bugün neler oldu?</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
        <TouchableOpacity onPress={() => router.push('/feeding')} style={{ flex: 1 }}>
          <Card style={{ flex: 1 }}>
            <Text style={{ fontSize: 25 }}>🥣</Text>
            <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text, marginTop: 7 }}>{todayFedCount}</Text>
            <Text style={{ color: colors.muted }}>Bugünkü besleme kaydı</Text>
          </Card>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/expenses')} style={{ flex: 1 }}>
          <Card style={{ flex: 1 }}>
            <Text style={{ fontSize: 25 }}>💳</Text>
            <Text
              style={{
                fontSize: 20,
                fontWeight: '800',
                color: debtCreditBalance >= 0 ? '#2F7A44' : colors.danger,
                marginTop: 7,
              }}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {debtCreditBalance >= 0 ? '+' : '-'}{Math.abs(debtCreditBalance).toLocaleString('tr-TR')} ₺
            </Text>
            <Text style={{ color: colors.muted }}>Borç / Alacak</Text>
          </Card>
        </TouchableOpacity>
      </View>

      <Text style={{ fontSize: 19, fontWeight: '800', color: colors.text, marginTop: 18, marginBottom: 12 }}>Hızlı işlemler</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {[
          ['🗺️','Haritayı aç','/map'],
          ['🐱','Can dost ekle','/animal'],
          ['🍚','Besleme kaydı','/feeding'],
          ['🧾','Masraf ekle','/expenses'],
          ['🤝','Pati Uzat','/pati-uzat']
        ].map(([icon, label, path]) => (
          <TouchableOpacity
            key={label}
            onPress={() => {
              if (path === '/pati-uzat') {
                router.push({ pathname: '/pati-uzat', params: { view: 'mine' } });
                return;
              }
              router.push(path as any);
            }}
            style={{ width: '48%' }}
          >
            <Card>
              <Text style={{ fontSize: 26 }}>{icon}</Text>
              <Text style={{ fontWeight: '700', marginTop: 9, color: colors.text }}>{label}</Text>
            </Card>
          </TouchableOpacity>
        ))}
      </View>

      {isCommunityAdmin ? (
        <>
          <Text style={{ fontSize: 19, fontWeight: '800', color: colors.text, marginTop: 25, marginBottom: 12 }}>Yönetici işlemleri</Text>
          <TouchableOpacity onPress={() => router.push('/community')}>
            <Card style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ fontWeight: '800', fontSize: 17, color: colors.text }}>{selectedCommunity.name}</Text>
                  <Text style={{ color: colors.muted, marginTop: 5 }}>{selectedCommunity.neighborhood}</Text>
                  <Text style={{ color: colors.muted, marginTop: 2 }}>{selectedCommunity.members} üye · {selectedCommunity.animals} can</Text>
                </View>
                <Text style={{ fontSize: 28 }}>›</Text>
              </View>
            </Card>
          </TouchableOpacity>
        </>
      ) : null}
    </ScrollView>
  );
}
