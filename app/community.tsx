import { router } from 'expo-router';
import { ScrollView, View, Text, TouchableOpacity } from 'react-native';
import { Card } from '../src/components/Card';
import { useCommunity } from '../src/context/CommunityContext';
import { useAuth } from '../src/context/AuthContext';
import { colors } from '../src/theme';
import { joinRequests } from '../src/data/mock';

export default function Community() {
  const { selectedCommunity } = useCommunity();
  const { currentUser } = useAuth();
  const isCommunityAdmin = !!currentUser && selectedCommunity?.adminUserIds.includes(currentUser.id);

  if (!selectedCommunity) return null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 40 }}>
      <TouchableOpacity onPress={() => router.back()}><Text style={{ fontSize: 30 }}>‹</Text></TouchableOpacity>
      <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text, marginTop: 12 }}>{selectedCommunity.name}</Text>
      <Text style={{ color: colors.muted, marginTop: 5 }}>{selectedCommunity.neighborhood} · {selectedCommunity.members} uye · {selectedCommunity.animals} can dost</Text>

      <View style={{ flexDirection: 'row', gap: 9, marginTop: 22 }}>
        {[
          [String(selectedCommunity.animals),'Can Dost'],
          ['12','Besleme'],
          [`${selectedCommunity.debt.toLocaleString('tr-TR')} ₺`,'Acik Borc']
        ].map(([v,l]) => <Card key={l} style={{ flex: 1, padding: 13 }}><Text style={{ fontWeight: '800', fontSize: 18, color: colors.text }}>{v}</Text><Text style={{ color: colors.muted, marginTop: 3, fontSize: 12 }}>{l}</Text></Card>)}
      </View>

      <TouchableOpacity onPress={() => router.push('/community-select')} style={{ marginTop: 12, backgroundColor: colors.primarySoft, borderRadius: 12, padding: 10 }}>
        <Text style={{ color: colors.primary, textAlign: 'center', fontWeight: '800' }}>Toplulugu Degistir</Text>
      </TouchableOpacity>

      {isCommunityAdmin ? (
        <>
          <Text style={{ fontSize: 19, fontWeight: '800', color: colors.text, marginTop: 28, marginBottom: 12 }}>Yönetici işlemleri</Text>
          <Card>
            <Text style={{ fontWeight: '800', color: colors.text, fontSize: 16 }}>2 yeni katılım isteği</Text>
            {joinRequests.map(r => (
              <View key={r.id} style={{ paddingTop: 15, marginTop: 13, borderTopWidth: 1, borderTopColor: colors.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontWeight: '800', color: colors.primary }}>{r.initials}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ fontWeight: '800', color: colors.text }}>{r.name}</Text>
                    <Text style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}>{r.note}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 11 }}>
                  <TouchableOpacity style={{ flex: 1, backgroundColor: colors.primary, borderRadius: 12, padding: 11 }}><Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>Onayla</Text></TouchableOpacity>
                  <TouchableOpacity style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 11 }}><Text style={{ color: colors.text, textAlign: 'center', fontWeight: '700' }}>Reddet</Text></TouchableOpacity>
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <Text style={{ fontSize: 19, fontWeight: '800', color: colors.text, marginTop: 28, marginBottom: 12 }}>Topluluk menüsü</Text>
      {[
        ['🗺️','Harita ve besleme noktaları','/map'],
        ['🐾','Can dostlar','/animal'],
        ['💰','Gelir / gider ve borçlar','/expenses'],
        ['📣','Duyurular','/community']
      ].map(([icon,label,path]) => (
        <TouchableOpacity key={label} onPress={() => router.push(path as any)}>
          <Card style={{ marginBottom: 9 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 24, width: 38 }}>{icon}</Text>
              <Text style={{ fontWeight: '700', color: colors.text, flex: 1 }}>{label}</Text>
              <Text style={{ fontSize: 23 }}>›</Text>
            </View>
          </Card>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}
