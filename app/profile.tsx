import { router } from 'expo-router';
import { View, Text, TouchableOpacity } from 'react-native';
import { useAuth } from '../src/context/AuthContext';
import { Card } from '../src/components/Card';
import { useCommunity } from '../src/context/CommunityContext';
import { colors } from '../src/theme';

export default function Profile() {
  const { currentUser, signOut } = useAuth();
  const { selectedCommunity, clearSelectedCommunity } = useCommunity();

  async function handleLogout() {
    clearSelectedCommunity();
    await signOut();
    router.replace('/');
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 58 }}>
      <TouchableOpacity onPress={() => router.back()}><Text style={{ fontSize: 30 }}>‹</Text></TouchableOpacity>
      <View style={{ alignItems: 'center', marginTop: 20 }}>
        <View style={{ width: 78, height: 78, borderRadius: 28, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 36 }}>👤</Text></View>
        <Text style={{ fontSize: 23, fontWeight: '800', color: colors.text, marginTop: 12 }}>{currentUser?.fullName ?? 'Gonullu'}</Text>
        <Text style={{ color: colors.muted }}>Seçili: {selectedCommunity?.name ?? '-'}</Text>
      </View>
      <Card style={{ marginTop: 25 }}>
        {['Topluluklarim','Bildirimler','Odeme hesaplarim','Ayarlar'].map(x => (
          <TouchableOpacity
            key={x}
            onPress={() => {
              if (x === 'Topluluklarim') router.push('/community-select');
            }}
            style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}
          >
            <Text style={{ color: colors.text, fontWeight: '700' }}>{x}</Text>
          </TouchableOpacity>
        ))}
      </Card>

      <TouchableOpacity
        onPress={() => {
          clearSelectedCommunity();
          router.replace('/community-select');
        }}
        style={{ marginTop: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 13 }}
      >
        <Text style={{ color: colors.text, fontWeight: '700', textAlign: 'center' }}>Topluluk Seçimini Sıfırla</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handleLogout}
        style={{ marginTop: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.danger, borderRadius: 12, padding: 13 }}
      >
        <Text style={{ color: colors.danger, fontWeight: '800', textAlign: 'center' }}>Cikis Yap</Text>
      </TouchableOpacity>
    </View>
  );
}
