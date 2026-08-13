import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Card } from '../src/components/Card';
import { useAuth } from '../src/context/AuthContext';
import { useCommunity } from '../src/context/CommunityContext';
import { colors } from '../src/theme';
import { uploadImageIfNeeded } from '../src/services/supabaseStorage';
import { getUserProfileSettings, updateUserProfileSettings } from '../src/services/communityService';
import { isSupabaseDataEnabled } from '../src/services/supabase';

function isRemoteUrl(uri: string): boolean {
  return uri.startsWith('http://') || uri.startsWith('https://');
}

export default function SettingsScreen() {
  const { currentUser } = useAuth();
  const { selectedCommunity } = useCommunity();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [photoUri, setPhotoUri] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const avatarSource = useMemo(() => {
    if (!photoUri) return null;
    return { uri: photoUri };
  }, [photoUri]);

  const loadProfile = useCallback(async () => {
    if (!currentUser) return;

    if (!isSupabaseDataEnabled()) {
      setFullName(currentUser.fullName ?? '');
      setPhone('');
      setPhotoUri('');
      return;
    }

    setIsLoading(true);
    try {
      const profile = await getUserProfileSettings(currentUser.id);
      setFullName(profile.fullName || currentUser.fullName || '');
      setPhone(profile.phone || '');
      setPhotoUri(profile.avatarUrl || '');
    } catch (error: any) {
      Alert.alert('Ayarlar hatası', String(error?.message ?? 'Profil bilgileri yüklenemedi.'));
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  async function pickFromGallery() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('İzin gerekli', 'Profil fotoğrafı seçmek için galeri izni vermelisin.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: true,
      aspect: [1, 1],
    });

    if (result.canceled || !result.assets?.length) return;
    setPhotoUri(result.assets[0].uri);
  }

  async function pickFromCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('İzin gerekli', 'Profil fotoğrafı çekmek için kamera izni vermelisin.');
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: true,
        aspect: [1, 1],
      });

      if (result.canceled || !result.assets?.length) return;
      setPhotoUri(result.assets[0].uri);
    } catch (error: any) {
      const message = String(error?.message ?? '').toLowerCase();
      if (message.includes('camera not available on simulator') || message.includes('camera not available')) {
        Alert.alert('Kamera kullanılamıyor', 'Simülatörde kamera bulunmadığı için fotoğraf çekilemiyor. Galeriden seçim yapabilirsin.');
        return;
      }
      Alert.alert('Kamera hatası', 'Fotoğraf çekilirken hata oluştu.');
    }
  }

  async function onSave() {
    if (!currentUser) return;

    const name = fullName.trim();
    if (!name) {
      Alert.alert('Eksik bilgi', 'İsim Soyisim zorunludur.');
      return;
    }

    setIsSaving(true);
    try {
      let avatarUrl = photoUri.trim();
      if (avatarUrl && !isRemoteUrl(avatarUrl)) {
        avatarUrl = (await uploadImageIfNeeded({
          uri: avatarUrl,
          communityId: selectedCommunity?.id ?? 'global',
          folder: 'profiles',
          filePrefix: currentUser.id,
        })) ?? '';
      }

      await updateUserProfileSettings({
        userId: currentUser.id,
        fullName: name,
        phone: phone.trim(),
        avatarUrl,
      });

      setPhotoUri(avatarUrl);
      Alert.alert('Kaydedildi', 'Ayarların güncellendi.');
    } catch (error: any) {
      Alert.alert('Kayıt hatası', String(error?.message ?? 'Ayarlar güncellenemedi.'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 40 }}>
      <TouchableOpacity onPress={() => router.back()}><Text style={{ fontSize: 30 }}>‹</Text></TouchableOpacity>
      <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text, marginTop: 10 }}>Ayarlar</Text>
      <Text style={{ color: colors.muted, marginTop: 5 }}>Profil bilgilerini güncelleyebilirsin.</Text>

      <Card style={{ marginTop: 20 }}>
        <Text style={{ fontWeight: '800', color: colors.text }}>Profil fotoğrafı</Text>

        <View style={{ marginTop: 10, alignItems: 'center' }}>
          {avatarSource ? (
            <Image source={avatarSource} style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: '#EAECEF' }} />
          ) : (
            <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 44 }}>👤</Text>
            </View>
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <TouchableOpacity onPress={pickFromGallery} style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, backgroundColor: '#fff' }}>
            <Text style={{ textAlign: 'center', color: colors.text, fontWeight: '700' }}>Galeriden Seç</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={pickFromCamera} style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, backgroundColor: '#fff' }}>
            <Text style={{ textAlign: 'center', color: colors.text, fontWeight: '700' }}>Kamera Aç</Text>
          </TouchableOpacity>
        </View>

        {photoUri ? (
          <TouchableOpacity onPress={() => setPhotoUri('')} style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, backgroundColor: '#fff' }}>
            <Text style={{ textAlign: 'center', color: colors.text, fontWeight: '700' }}>Fotoğrafı Kaldır</Text>
          </TouchableOpacity>
        ) : null}

        <Text style={{ fontWeight: '800', color: colors.text, marginTop: 16 }}>İsim Soyisim</Text>
        <TextInput
          value={fullName}
          onChangeText={setFullName}
          placeholder="İsim Soyisim"
          style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: '#fff', padding: 12 }}
        />

        <Text style={{ fontWeight: '800', color: colors.text, marginTop: 16 }}>Telefon</Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="05xx xxx xx xx"
          keyboardType="phone-pad"
          style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: '#fff', padding: 12 }}
        />

        {!isSupabaseDataEnabled() ? (
          <Text style={{ color: colors.muted, marginTop: 10, fontSize: 12 }}>
            Supabase kapalıyken değişiklikler kalıcı olarak saklanmaz.
          </Text>
        ) : null}
      </Card>

      <TouchableOpacity
        onPress={onSave}
        disabled={isSaving || isLoading}
        style={{ marginTop: 16, backgroundColor: colors.primary, borderRadius: 12, padding: 12, opacity: isSaving || isLoading ? 0.7 : 1 }}
      >
        <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800' }}>
          {isSaving ? 'Kaydediliyor...' : 'Kaydet'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
