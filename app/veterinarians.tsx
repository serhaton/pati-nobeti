import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Card } from '../src/components/Card';
import { useAuth } from '../src/context/AuthContext';
import { useCommunity } from '../src/context/CommunityContext';
import { colors } from '../src/theme';
import {
  deleteCommunityVeterinarianSelection,
  getGlobalVeterinarians,
  getVeterinariansByCommunity,
  GlobalVeterinarianRecord,
  upsertCommunityVeterinarian,
  VeterinarianRecord,
} from '../src/services/veterinarianService';

export default function VeterinariansScreen() {
  const { currentUser } = useAuth();
  const { selectedCommunity } = useCommunity();

  const [items, setItems] = useState<VeterinarianRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingGlobal, setIsLoadingGlobal] = useState(false);

  const [showSelectModal, setShowSelectModal] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [globalItems, setGlobalItems] = useState<GlobalVeterinarianRecord[]>([]);
  const [searchText, setSearchText] = useState('');
  const [visibleGlobalCount, setVisibleGlobalCount] = useState(4);
  const [selectedGlobalVeterinarian, setSelectedGlobalVeterinarian] = useState<GlobalVeterinarianRecord | null>(null);
  const [overrideVeterinarianName, setOverrideVeterinarianName] = useState('');
  const [overridePhone, setOverridePhone] = useState('');
  const [overrideNotes, setOverrideNotes] = useState('');

  const isCommunityAdmin = !!currentUser && !!selectedCommunity?.adminUserIds.includes(currentUser.id);
  const selectedCommunityId = selectedCommunity?.id ?? null;

  const filteredGlobalItems = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase('tr-TR');
    if (!query) return globalItems;

    return globalItems.filter((item) => {
      const haystack = [item.clinicName, item.defaultVeterinarianName, item.locationLabel, item.city, item.district]
        .join(' ')
        .toLocaleLowerCase('tr-TR');
      return haystack.includes(query);
    });
  }, [globalItems, searchText]);

  const visibleGlobalItems = useMemo(() => {
    return filteredGlobalItems.slice(0, visibleGlobalCount);
  }, [filteredGlobalItems, visibleGlobalCount]);

  useEffect(() => {
    setVisibleGlobalCount(4);
  }, [searchText, globalItems.length]);

  const loadMoreGlobalItems = useCallback(() => {
    if (visibleGlobalCount >= filteredGlobalItems.length) return;
    setVisibleGlobalCount((current) => Math.min(current + 4, filteredGlobalItems.length));
  }, [filteredGlobalItems.length, visibleGlobalCount]);

  async function openMapLocation(item: { clinicName: string; latitude: number; longitude: number }) {
    const label = encodeURIComponent(item.clinicName);
    const coordinates = `${item.latitude},${item.longitude}`;

    try {
      if (Platform.OS === 'ios') {
        const deepLink = `maps://?q=${label}&ll=${coordinates}`;
        const webFallback = `https://maps.apple.com/?q=${label}&ll=${coordinates}`;

        const canOpenDeepLink = await Linking.canOpenURL(deepLink);
        await Linking.openURL(canOpenDeepLink ? deepLink : webFallback);
        return;
      }

      const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coordinates)}`;
      await Linking.openURL(googleMapsUrl);
    } catch {
      Alert.alert('Harita acilamadi', 'Harita uygulamasi acilamadi.');
    }
  }

  const loadVeterinarians = useCallback(async () => {
    if (!selectedCommunityId) {
      setItems([]);
      return;
    }

    setIsLoading(true);
    try {
      const rows = await getVeterinariansByCommunity(selectedCommunityId);
      setItems(rows);
    } catch (error: any) {
      Alert.alert('Veteriner listesi hatasi', String(error?.message ?? 'Veterinerler yuklenemedi.'));
    } finally {
      setIsLoading(false);
    }
  }, [selectedCommunityId]);

  useFocusEffect(
    useCallback(() => {
      loadVeterinarians();
    }, [loadVeterinarians])
  );

  async function loadGlobalCandidates(): Promise<GlobalVeterinarianRecord[]> {
    if (!selectedCommunity) return [];

    setIsLoadingGlobal(true);
    try {
      const rows = await getGlobalVeterinarians({
        nearLatitude: selectedCommunity.latitude,
        nearLongitude: selectedCommunity.longitude,
      });
      setGlobalItems(rows);
      return rows;
    } catch (error: any) {
      Alert.alert('Global liste hatasi', String(error?.message ?? 'Global veteriner listesi okunamadi.'));
      return [];
    } finally {
      setIsLoadingGlobal(false);
    }
  }

  async function openSelectModal() {
    setSearchText('');
    setVisibleGlobalCount(4);
    setSelectedGlobalVeterinarian(null);
    setOverrideVeterinarianName('');
    setOverridePhone('');
    setOverrideNotes('');

    setShowSelectModal(true);
    await loadGlobalCandidates();
  }

  async function openOverrideModalForItem(item: VeterinarianRecord) {
    const rows = await loadGlobalCandidates();
    const known = rows.find((candidate) => candidate.id === item.globalVeterinarianId);

    const selected: GlobalVeterinarianRecord =
      known ?? {
        id: item.globalVeterinarianId,
        clinicName: item.clinicName,
        defaultVeterinarianName: item.veterinarianName,
        defaultPhone: item.phone,
        locationLabel: item.locationLabel,
        latitude: item.latitude,
        longitude: item.longitude,
        city: '',
        district: '',
      };

    setSelectedGlobalVeterinarian(selected);
    setOverrideVeterinarianName(item.overrideVeterinarianName);
    setOverridePhone(item.overridePhone);
    setOverrideNotes(item.notes);
    setShowOverrideModal(true);
  }

  function chooseVeterinarianAndContinue(item: GlobalVeterinarianRecord) {
    const existing = items.find((entry) => entry.globalVeterinarianId === item.id);
    setSelectedGlobalVeterinarian(item);
    setOverrideVeterinarianName(existing?.overrideVeterinarianName ?? '');
    setOverridePhone(existing?.overridePhone ?? '');
    setOverrideNotes(existing?.notes ?? '');
    setShowSelectModal(false);
    setShowOverrideModal(true);
  }

  async function saveSelection() {
    if (!selectedCommunityId || !selectedGlobalVeterinarian) return;

    const trimmedName = overrideVeterinarianName.trim();
    const trimmedPhone = overridePhone.trim();
    const trimmedNotes = overrideNotes.trim();

    const nameOverride = trimmedName || undefined;
    const phoneOverride = trimmedPhone || undefined;

    if (trimmedPhone && !/^\+?[0-9\s()\-]{7,}$/.test(trimmedPhone)) {
      Alert.alert('Gecersiz telefon', 'Telefon numarasini daha gecerli bir formatta gir.');
      return;
    }

    setIsSaving(true);
    try {
      await upsertCommunityVeterinarian({
        communityId: selectedCommunityId,
        globalVeterinarianId: selectedGlobalVeterinarian.id,
        overrideVeterinarianName: nameOverride,
        overridePhone: phoneOverride,
        notes: trimmedNotes || undefined,
      });

      setShowOverrideModal(false);
      await loadVeterinarians();
    } catch (error: any) {
      Alert.alert('Kayit hatasi', String(error?.message ?? 'Community veteriner secimi kaydedilemedi.'));
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteSelection() {
    if (!selectedCommunityId || !selectedGlobalVeterinarian) return;

    Alert.alert(
      'Kaydi sil',
      'Bu topluluk icin secili veteriner kaydi silinecek. Emin misin?',
      [
        { text: 'Vazgec', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCommunityVeterinarianSelection({
                communityId: selectedCommunityId,
                globalVeterinarianId: selectedGlobalVeterinarian.id,
              });
              setShowOverrideModal(false);
              await loadVeterinarians();
            } catch (error: any) {
              Alert.alert('Silme hatasi', String(error?.message ?? 'Kayit silinemedi.'));
            }
          },
        },
      ]
    );
  }

  if (!selectedCommunity) return null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 40 }}>
      <TouchableOpacity onPress={() => router.back()}><Text style={{ fontSize: 30 }}>‹</Text></TouchableOpacity>
      <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text, marginTop: 10 }}>Veterinerler</Text>
      <Text style={{ color: colors.muted, marginTop: 5 }}>{selectedCommunity.name}</Text>
      <Text style={{ color: colors.muted, marginTop: 4 }}>
        Bu liste global veteriner havuzundan secilir. Community admin yalnizca hekim, telefon ve not alanlarini override edebilir.
      </Text>

      {isCommunityAdmin ? (
        <TouchableOpacity
          onPress={openSelectModal}
          style={{ marginTop: 14, backgroundColor: colors.primary, borderRadius: 12, padding: 12 }}
        >
          <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800' }}>Global Listeden Veteriner Sec</Text>
        </TouchableOpacity>
      ) : (
        <Card style={{ marginTop: 14 }}>
          <Text style={{ color: colors.muted }}>Veteriner secimi ve override sadece topluluk yoneticilerine aciktir.</Text>
        </Card>
      )}

      <Text style={{ fontWeight: '800', color: colors.text, marginTop: 18, marginBottom: 10 }}>Kayitli Veterinerler</Text>

      {isLoading ? (
        <Card>
          <Text style={{ color: colors.muted }}>Veterinerler yukleniyor...</Text>
        </Card>
      ) : null}

      {!isLoading && items.length === 0 ? (
        <Card>
          <Text style={{ color: colors.muted }}>Bu topluluk icin secilmis veteriner yok.</Text>
        </Card>
      ) : null}

      {!isLoading && items.map((item) => (
        <Card key={item.id} style={{ marginBottom: 10 }}>
          <Text style={{ fontWeight: '800', color: colors.text, fontSize: 16 }}>{item.clinicName}</Text>
          <Text style={{ color: colors.muted, marginTop: 5 }}>Veteriner hekim: {item.veterinarianName}</Text>
          <Text style={{ color: colors.muted, marginTop: 2 }}>Telefon: {item.phone}</Text>
          <Text style={{ color: colors.muted, marginTop: 2 }}>{item.locationLabel}</Text>
          {item.notes ? <Text style={{ color: colors.muted, marginTop: 2 }}>Not: {item.notes}</Text> : null}
          {isCommunityAdmin ? (
            <TouchableOpacity
              onPress={() => openOverrideModalForItem(item)}
              style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10 }}
            >
              <Text style={{ textAlign: 'center', fontWeight: '700', color: colors.text }}>Topluluk Veterineri Bilgileri</Text>
            </TouchableOpacity>
          ) : null}
        </Card>
      ))}

      <Modal visible={showSelectModal} animationType="slide" onRequestClose={() => setShowSelectModal(false)}>
        <ScrollView
          style={{ flex: 1, backgroundColor: colors.background }}
          contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 40 }}
          onScroll={(event) => {
            const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
            const isNearBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 180;
            if (isNearBottom) {
              loadMoreGlobalItems();
            }
          }}
          scrollEventThrottle={100}
        >
          <TouchableOpacity onPress={() => setShowSelectModal(false)}><Text style={{ fontSize: 30 }}>‹</Text></TouchableOpacity>
          <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text, marginTop: 10 }}>Global Listeden Sec</Text>

          <Card style={{ marginTop: 20 }}>
            <Text style={{ fontWeight: '800', color: colors.text }}>Yakin veterinerlerde ara</Text>
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Klinik, hekim, ilce"
              style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: '#fff', padding: 12 }}
            />

            {isLoadingGlobal ? <Text style={{ color: colors.muted, marginTop: 10 }}>Global liste yukleniyor...</Text> : null}
            {!isLoadingGlobal && filteredGlobalItems.length === 0 ? (
              <Text style={{ color: colors.muted, marginTop: 10 }}>Kayitli global veteriner bulunamadi.</Text>
            ) : null}

            {!isLoadingGlobal && filteredGlobalItems.length > 0 ? (
              <View style={{ marginTop: 10 }}>
                {visibleGlobalItems.map((item) => {
                  const isSelected = selectedGlobalVeterinarian?.id === item.id;
                  return (
                    <View key={item.id} style={{ marginBottom: 10, borderWidth: 1, borderColor: isSelected ? colors.primary : colors.border, borderRadius: 10, padding: 10 }}>
                      <Text style={{ fontWeight: '800', color: colors.text }}>{item.clinicName}</Text>
                      <Text style={{ color: colors.muted, marginTop: 2 }}>Hekim: {item.defaultVeterinarianName}</Text>
                      <Text style={{ color: colors.muted, marginTop: 2 }}>Telefon: {item.defaultPhone}</Text>
                      <Text style={{ color: colors.muted, marginTop: 2 }}>{item.locationLabel}</Text>
                      {typeof item.distanceKm === 'number' ? (
                        <Text style={{ color: colors.muted, marginTop: 2 }}>Uzaklik: {item.distanceKm.toFixed(1)} km</Text>
                      ) : null}
                      <View style={{ flexDirection: 'row', marginTop: 8, gap: 8 }}>
                        <TouchableOpacity
                          onPress={() => chooseVeterinarianAndContinue(item)}
                          style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 9, backgroundColor: '#fff' }}
                        >
                          <Text style={{ textAlign: 'center', color: colors.text, fontWeight: '700' }}>{isSelected ? 'Secildi' : 'Sec'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => openMapLocation(item)}
                          style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 9, backgroundColor: '#fff' }}
                        >
                          <Text style={{ textAlign: 'center', color: colors.text, fontWeight: '700' }}>Haritada Gor</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
                <Text style={{ color: colors.muted, textAlign: 'center', paddingVertical: 8 }}>
                  {visibleGlobalItems.length < filteredGlobalItems.length
                    ? `${visibleGlobalItems.length}/${filteredGlobalItems.length} gosteriliyor, asagi kaydirarak devam et`
                    : `${filteredGlobalItems.length} kaydin tamami gosteriliyor`}
                </Text>
              </View>
            ) : null}

            <Text style={{ color: colors.muted, marginTop: 8 }}>Listeden veteriner secince override ekranina gecilir.</Text>
          </Card>
        </ScrollView>
      </Modal>

      <Modal visible={showOverrideModal} animationType="slide" onRequestClose={() => setShowOverrideModal(false)}>
        <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 40 }}>
          <TouchableOpacity onPress={() => setShowOverrideModal(false)}><Text style={{ fontSize: 30 }}>‹</Text></TouchableOpacity>
          <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text, marginTop: 10 }}>Topluluk Veterineri Bilgileri</Text>

          <Card style={{ marginTop: 20 }}>
            <Text style={{ fontWeight: '800', color: colors.text }}>Secilen klinik</Text>
            <Text style={{ color: colors.text, marginTop: 6 }}>{selectedGlobalVeterinarian?.clinicName ?? '-'}</Text>
            <Text style={{ color: colors.muted, marginTop: 2 }}>{selectedGlobalVeterinarian?.locationLabel ?? '-'}</Text>

            <Text style={{ fontWeight: '800', color: colors.text, marginTop: 16 }}>Hekim</Text>
            <TextInput
              value={overrideVeterinarianName}
              onChangeText={setOverrideVeterinarianName}
              placeholder={selectedGlobalVeterinarian?.defaultVeterinarianName || 'Bos birakirsan global veri kullanilir'}
              style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: '#fff', padding: 12 }}
            />

            <Text style={{ fontWeight: '800', color: colors.text, marginTop: 16 }}>Telefon</Text>
            <TextInput
              value={overridePhone}
              onChangeText={setOverridePhone}
              placeholder={selectedGlobalVeterinarian?.defaultPhone || 'Bos birakirsan global veri kullanilir'}
              keyboardType="phone-pad"
              style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: '#fff', padding: 12 }}
            />

            <Text style={{ fontWeight: '800', color: colors.text, marginTop: 16 }}>Notlar</Text>
            <TextInput
              value={overrideNotes}
              onChangeText={setOverrideNotes}
              placeholder="Community ozel notlar"
              multiline
              style={{ marginTop: 8, minHeight: 80, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: '#fff', padding: 12, textAlignVertical: 'top' }}
            />
          </Card>

          <TouchableOpacity
            onPress={saveSelection}
            disabled={isSaving || !selectedGlobalVeterinarian}
            style={{ marginTop: 16, backgroundColor: colors.primary, borderRadius: 12, padding: 12, opacity: isSaving ? 0.7 : 1 }}
          >
            <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800' }}>
              {isSaving ? 'Kaydediliyor...' : 'Secimi Kaydet'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={deleteSelection}
            disabled={!selectedGlobalVeterinarian}
            style={{ marginTop: 10, backgroundColor: '#b91c1c', borderRadius: 12, padding: 12, opacity: selectedGlobalVeterinarian ? 1 : 0.7 }}
          >
            <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800' }}>Bu Topluluktan Sil</Text>
          </TouchableOpacity>
        </ScrollView>
      </Modal>
    </ScrollView>
  );
}
