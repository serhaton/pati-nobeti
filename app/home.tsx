import { router } from 'expo-router';
import { ScrollView, View, Text, TouchableOpacity } from 'react-native';
import { useAuth } from '../src/context/AuthContext';
import { Card } from '../src/components/Card';
import { Logo } from '../src/components/Logo';
import { useCommunity } from '../src/context/CommunityContext';
import { colors } from '../src/theme';
import { animals, expenses } from '../src/data/mock';

export default function Home() {
  const { selectedCommunity } = useCommunity();
  const { currentUser } = useAuth();
  const totalDebt = expenses.reduce((s, x) => s + x.amount - x.paid, 0);

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
        <Card style={{ flex: 1 }}>
          <Text style={{ fontSize: 25 }}>🐾</Text>
          <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text, marginTop: 7 }}>12</Text>
          <Text style={{ color: colors.muted }}>Bugün beslenen</Text>
        </Card>
        <Card style={{ flex: 1 }}>
          <Text style={{ fontSize: 25 }}>💳</Text>
          <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text, marginTop: 7 }}>{totalDebt.toLocaleString('tr-TR')} ₺</Text>
          <Text style={{ color: colors.muted }}>Açık borç</Text>
        </Card>
      </View>

      <Text style={{ fontSize: 19, fontWeight: '800', color: colors.text, marginTop: 28, marginBottom: 12 }}>Toplulugum</Text>
      <TouchableOpacity onPress={() => router.push('/community')}>
        <Card style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ fontWeight: '800', fontSize: 17, color: colors.text }}>{selectedCommunity.name}</Text>
              <Text style={{ color: colors.muted, marginTop: 5 }}>{selectedCommunity.neighborhood} · {selectedCommunity.members} uye · {selectedCommunity.animals} can</Text>
            </View>
            <Text style={{ fontSize: 28 }}>›</Text>
          </View>
        </Card>
      </TouchableOpacity>

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

      <Text style={{ fontSize: 19, fontWeight: '800', color: colors.text, marginTop: 25, marginBottom: 12 }}>Bugünün canları</Text>
      {animals.map(a => (
        <Card key={a.id} style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 52, height: 52, borderRadius: 17, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 27 }}>{a.type === 'Kedi' ? '🐱' : '🐶'}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ fontWeight: '800', color: colors.text }}>{a.name}</Text>
              <Text style={{ color: colors.muted }}>{a.color} · {a.location}</Text>
            </View>
            <Text style={{ color: a.fedToday ? colors.primary : colors.accent, fontWeight: '700' }}>
              {a.fedToday ? '✓ Beslendi' : '• Bekliyor'}
            </Text>
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}
