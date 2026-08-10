import { router } from 'expo-router';
import { ScrollView, View, Text, TouchableOpacity } from 'react-native';
import { Card } from '../src/components/Card';
import { colors } from '../src/theme';
import { expenses } from '../src/data/mock';

export default function Expenses() {
  const open = expenses.reduce((s,x) => s + x.amount - x.paid, 0);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 40 }}>
      <TouchableOpacity onPress={() => router.back()}><Text style={{ fontSize: 30 }}>‹</Text></TouchableOpacity>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
        <View><Text style={{ fontSize: 27, fontWeight: '800', color: colors.text }}>Kasa & Borçlar</Text><Text style={{ color: colors.muted }}>Şeffaf topluluk finansı</Text></View>
        <TouchableOpacity style={{ backgroundColor: colors.primary, padding: 13, borderRadius: 15 }}><Text style={{ color: '#fff', fontWeight: '800' }}>＋</Text></TouchableOpacity>
      </View>
      <Card style={{ marginTop: 20, backgroundColor: colors.primary }}>
        <Text style={{ color: '#DCE9DE' }}>Toplam açık borç</Text>
        <Text style={{ color: '#fff', fontSize: 32, fontWeight: '900', marginTop: 5 }}>{open.toLocaleString('tr-TR')} ₺</Text>
        <Text style={{ color: '#DCE9DE', marginTop: 6 }}>Mama + veteriner + diğer giderler</Text>
      </Card>
      {expenses.map(e => {
        const remaining = e.amount - e.paid;
        return (
          <Card key={e.id} style={{ marginTop: 11 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', color: colors.text }}>{e.title}</Text>
                <Text style={{ color: colors.muted, marginTop: 4 }}>{e.vendor} · {e.date}</Text>
              </View>
              <Text style={{ fontWeight: '900', color: remaining ? colors.danger : colors.primary }}>{remaining ? `${remaining.toLocaleString('tr-TR')} ₺ kaldı` : 'Ödendi'}</Text>
            </View>
            <View style={{ marginTop: 12, height: 8, backgroundColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
              <View style={{ width: `${Math.min(100, (e.paid/e.amount)*100)}%`, height: 8, backgroundColor: colors.primary }} />
            </View>
            <Text style={{ color: colors.muted, marginTop: 7, fontSize: 12 }}>{e.paid.toLocaleString('tr-TR')} ₺ ödendi / {e.amount.toLocaleString('tr-TR')} ₺</Text>
          </Card>
        )
      })}
      <TouchableOpacity style={{ marginTop: 18, borderWidth: 1, borderColor: colors.primary, borderRadius: 15, padding: 15 }}>
        <Text style={{ textAlign: 'center', color: colors.primary, fontWeight: '800' }}>🧾 Fiş fotoğrafı yükle ve masraf ekle</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
