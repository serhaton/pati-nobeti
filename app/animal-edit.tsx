import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, useState } from 'react';
import { Alert, Image, Modal, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { RefreshableScrollView } from '../src/components/RefreshableScrollView';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Card } from '../src/components/Card';
import { useAuth } from '../src/context/AuthContext';
import { useCommunity } from '../src/context/CommunityContext';
import { AnimalGender, AnimalHealthEvent, AnimalType, CAT_BREEDS, DOG_BREEDS, getAnimalById, updateAnimal } from '../src/data/animalStore';
import { colors } from '../src/theme';

function parseDate(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function AnimalEditScreen() {
  const params = useLocalSearchParams<{ id?: string; source?: string }>();
  const { currentUser } = useAuth();
  const { selectedCommunity } = useCommunity();

  const animal = useMemo(() => {
    if (!params.id) return null;
    return getAnimalById(params.id);
  }, [params.id]);

  const isCommunityAdmin = !!currentUser && !!selectedCommunity?.adminUserIds.includes(currentUser.id);

  const [name, setName] = useState(animal?.name ?? '');
  const [type, setType] = useState<AnimalType>(animal?.type ?? 'Kedi');
  const [breed, setBreed] = useState(animal?.breed ?? '');
  const [gender, setGender] = useState<AnimalGender>(animal?.gender ?? 'Dişi');
  const [isSterilized, setIsSterilized] = useState(animal?.isSterilized ?? false);
  const [birthDate, setBirthDate] = useState(parseDate(animal?.birthDate ?? ''));
  const [location, setLocation] = useState(animal?.location ?? '');
  const [breedSearch, setBreedSearch] = useState('');
  const [showBreedPicker, setShowBreedPicker] = useState(false);
  const [photoUris, setPhotoUris] = useState<string[]>(animal?.photoUris ?? []);

  const [vaccineName, setVaccineName] = useState('');
  const [vaccineDate, setVaccineDate] = useState(new Date());
  const [vaccinationSchedule, setVaccinationSchedule] = useState<AnimalHealthEvent[]>(animal?.vaccinationSchedule ?? []);

  const [treatmentName, setTreatmentName] = useState('');
  const [treatmentDate, setTreatmentDate] = useState(new Date());
  const [treatmentNote, setTreatmentNote] = useState('');
  const [treatmentSchedule, setTreatmentSchedule] = useState<AnimalHealthEvent[]>(animal?.treatmentSchedule ?? []);

  const breedOptions = useMemo(() => {
    const base = type === 'Kedi' ? CAT_BREEDS : DOG_BREEDS;
    const normalized = breedSearch.trim().toLowerCase();
    if (!normalized) return base;
    return base.filter((item) => item.toLowerCase().includes(normalized));
  }, [breedSearch, type]);
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
        <Text style={{ marginTop: 14, color: colors.text, fontSize: 24, fontWeight: '800' }}>Can dost bulunamadı</Text>
      </View>
    );
  }

  if (!isCommunityAdmin) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 58 }}>
        <TouchableOpacity onPress={goBackToAnimalList} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ paddingVertical: 6, paddingHorizontal: 8, alignSelf: 'flex-start' }}><Text style={{ fontSize: 38, lineHeight: 38 }}>‹</Text></TouchableOpacity>
        <Text style={{ marginTop: 14, color: colors.text, fontSize: 24, fontWeight: '800' }}>Yetkisiz işlem</Text>
        <Text style={{ marginTop: 8, color: colors.muted }}>Can dost düzenleme yalnızca topluluk yöneticilerine açık.</Text>
      </View>
    );
  }

  async function addFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('İzin gerekli', 'Galeriden seçim için fotoğraf izni vermelisin.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.7,
      allowsEditing: true,
      aspect: [4, 3],
      mediaTypes: ['images'],
    });

    if (!result.canceled && result.assets.length > 0) {
      setPhotoUris((prev) => [...prev, result.assets[0].uri]);
    }
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('İzin gerekli', 'Kamera kullanımı için izin vermelisin.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: true,
      aspect: [4, 3],
      cameraType: ImagePicker.CameraType.back,
    });

    if (!result.canceled && result.assets.length > 0) {
      setPhotoUris((prev) => [...prev, result.assets[0].uri]);
    }
  }

  function addVaccinationEvent() {
    if (!vaccineName.trim()) {
      Alert.alert('Eksik bilgi', 'Aşı adı girilmeli.');
      return;
    }

    setVaccinationSchedule((prev) => [
      ...prev,
      { id: `vac-${Date.now()}`, name: vaccineName.trim(), date: formatDate(vaccineDate) },
    ]);
    setVaccineName('');
    setVaccineDate(new Date());
  }

  function addTreatmentEvent() {
    if (!treatmentName.trim()) {
      Alert.alert('Eksik bilgi', 'Tedavi adı girilmeli.');
      return;
    }

    setTreatmentSchedule((prev) => [
      ...prev,
      {
        id: `tr-${Date.now()}`,
        name: treatmentName.trim(),
        date: formatDate(treatmentDate),
        note: treatmentNote.trim() ? treatmentNote.trim() : undefined,
      },
    ]);
    setTreatmentName('');
    setTreatmentDate(new Date());
    setTreatmentNote('');
  }

  function removeEvent(typeName: 'vaccination' | 'treatment', eventId: string) {
    if (typeName === 'vaccination') {
      setVaccinationSchedule((prev) => prev.filter((event) => event.id !== eventId));
      return;
    }
    setTreatmentSchedule((prev) => prev.filter((event) => event.id !== eventId));
  }

  async function saveAnimal() {
    if (!params.id) return;

    if (!name.trim()) {
      Alert.alert('Eksik bilgi', 'Can dost adı zorunlu.');
      return;
    }

    if (!breed.trim()) {
      Alert.alert('Eksik bilgi', 'Lütfen cins seç.');
      return;
    }

    if (!location.trim()) {
      Alert.alert('Eksik bilgi', 'Lütfen bulunduğu konumu gir.');
      return;
    }

    try {
      const updated = await updateAnimal(params.id, {
        name: name.trim(),
        type,
        breed: breed.trim(),
        gender,
        isSterilized,
        birthDate: formatDate(birthDate),
        location: location.trim(),
        vaccinationSchedule,
        treatmentSchedule,
        photoUris,
      });

      if (!updated) {
        Alert.alert('Hata', 'Can dost güncellenemedi.');
        return;
      }

      router.replace({ pathname: '/animal-detail', params: source ? { id: updated.id, source } : { id: updated.id } });
    } catch (error: any) {
      Alert.alert('Kayıt hatası', String(error?.message ?? 'Can dost güncellenemedi.'));
    }
  }

  return (
    <RefreshableScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 36 }}>
      <TouchableOpacity onPress={goBackToAnimalList} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ paddingVertical: 6, paddingHorizontal: 8, alignSelf: 'flex-start' }}><Text style={{ fontSize: 38, lineHeight: 38 }}>‹</Text></TouchableOpacity>
      <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text, marginTop: 10 }}>Can Dostu Düzenle</Text>
      <Text style={{ color: colors.muted, marginTop: 5 }}>Profil, sağlık ve fotoğraf alanlarını güncelle.</Text>

      <Card style={{ marginTop: 20 }}>
        <Text style={{ fontWeight: '800', color: colors.text }}>Adı</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Örn. Misket"
          style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 14, backgroundColor: '#fff' }}
        />

        <Text style={{ fontWeight: '800', color: colors.text, marginTop: 18 }}>Tür</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          {(['Kedi', 'Köpek'] as AnimalType[]).map((item) => (
            <TouchableOpacity
              key={item}
              onPress={() => {
                setType(item);
                setBreed('');
              }}
              style={{
                flex: 1,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: type === item ? colors.primary : colors.border,
                backgroundColor: type === item ? colors.primarySoft : '#fff',
                paddingVertical: 11,
              }}
            >
              <Text style={{ textAlign: 'center', fontWeight: '700', color: colors.text }}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={{ fontWeight: '800', color: colors.text, marginTop: 18 }}>Cins seçimi</Text>
        <TouchableOpacity
          onPress={() => setShowBreedPicker((value) => !value)}
          style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 14, backgroundColor: '#fff' }}
        >
          <Text style={{ color: breed ? colors.text : colors.muted, fontWeight: breed ? '700' : '500' }}>
            {breed || 'Listeden cins seç'}
          </Text>
          <Text style={{ color: colors.muted, marginTop: 4, fontSize: 12 }}>
            {showBreedPicker ? 'Listeyi kapat ▲' : 'Cins listesi ▼'}
          </Text>
        </TouchableOpacity>

        {showBreedPicker ? (
          <Modal
            visible={showBreedPicker}
            transparent
            animationType="fade"
            onRequestClose={() => setShowBreedPicker(false)}
          >
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', padding: 20 }}>
              <Card style={{ borderRadius: 14, maxHeight: '75%' }}>
                <Text style={{ fontWeight: '800', color: colors.text, fontSize: 16 }}>Cins Seçimi</Text>
                <TextInput
                  value={breedSearch}
                  onChangeText={setBreedSearch}
                  placeholder="Cins içinde ara"
                  style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 12, backgroundColor: '#fff' }}
                />
                <RefreshableScrollView style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: '#fff', maxHeight: 340 }}>
                  {breedOptions.length > 0 ? (
                    breedOptions.map((item) => (
                      <TouchableOpacity
                        key={item}
                        onPress={() => {
                          setBreed(item);
                          setShowBreedPicker(false);
                        }}
                        style={{ paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border }}
                      >
                        <Text style={{ color: colors.text }}>{item}</Text>
                      </TouchableOpacity>
                    ))
                  ) : (
                    <Text style={{ color: colors.muted, padding: 12 }}>Aramaya uygun cins bulunamadı.</Text>
                  )}
                </RefreshableScrollView>

                <TouchableOpacity
                  onPress={() => setShowBreedPicker(false)}
                  style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 11, backgroundColor: '#fff' }}
                >
                  <Text style={{ textAlign: 'center', color: colors.text, fontWeight: '700' }}>Kapat</Text>
                </TouchableOpacity>
              </Card>
            </View>
          </Modal>
        ) : null}

        <Text style={{ fontWeight: '800', color: colors.text, marginTop: 18 }}>Cinsiyet</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          {(['Dişi', 'Erkek', 'Bilinmiyor'] as AnimalGender[]).map((item) => (
            <TouchableOpacity
              key={item}
              onPress={() => setGender(item)}
              style={{
                flex: 1,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: gender === item ? colors.primary : colors.border,
                backgroundColor: gender === item ? colors.primarySoft : '#fff',
                paddingVertical: 11,
              }}
            >
              <Text style={{ textAlign: 'center', fontWeight: '700', color: colors.text }}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          onPress={() => setIsSterilized((value) => !value)}
          style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center' }}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: isSterilized ? colors.primary : colors.border,
              backgroundColor: isSterilized ? colors.primarySoft : '#fff',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isSterilized ? <Text style={{ color: colors.primary, fontWeight: '800' }}>✓</Text> : null}
          </View>
          <Text style={{ marginLeft: 10, color: colors.text, fontWeight: '700' }}>Kısırlaştırılmış</Text>
        </TouchableOpacity>

        <Text style={{ fontWeight: '800', color: colors.text, marginTop: 18 }}>Doğum tarihi</Text>
        <View style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: '#fff', paddingVertical: Platform.OS === 'ios' ? 6 : 0 }}>
          <DateTimePicker value={birthDate} mode="date" display={Platform.OS === 'ios' ? 'compact' : 'default'} onChange={(_, date) => date && setBirthDate(date)} />
        </View>

        <Text style={{ fontWeight: '800', color: colors.text, marginTop: 18 }}>Bulunduğu konum</Text>
        <TextInput
          value={location}
          onChangeText={setLocation}
          placeholder="Örn. Moda Parkı"
          style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 14, backgroundColor: '#fff' }}
        />
      </Card>

      <Card style={{ marginTop: 12 }}>
        <Text style={{ fontWeight: '800', color: colors.text }}>Aşı takvimi</Text>
        <TextInput
          value={vaccineName}
          onChangeText={setVaccineName}
          placeholder="Aşı adı (örn. Kuduz)"
          style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 12, backgroundColor: '#fff' }}
        />
        <Text style={{ color: colors.muted, marginTop: 8, fontSize: 12 }}>Aşı tarihi: {formatDate(vaccineDate)}</Text>
        <View style={{ marginTop: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: '#fff', paddingVertical: Platform.OS === 'ios' ? 6 : 0 }}>
          <DateTimePicker
            value={vaccineDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'compact' : 'default'}
            onChange={(_, date) => date && setVaccineDate(date)}
          />
        </View>
        <TouchableOpacity onPress={addVaccinationEvent} style={{ marginTop: 8, backgroundColor: colors.primarySoft, borderRadius: 12, padding: 10 }}>
          <Text style={{ textAlign: 'center', color: colors.primary, fontWeight: '800' }}>Aşı kaydı ekle</Text>
        </TouchableOpacity>

        {vaccinationSchedule.map((event) => (
          <View key={event.id} style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10 }}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>{event.name}</Text>
            <Text style={{ color: colors.muted, marginTop: 2 }}>{event.date}</Text>
            <TouchableOpacity onPress={() => removeEvent('vaccination', event.id)} style={{ marginTop: 4 }}>
              <Text style={{ color: colors.danger, fontWeight: '700', fontSize: 12 }}>Kaydı sil</Text>
            </TouchableOpacity>
          </View>
        ))}
      </Card>

      <Card style={{ marginTop: 12 }}>
        <Text style={{ fontWeight: '800', color: colors.text }}>Tedavi takvimi</Text>
        <TextInput
          value={treatmentName}
          onChangeText={setTreatmentName}
          placeholder="Tedavi adı"
          style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 12, backgroundColor: '#fff' }}
        />
        <Text style={{ color: colors.muted, marginTop: 8, fontSize: 12 }}>Tedavi tarihi: {formatDate(treatmentDate)}</Text>
        <View style={{ marginTop: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: '#fff', paddingVertical: Platform.OS === 'ios' ? 6 : 0 }}>
          <DateTimePicker
            value={treatmentDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'compact' : 'default'}
            onChange={(_, date) => date && setTreatmentDate(date)}
          />
        </View>
        <TextInput
          value={treatmentNote}
          onChangeText={setTreatmentNote}
          placeholder="Not (opsiyonel)"
          style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 12, backgroundColor: '#fff' }}
        />
        <TouchableOpacity onPress={addTreatmentEvent} style={{ marginTop: 8, backgroundColor: colors.primarySoft, borderRadius: 12, padding: 10 }}>
          <Text style={{ textAlign: 'center', color: colors.primary, fontWeight: '800' }}>Tedavi kaydı ekle</Text>
        </TouchableOpacity>

        {treatmentSchedule.map((event) => (
          <View key={event.id} style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10 }}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>{event.name}</Text>
            <Text style={{ color: colors.muted, marginTop: 2 }}>{event.date}</Text>
            {event.note ? <Text style={{ color: colors.muted, marginTop: 2 }}>Not: {event.note}</Text> : null}
            <TouchableOpacity onPress={() => removeEvent('treatment', event.id)} style={{ marginTop: 4 }}>
              <Text style={{ color: colors.danger, fontWeight: '700', fontSize: 12 }}>Kaydı sil</Text>
            </TouchableOpacity>
          </View>
        ))}
      </Card>

      <Card style={{ marginTop: 12 }}>
        <Text style={{ fontWeight: '800', color: colors.text }}>Fotoğraflar (opsiyonel)</Text>
        <TouchableOpacity onPress={takePhoto} style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 12, backgroundColor: '#fff' }}>
          <Text style={{ color: colors.text, fontWeight: '700' }}>Kamera ile ekle</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={addFromLibrary} style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 12, backgroundColor: '#fff' }}>
          <Text style={{ color: colors.text, fontWeight: '700' }}>Galeriden ekle</Text>
        </TouchableOpacity>

        <RefreshableScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {photoUris.map((uri, index) => (
              <View key={`${uri}-${index}`}>
                <Image source={{ uri }} style={{ width: 90, height: 90, borderRadius: 10, backgroundColor: '#E7ECE8' }} />
                <TouchableOpacity
                  onPress={() => setPhotoUris((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
                  style={{ marginTop: 4, backgroundColor: '#F5DFDC', borderRadius: 8, paddingVertical: 4 }}
                >
                  <Text style={{ textAlign: 'center', color: colors.danger, fontSize: 12, fontWeight: '700' }}>Kaldır</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </RefreshableScrollView>
      </Card>

      <TouchableOpacity onPress={saveAnimal} style={{ backgroundColor: colors.primary, borderRadius: 15, padding: 17, marginTop: 15 }}>
        <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800' }}>Değişiklikleri Kaydet</Text>
      </TouchableOpacity>
    </RefreshableScrollView>
  );
}
