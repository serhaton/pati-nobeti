import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Image } from 'react-native';
import { RefreshableScrollView } from '../src/components/RefreshableScrollView';
import { Card } from '../src/components/Card';
import { BottomBannerAd } from '../src/components/BottomBannerAd';
import { useAuth } from '../src/context/AuthContext';
import { useCommunity } from '../src/context/CommunityContext';
import { CommunityAnimal, getAnimalsByCommunity } from '../src/data/animalStore';
import { colors } from '../src/theme';
import { NOT_SPECIFIED_LABEL } from '../src/constants/userLabels';

export default function Animal() {
  const params = useLocalSearchParams<{ source?: string }>();
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
  const source = Array.isArray(params.source) ? params.source[0] : params.source;
  const isReadOnlyFromHome = source === 'home';

  function goBackBySource() {
    if (source === 'home') {
      router.replace('/home');
      return;
    }

    if (source === 'community') {
      router.replace('/community');
      return;
    }

    router.back();
  }

  const communityAnimals = useMemo<CommunityAnimal[]>(() => {
    if (!selectedCommunity) return [];
    return getAnimalsByCommunity(selectedCommunity.id, searchText);
  }, [refreshTick, searchText, selectedCommunity]);

  if (!selectedCommunity) return null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <RefreshableScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 120 }}>
      <TouchableOpacity onPress={goBackBySource} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ paddingVertical: 6, paddingHorizontal: 8, alignSelf: 'flex-start' }}><Text style={{ fontSize: 38, lineHeight: 38 }}>‹</Text></TouchableOpacity>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
        <View>
          <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text }}>Can Dostlar</Text>
          <Text style={{ color: colors.muted }}>{communityAnimals.length} kayıtlı kedi ve köpek</Text>
        </View>
        {isCommunityAdmin && !isReadOnlyFromHome ? (
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/animal-create', params: source ? { source } : undefined })}
            style={{ backgroundColor: colors.primary, padding: 13, borderRadius: 15 }}
          >
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
            onPress={() => router.push({ pathname: '/animal-detail', params: { id: animal.id, source } })}
          >
            <Card style={{ marginTop: index === 0 ? 14 : 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', color: colors.text }}>{animal.type === 'Kedi' ? '🐱' : '🐶'} {animal.name}</Text>
                  <Text style={{ color: colors.muted, marginTop: 5 }}>{animal.breed} · {animal.gender} · {animal.isSterilized ? 'Kısırlaştırılmış' : 'Kısırlaştırılmamış'}</Text>
                  <Text style={{ color: colors.text, marginTop: 10 }}>📍 {animal.location || NOT_SPECIFIED_LABEL}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 13 }}>
                    <View style={{ backgroundColor: colors.primarySoft, borderRadius: 10, padding: 8 }}>
                      <Text style={{ color: colors.primary, fontSize: 12 }}>Aşı: {animal.vaccinationSchedule.length} kayıt</Text>
                    </View>
                    <View style={{ backgroundColor: '#FFF0D9', borderRadius: 10, padding: 8 }}>
                      <Text style={{ color: '#94601F', fontSize: 12 }}>Tedavi: {animal.treatmentSchedule.length} kayıt</Text>
                    </View>
                  </View>
                </View>

                {animal.photoUris.length > 0 ? (
                  <Image
                    source={{ uri: animal.photoUris[0] }}
                    style={{ width: 76, height: 76, borderRadius: 12, backgroundColor: '#E7ECE8' }}
                  />
                ) : (
                  <View
                    style={{
                      width: 76,
                      height: 76,
                      borderRadius: 12,
                      backgroundColor: colors.primarySoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 28 }}>{animal.type === 'Kedi' ? '🐱' : '🐶'}</Text>
                  </View>
                )}
              </View>
            </Card>
          </TouchableOpacity>
        ))
      ) : (
        <Card style={{ marginTop: 14 }}>
          <Text style={{ color: colors.muted }}>Aramaya uygun can dost bulunamadı.</Text>
        </Card>
      )}
      </RefreshableScrollView>
      <BottomBannerAd />
    </View>
  );
}
