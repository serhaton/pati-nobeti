import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, useState } from 'react';
import { Alert, Image, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Card } from '../src/components/Card';
import { getFeedingPointById, updateFeedingPoint } from '../src/data/feedingPointStore';
import { colors } from '../src/theme';

export default function PointEditScreen() {
  const params = useLocalSearchParams<{ id?: string }>();

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

  async function saveChanges() {
    if (!params.id) {
      Alert.alert('Hata', 'Nokta bulunamadi.');
      return;
    }

    if (!name.trim()) {
      Alert.alert('Eksik bilgi', 'Lutfen nokta ismi gir.');
      return;
    }

    setSaving(true);
    try {
      const updated = await updateFeedingPoint(params.id, {
        name: name.trim(),
        photoUri: photoUri ?? undefined,
      });

      if (!updated) {
        Alert.alert('Hata', 'Nokta guncellenemedi.');
        return;
      }

      router.back();
    } catch (error: any) {
      Alert.alert('Supabase kayit hatasi', String(error?.message ?? 'Nokta guncellenemedi.'));
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
        <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text, marginTop: 16 }}>Nokta bulunamadi</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 58 }}>
      <TouchableOpacity onPress={() => router.back()}>
        <Text style={{ fontSize: 30 }}>‹</Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text, marginTop: 10 }}>Mama Noktasini Duzenle</Text>
      <Text style={{ color: colors.muted, marginTop: 5 }}>Isim ve fotograf bilgisini guncelleyebilirsin.</Text>

      <Card style={{ marginTop: 22 }}>
        <Text style={{ fontWeight: '800', color: colors.text }}>Konum</Text>
        <Text style={{ marginTop: 8, color: colors.muted }}>{point.lat.toFixed(6)}, {point.lng.toFixed(6)}</Text>

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
