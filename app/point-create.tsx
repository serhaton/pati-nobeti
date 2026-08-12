import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, useState } from 'react';
import { Alert, Image, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Card } from '../src/components/Card';
import { useAuth } from '../src/context/AuthContext';
import { useCommunity } from '../src/context/CommunityContext';
import { addCustomFeedingPoint } from '../src/data/feedingPointStore';
import { colors } from '../src/theme';

export default function PointCreateScreen() {
  const { selectedCommunity } = useCommunity();
  const { currentUser } = useAuth();
  const params = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const [name, setName] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isCommunityAdmin = !!currentUser && !!selectedCommunity?.adminUserIds.includes(currentUser.id);

  const latitude = useMemo(() => Number(params.lat), [params.lat]);
  const longitude = useMemo(() => Number(params.lng), [params.lng]);

  if (!selectedCommunity) return null;

  if (!isCommunityAdmin) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 58 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ fontSize: 30 }}>‹</Text>
        </TouchableOpacity>
        <Text style={{ marginTop: 14, color: colors.text, fontSize: 24, fontWeight: '800' }}>Yetki gerekli</Text>
        <Text style={{ marginTop: 8, color: colors.muted }}>
          Haritadan mama noktasi ekleme islemi sadece topluluk yoneticileri icin acik.
        </Text>
      </View>
    );
  }

  const selectedCommunityId = selectedCommunity.id;

  async function pickFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Izin gerekli', 'Galeriden secmek icin fotograf izni vermelisin.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.75,
      allowsEditing: true,
      aspect: [4, 3],
      mediaTypes: ['images'],
    });

    if (!result.canceled && result.assets.length > 0) {
      setPhotoUri(result.assets[0].uri);
    }
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Izin gerekli', 'Fotograf cekmek icin kamera izni vermelisin.');
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        cameraType: ImagePicker.CameraType.back,
        quality: 0.75,
        allowsEditing: true,
        aspect: [4, 3],
      });

      if (!result.canceled && result.assets.length > 0) {
        setPhotoUri(result.assets[0].uri);
      }
    } catch (error: any) {
      const message = String(error?.message ?? '').toLowerCase();
      if (message.includes('camera not available') || message.includes('simulator')) {
        Alert.alert('Kamera kullanilamiyor', 'Simulator ortaminda kamera yerine galeriden secim aciliyor.');
        await pickFromLibrary();
        return;
      }
      Alert.alert('Kamera hatasi', 'Fotograf alinirken bir hata olustu.');
    }
  }

  async function savePoint() {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      Alert.alert('Konum hatasi', 'Uzun basarak tekrar nokta sec.');
      return;
    }

    if (!name.trim()) {
      Alert.alert('Eksik bilgi', 'Lutfen nokta ismi gir.');
      return;
    }

    setSaving(true);
    try {
      const createdPoint = await addCustomFeedingPoint({
        communityId: selectedCommunityId,
        name: name.trim(),
        lat: latitude,
        lng: longitude,
        photoUri: photoUri ?? undefined,
      });
      router.replace({
        pathname: '/map',
        params: {
          focusLat: String(createdPoint.lat),
          focusLng: String(createdPoint.lng),
          focusId: createdPoint.id,
          refresh: String(Date.now()),
        },
      });
    } catch (error: any) {
      Alert.alert('Supabase kayit hatasi', String(error?.message ?? 'Nokta kaydedilemedi.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 58 }}>
      <TouchableOpacity onPress={() => router.back()}>
        <Text style={{ fontSize: 30 }}>‹</Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text, marginTop: 10 }}>Mama Noktasi Ekle</Text>
      <Text style={{ color: colors.muted, marginTop: 5 }}>Nokta adini yaz, istersen fotograf ekleyip kaydet.</Text>

      <Card style={{ marginTop: 22 }}>
        <Text style={{ fontWeight: '800', color: colors.text }}>Secilen konum</Text>
        <Text style={{ marginTop: 8, color: colors.muted }}>
          {Number.isFinite(latitude) && Number.isFinite(longitude)
            ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
            : 'Konum alinamadi'}
        </Text>

        <Text style={{ fontWeight: '800', color: colors.text, marginTop: 18 }}>Nokta ismi</Text>
        <TextInput
          placeholder="Orn. Park ici mama noktasi"
          value={name}
          onChangeText={setName}
          style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 14, backgroundColor: '#fff' }}
        />

        <Text style={{ fontWeight: '800', color: colors.text, marginTop: 18 }}>Fotograf</Text>
        <TouchableOpacity
          onPress={takePhoto}
          style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 14, backgroundColor: '#fff' }}
        >
          <Text style={{ color: colors.text, fontWeight: '700' }}>{photoUri ? 'Fotografi yenile' : 'Kamera ile fotograf cek'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={pickFromLibrary}
          style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 14, backgroundColor: '#fff' }}
        >
          <Text style={{ color: colors.text, fontWeight: '700' }}>Galeriden sec</Text>
        </TouchableOpacity>

        {photoUri && (
          <Image
            source={{ uri: photoUri }}
            style={{ marginTop: 12, width: '100%', height: 190, borderRadius: 12, backgroundColor: '#E7ECE8' }}
            resizeMode="cover"
          />
        )}
      </Card>

      <TouchableOpacity
        onPress={savePoint}
        disabled={saving}
        style={{
          backgroundColor: saving ? '#6D907D' : colors.primary,
          borderRadius: 15,
          padding: 17,
          marginTop: 15,
          opacity: saving ? 0.8 : 1,
        }}
      >
        <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800' }}>
          {saving ? 'Kaydediliyor...' : 'Noktayi Kaydet'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
