import { router } from 'expo-router';
import { ScrollView, View, Text, TouchableOpacity } from 'react-native';
import { Card } from '../src/components/Card';
import { colors } from '../src/theme';
import { animals } from '../src/data/mock';

export default function Animal() {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: 58 }}>
      <TouchableOpacity onPress={() => router.back()}><Text style={{ fontSize: 30 }}>‹</Text></TouchableOpacity>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
        <View><Text style={{ fontSize: 27, fontWeight: '800', color: colors.text }}>Can Dostlar</Text><Text style={{ color: colors.muted }}>24 kayıtlı kedi ve köpek</Text></View>
        <TouchableOpacity style={{ backgroundColor: colors.primary, padding: 13, borderRadius: 15 }}><Text style={{ color: '#fff', fontWeight: '800' }}>＋</Text></TouchableOpacity>
      </View>
      <Card style={{ marginTop: 20 }}>
        <Text style={{ fontWeight: '800', color: colors.text }}>🐱 Misket</Text>
        <Text style={{ color: colors.muted, marginTop: 5 }}>Tekir · Dişi · Kısırlaştırılmış</Text>
        <Text style={{ color: colors.text, marginTop: 10 }}>📍 Moda Parkı · Son besleme bugün 09:42</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 13 }}>
          <View style={{ backgroundColor: colors.primarySoft, borderRadius: 10, padding: 8 }}><Text style={{ color: colors.primary, fontSize: 12 }}>Aşıları güncel</Text></View>
          <View style={{ backgroundColor: '#FFF0D9', borderRadius: 10, padding: 8 }}><Text style={{ color: '#94601F', fontSize: 12 }}>Takipte</Text></View>
        </View>
      </Card>
      <Card style={{ marginTop: 10 }}>
        <Text style={{ fontWeight: '800', color: colors.text }}>🐶 Tarçın</Text>
        <Text style={{ color: colors.muted, marginTop: 5 }}>Kahverengi · Erkek</Text>
        <Text style={{ color: colors.text, marginTop: 10 }}>📍 Bahariye · Son besleme dün 18:20</Text>
        <Text style={{ color: colors.accent, marginTop: 10, fontWeight: '700' }}>Mama bekliyor</Text>
      </Card>
    </ScrollView>
  );
}
