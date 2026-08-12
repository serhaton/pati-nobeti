import { router } from 'expo-router';
import { ScrollView, View, Text, TouchableOpacity } from 'react-native';
import { useAuth } from '../src/context/AuthContext';
import { Card } from '../src/components/Card';
import { Logo } from '../src/components/Logo';
import { useCommunity } from '../src/context/CommunityContext';
import { colors } from '../src/theme';
import { expenses } from '../src/data/mock';
import { getTodayFeedingRecordCountByCommunity } from '../src/data/feedingPointStore';

export default function Home() {
  const { selectedCommunity } = useCommunity();
  const { currentUser } = useAuth();
  const totalDebt = expenses.reduce((s, x) => s + x.amount - x.paid, 0);
  const isCommunityAdmin = !!currentUser && selectedCommunity?.adminUserIds.includes(currentUser.id);
  const todayFedCount = selectedCommunity ? getTodayFeedingRecordCountByCommunity(selectedCommunity.id) : 0;

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
            <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text, marginTop: 7 }}>{totalDebt.toLocaleString('tr-TR')} ₺</Text>
            <Text style={{ color: colors.muted }}>Açık borç</Text>
          </Card>
        </TouchableOpacity>
      </View>

      <Text style={{ fontSize: 19, fontWeight: '800', color: colors.text, marginTop: 18, marginBottom: 12 }}>Hızlı işlemler</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {[
          ['🗺️','Haritayı aç','/map'],
          ['🐱','Can dost ekle','/animal'],
          ['🍚','Besleme kaydı','/feeding'],
          ['🧾','Masraf ekle','/expenses']
        ].map(([icon, label, path]) => (
          <TouchableOpacity key={label} onPress={() => router.push(path as any)} style={{ width: '48%' }}>
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
