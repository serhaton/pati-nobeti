import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { RefreshableScrollView } from '../src/components/RefreshableScrollView';
import { Card } from '../src/components/Card';
import { useAuth } from '../src/context/AuthContext';
import { useCommunity } from '../src/context/CommunityContext';
import { getAnimalById } from '../src/data/animalStore';
import { colors } from '../src/theme';

export default function AnimalDetailScreen() {
  const params = useLocalSearchParams<{ id?: string; source?: string }>();
  const { currentUser } = useAuth();
  const { selectedCommunity } = useCommunity();

  const animal = useMemo(() => {
    if (!params.id) return null;
    return getAnimalById(params.id);
  }, [params.id]);

  const isCommunityAdmin = !!currentUser && !!selectedCommunity?.adminUserIds.includes(currentUser.id);
  const isReadOnlyFromHome = params.source === 'home';
  const source = Array.isArray(params.source) ? params.source[0] : params.source;

  function goBackToAnimalList() {
    if (source) {
      router.replace({ pathname: '/animal', params: { source } });
      return;
    }
    router.replace('/animal');
  }

  if (!animal) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 58 }}>
        <TouchableOpacity onPress={goBackToAnimalList} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ paddingVertical: 6, paddingHorizontal: 8, alignSelf: 'flex-start' }}><Text style={{ fontSize: 38, lineHeight: 38 }}>‹</Text></TouchableOpacity>
        <Text style={{ marginTop: 12, color: colors.text, fontSize: 24, fontWeight: '800' }}>Can dost bulunamadı</Text>
      </View>
    );
  }

  return (
    <RefreshableScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 36 }}>
      <TouchableOpacity onPress={goBackToAnimalList} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ paddingVertical: 6, paddingHorizontal: 8, alignSelf: 'flex-start' }}><Text style={{ fontSize: 38, lineHeight: 38 }}>‹</Text></TouchableOpacity>

      <View style={{ marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text }}>{animal.type === 'Kedi' ? '🐱' : '🐶'} {animal.name}</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{animal.breed} · {animal.gender}</Text>
        </View>
        {isCommunityAdmin && !isReadOnlyFromHome ? (
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/animal-edit', params: { id: animal.id, source: params.source } })}
            style={{ backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 }}
          >
            <Text style={{ color: '#fff', fontWeight: '800' }}>Düzenle</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <Card style={{ marginTop: 16 }}>
        <Text style={{ fontWeight: '800', color: colors.text }}>Temel bilgiler</Text>
        <Text style={{ marginTop: 8, color: colors.muted }}>Tür: {animal.type}</Text>
        <Text style={{ marginTop: 4, color: colors.muted }}>Cins: {animal.breed}</Text>
        <Text style={{ marginTop: 4, color: colors.muted }}>Cinsiyet: {animal.gender}</Text>
        <Text style={{ marginTop: 4, color: colors.muted }}>Kısırlaştırılmış: {animal.isSterilized ? 'Evet' : 'Hayır'}</Text>
        <Text style={{ marginTop: 4, color: colors.muted }}>Doğum tarihi: {animal.birthDate}</Text>
        <Text style={{ marginTop: 4, color: colors.muted }}>Konum: {animal.location}</Text>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <Text style={{ fontWeight: '800', color: colors.text }}>Aşı takvimi</Text>
        {animal.vaccinationSchedule.length > 0 ? (
          animal.vaccinationSchedule.map((item) => (
            <View key={item.id} style={{ marginTop: 9, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{item.name}</Text>
              <Text style={{ color: colors.muted, marginTop: 2 }}>{item.date}</Text>
              {item.note ? <Text style={{ color: colors.muted, marginTop: 2 }}>Not: {item.note}</Text> : null}
            </View>
          ))
        ) : (
          <Text style={{ marginTop: 8, color: colors.muted }}>Aşı kaydı bulunmuyor.</Text>
        )}
      </Card>

      <Card style={{ marginTop: 12 }}>
        <Text style={{ fontWeight: '800', color: colors.text }}>Tedavi takvimi</Text>
        {animal.treatmentSchedule.length > 0 ? (
          animal.treatmentSchedule.map((item) => (
            <View key={item.id} style={{ marginTop: 9, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{item.name}</Text>
              <Text style={{ color: colors.muted, marginTop: 2 }}>{item.date}</Text>
              {item.note ? <Text style={{ color: colors.muted, marginTop: 2 }}>Not: {item.note}</Text> : null}
            </View>
          ))
        ) : (
          <Text style={{ marginTop: 8, color: colors.muted }}>Tedavi kaydı bulunmuyor.</Text>
        )}
      </Card>

      <Card style={{ marginTop: 12 }}>
        <Text style={{ fontWeight: '800', color: colors.text }}>Fotoğraflar</Text>
        {animal.photoUris.length > 0 ? (
          <RefreshableScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {animal.photoUris.map((uri, index) => (
                <Image key={`${uri}-${index}`} source={{ uri }} style={{ width: 110, height: 110, borderRadius: 12, backgroundColor: '#E7ECE8' }} />
              ))}
            </View>
          </RefreshableScrollView>
        ) : (
          <Text style={{ marginTop: 8, color: colors.muted }}>Fotoğraf eklenmemiş.</Text>
        )}
      </Card>
    </RefreshableScrollView>
  );
}
