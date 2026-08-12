import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, useState } from 'react';
import { Alert, Image, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Card } from '../src/components/Card';
import { useAuth } from '../src/context/AuthContext';
import { useCommunity } from '../src/context/CommunityContext';
import { getFeedingPointById, updateFeedingPoint } from '../src/data/feedingPointStore';
import { colors } from '../src/theme';

export default function PointEditScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const { currentUser } = useAuth();
  const { selectedCommunity } = useCommunity();
  const isCommunityAdmin = !!currentUser && !!selectedCommunity?.adminUserIds.includes(currentUser.id);

  const point = useMemo(() => {
    if (!params.id) return null;
    return getFeedingPointById(params.id);
  }, [params.id]);

  const [name, setName] = useState(point?.name ?? '');
  const [photoUri, setPhotoUri] = useState<string | null>(point?.photoUri ?? null);
  const [saving, setSaving] = useState(false);

  async function pickFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('İzin gerekli', 'Galeriden seçmek için fotoğraf izni vermelisin.');
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
      Alert.alert('İzin gerekli', 'Fotograf cekmek için kamera izni vermelisin.');
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
        Alert.alert('Kamera kullanılamıyor', 'Simulator ortamında kamera yerine galeriden seçim açılıyor.');
        await pickFromLibrary();
        return;
      }
      Alert.alert('Kamera hatası', 'Fotograf alinirken bir hata oluştu.');
    }
  }

  async function saveChanges() {
    if (!isCommunityAdmin) {
      Alert.alert('Yetki gerekli', 'Mama noktalarını sadece topluluk yöneticileri güncelleyebilir.');
      return;
    }

    if (!params.id) {
      Alert.alert('Hata', 'Nokta bulunamadı.');
      return;
    }

    if (!name.trim()) {
      Alert.alert('Eksik bilgi', 'Lütfen nokta ismi gir.');
      return;
    }

    setSaving(true);
    try {
      const updated = await updateFeedingPoint(params.id, {
        name: name.trim(),
        photoUri: photoUri ?? undefined,
        removePhoto: photoUri === null,
      });

      if (!updated) {
        Alert.alert('Hata', 'Nokta güncellenemedi.');
        return;
      }

      router.back();
    } catch (error: any) {
      Alert.alert('Supabase kayıt hatası', String(error?.message ?? 'Nokta güncellenemedi.'));
    } finally {
      setSaving(false);
    }
  }

  if (!point) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 58 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ fontSize: 30 }}>‹</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text, marginTop: 16 }}>Nokta bulunamadı</Text>
      </View>
    );
  }

  if (!isCommunityAdmin) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 58 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ fontSize: 30 }}>‹</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text, marginTop: 16 }}>Yetki gerekli</Text>
        <Text style={{ color: colors.muted, marginTop: 8 }}>
          Mama noktalarını güncelleme işlemi sadece topluluk yöneticileri için açık.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 58 }}>
      <TouchableOpacity onPress={() => router.back()}>
        <Text style={{ fontSize: 30 }}>‹</Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text, marginTop: 10 }}>Mama Noktasini Düzenle</Text>
      <Text style={{ color: colors.muted, marginTop: 5 }}>İsim ve fotoğraf bilgisini güncelleyebilirsin.</Text>

      <Card style={{ marginTop: 22 }}>
        <Text style={{ fontWeight: '800', color: colors.text }}>Konum</Text>
        <Text style={{ marginTop: 8, color: colors.muted }}>{point.lat.toFixed(6)}, {point.lng.toFixed(6)}</Text>

        <Text style={{ fontWeight: '800', color: colors.text, marginTop: 18 }}>Nokta ismi</Text>
        <TextInput
          placeholder="Orn. Park ici mama noktası"
          value={name}
          onChangeText={setName}
          style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 14, backgroundColor: '#fff' }}
        />

        <Text style={{ fontWeight: '800', color: colors.text, marginTop: 18 }}>Fotograf</Text>
        <TouchableOpacity
          onPress={takePhoto}
          style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 14, backgroundColor: '#fff' }}
        >
          <Text style={{ color: colors.text, fontWeight: '700' }}>{photoUri ? 'Fotografi yenile' : 'Kamera ile fotoğraf cek'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={pickFromLibrary}
          style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 14, backgroundColor: '#fff' }}
        >
          <Text style={{ color: colors.text, fontWeight: '700' }}>Galeriden seç</Text>
        </TouchableOpacity>

        {photoUri && (
          <Image
            source={{ uri: photoUri }}
            style={{ marginTop: 12, width: '100%', height: 190, borderRadius: 12, backgroundColor: '#E7ECE8' }}
            resizeMode="cover"
          />
        )}

        {photoUri ? (
          <TouchableOpacity
            onPress={() => setPhotoUri(null)}
            style={{ marginTop: 10, borderWidth: 1, borderColor: '#D97A7A', borderRadius: 13, padding: 12, backgroundColor: '#fff' }}
          >
            <Text style={{ color: '#D97A7A', textAlign: 'center', fontWeight: '700' }}>Fotografi Sil</Text>
          </TouchableOpacity>
        ) : null}
      </Card>

      <TouchableOpacity
        onPress={saveChanges}
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
          {saving ? 'Kaydediliyor...' : 'Degisiklikleri Kaydet'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
