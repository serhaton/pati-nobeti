import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, TextInput } from 'react-native';
import { Card } from '../src/components/Card';
import { useAuth } from '../src/context/AuthContext';
import { useCommunity } from '../src/context/CommunityContext';
import { CommunityAnimal, getAnimalsByCommunity } from '../src/data/animalStore';
import { colors } from '../src/theme';

export default function Animal() {
  const { currentUser } = useAuth();
  const { selectedCommunity } = useCommunity();
  const [searchText, setSearchText] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setRefreshTick((value) => value + 1);
    }, [])
  );

  const isCommunityAdmin = !!currentUser && !!selectedCommunity?.adminUserIds.includes(currentUser.id);

  const communityAnimals = useMemo<CommunityAnimal[]>(() => {
    if (!selectedCommunity) return [];
    return getAnimalsByCommunity(selectedCommunity.id, searchText);
  }, [refreshTick, searchText, selectedCommunity]);

  if (!selectedCommunity) return null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: 58 }}>
      <TouchableOpacity onPress={() => router.back()}><Text style={{ fontSize: 30 }}>‹</Text></TouchableOpacity>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
        <View>
          <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text }}>Can Dostlar</Text>
          <Text style={{ color: colors.muted }}>{communityAnimals.length} kayıtlı kedi ve köpek</Text>
        </View>
        {isCommunityAdmin ? (
          <TouchableOpacity onPress={() => router.push('/animal-create')} style={{ backgroundColor: colors.primary, padding: 13, borderRadius: 15 }}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>＋</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <TextInput
        value={searchText}
        onChangeText={setSearchText}
        placeholder="Can dostlarda ara"
        style={{ marginTop: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 14, backgroundColor: '#fff' }}
      />

      {communityAnimals.length > 0 ? (
        communityAnimals.map((animal, index) => (
          <TouchableOpacity
            key={animal.id}
            onPress={() => router.push({ pathname: '/animal-detail', params: { id: animal.id } })}
          >
            <Card style={{ marginTop: index === 0 ? 14 : 10 }}>
              <Text style={{ fontWeight: '800', color: colors.text }}>{animal.type === 'Kedi' ? '🐱' : '🐶'} {animal.name}</Text>
              <Text style={{ color: colors.muted, marginTop: 5 }}>{animal.breed} · {animal.gender} · {animal.isSterilized ? 'Kısırlaştırılmış' : 'Kısırlaştırılmamış'}</Text>
              <Text style={{ color: colors.text, marginTop: 10 }}>📍 {animal.location}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 13 }}>
                <View style={{ backgroundColor: colors.primarySoft, borderRadius: 10, padding: 8 }}>
                  <Text style={{ color: colors.primary, fontSize: 12 }}>Aşı: {animal.vaccinationSchedule.length} kayıt</Text>
                </View>
                <View style={{ backgroundColor: '#FFF0D9', borderRadius: 10, padding: 8 }}>
                  <Text style={{ color: '#94601F', fontSize: 12 }}>Tedavi: {animal.treatmentSchedule.length} kayıt</Text>
                </View>
              </View>
            </Card>
          </TouchableOpacity>
        ))
      ) : (
        <Card style={{ marginTop: 14 }}>
          <Text style={{ color: colors.muted }}>Aramaya uygun can dost bulunamadı.</Text>
        </Card>
      )}
    </ScrollView>
  );
}
