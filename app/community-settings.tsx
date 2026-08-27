import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { Card } from '../src/components/Card';
import { RefreshableScrollView } from '../src/components/RefreshableScrollView';
import { useAuth } from '../src/context/AuthContext';
import { useCommunity } from '../src/context/CommunityContext';
import { updateCommunitySettingsByAdmin } from '../src/services/communityService';
import { isSupabaseDataEnabled } from '../src/services/supabase';
import { colors } from '../src/theme';

function zoomFromDelta(latitudeDelta: number): number {
  if (!Number.isFinite(latitudeDelta) || latitudeDelta <= 0) return 17;
  const zoom = Math.log2(360 / latitudeDelta);
  return Math.max(3, Math.min(20, zoom));
}

function deltaFromZoom(zoom: number): number {
  const safeZoom = Math.max(3, Math.min(20, zoom));
  return 360 / Math.pow(2, safeZoom);
}

export default function CommunitySettings() {
  const params = useLocalSearchParams<{ source?: string }>();
  const source = Array.isArray(params.source) ? params.source[0] : params.source;
  const { currentUser } = useAuth();
  const { selectedCommunity, refreshCommunities, ensureCommunitySelectedById } = useCommunity();

  const [name, setName] = useState('');
  const [communityCenter, setCommunityCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  const [communityZoom, setCommunityZoom] = useState(17);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [pickerRegion, setPickerRegion] = useState<Region>({
    latitude: 41.018101,
    longitude: 29.125607,
    latitudeDelta: 0.08,
    longitudeDelta: 0.08,
  });
  const [isSaving, setIsSaving] = useState(false);

  const isCommunityAdmin = !!currentUser && !!selectedCommunity?.adminUserIds.includes(currentUser.id);

  useEffect(() => {
    if (!selectedCommunity) return;
    setName(selectedCommunity.name ?? '');
    const nextCenter = {
      latitude: Number(selectedCommunity.latitude ?? 41.018101),
      longitude: Number(selectedCommunity.longitude ?? 29.125607),
    };
    const nextZoom = Number(selectedCommunity.defaultZoom ?? 17);
    setCommunityCenter(nextCenter);
    setCommunityZoom(nextZoom);
    const previewDelta = deltaFromZoom(nextZoom);
    setPickerRegion({
      latitude: nextCenter.latitude,
      longitude: nextCenter.longitude,
      latitudeDelta: previewDelta,
      longitudeDelta: previewDelta,
    });
  }, [selectedCommunity]);

  const hasChanged = useMemo(() => {
    if (!selectedCommunity) return false;

    const selectedLat = Number(selectedCommunity.latitude);
    const selectedLng = Number(selectedCommunity.longitude);
    const selectedZoom = Number(selectedCommunity.defaultZoom);
    const currentLat = Number(communityCenter?.latitude ?? selectedLat);
    const currentLng = Number(communityCenter?.longitude ?? selectedLng);

    return (
      name.trim() !== selectedCommunity.name
      || Math.abs(currentLat - selectedLat) > 0.000001
      || Math.abs(currentLng - selectedLng) > 0.000001
      || Math.round(communityZoom) !== Math.round(selectedZoom)
    );
  }, [communityCenter?.latitude, communityCenter?.longitude, communityZoom, name, selectedCommunity]);

  function goBackBySource() {
    if (source === 'community') {
      router.replace('/community');
      return;
    }
    router.replace('/home');
  }

  async function onSave() {
    if (!selectedCommunity || !currentUser) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Eksik bilgi', 'Topluluk ismi boş olamaz.');
      return;
    }

    const latitude = Number(communityCenter?.latitude ?? Number.NaN);
    const longitude = Number(communityCenter?.longitude ?? Number.NaN);
    const defaultZoom = Math.round(communityZoom);

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      Alert.alert('Geçersiz koordinat', 'Enlem -90 ile 90 arasında olmalı.');
      return;
    }

    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      Alert.alert('Geçersiz koordinat', 'Boylam -180 ile 180 arasında olmalı.');
      return;
    }

    if (!Number.isFinite(defaultZoom) || defaultZoom < 1 || defaultZoom > 22) {
      Alert.alert('Geçersiz zoom', 'Zoom değeri 1 ile 22 arasında olmalı.');
      return;
    }

    setIsSaving(true);
    try {
      await updateCommunitySettingsByAdmin({
        communityId: selectedCommunity.id,
        adminUserId: currentUser.id,
        name: trimmedName,
        latitude,
        longitude,
        defaultZoom,
      });
      await refreshCommunities();
      await ensureCommunitySelectedById(selectedCommunity.id);
      Alert.alert('Kaydedildi', 'Topluluk bilgileri güncellendi.');
      router.replace('/community');
    } catch (error: any) {
      Alert.alert('Güncelleme hatası', String(error?.message ?? 'Topluluk bilgileri güncellenemedi.'));
    } finally {
      setIsSaving(false);
    }
  }

  if (!selectedCommunity) return null;

  return (
    <RefreshableScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 40 }}>
      <TouchableOpacity onPress={goBackBySource} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ paddingVertical: 6, paddingHorizontal: 8, alignSelf: 'flex-start' }}>
        <Text style={{ fontSize: 38, lineHeight: 38 }}>‹</Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text, marginTop: 10 }}>Topluluk</Text>
      <Text style={{ color: colors.muted, marginTop: 4 }}>Topluluk adı ile harita merkezi/zoom ayarını güncelleyebilirsin.</Text>

      {!isSupabaseDataEnabled() ? (
        <Card style={{ marginTop: 18 }}>
          <Text style={{ color: colors.muted }}>Bu ekran şu anda aktif değil.</Text>
        </Card>
      ) : null}

      {!isCommunityAdmin ? (
        <Card style={{ marginTop: 18 }}>
          <Text style={{ color: colors.text, fontWeight: '800' }}>Yetki gerekli</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>Bu sayfayı sadece topluluk yöneticileri kullanabilir.</Text>
        </Card>
      ) : null}

      {isCommunityAdmin && isSupabaseDataEnabled() ? (
        <Card style={{ marginTop: 18 }}>
          <Text style={{ fontWeight: '800', color: colors.text }}>Topluluk ismi</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Topluluk ismi"
            placeholderTextColor={colors.muted}
            style={{
              marginTop: 8,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              backgroundColor: '#fff',
              paddingHorizontal: 12,
              paddingVertical: 11,
              color: colors.text,
            }}
          />

          <TouchableOpacity
            onPress={() => setShowLocationPicker(true)}
            style={{ marginTop: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: '#fff', padding: 12 }}
          >
            <Text style={{ color: colors.text, fontWeight: '700', textAlign: 'center' }}>
              Topluluk alanını değiştir
            </Text>
          </TouchableOpacity>

          {communityCenter ? (
            <View style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden', height: 150 }}>
              <MapView
                style={{ flex: 1 }}
                pointerEvents="none"
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
                region={{
                  latitude: communityCenter.latitude,
                  longitude: communityCenter.longitude,
                  latitudeDelta: deltaFromZoom(communityZoom),
                  longitudeDelta: deltaFromZoom(communityZoom),
                }}
              >
                <Marker coordinate={communityCenter} />
              </MapView>
            </View>
          ) : null}

          <TouchableOpacity
            disabled={!hasChanged || isSaving}
            onPress={() => { void onSave(); }}
            style={{
              marginTop: 18,
              borderRadius: 12,
              paddingVertical: 12,
              backgroundColor: colors.primary,
              opacity: !hasChanged || isSaving ? 0.6 : 1,
            }}
          >
            <Text style={{ textAlign: 'center', color: '#fff', fontWeight: '800' }}>
              {isSaving ? 'Kaydediliyor...' : 'Kaydet'}
            </Text>
          </TouchableOpacity>
        </Card>
      ) : null}

      <Modal
        visible={showLocationPicker}
        animationType="slide"
        onRequestClose={() => setShowLocationPicker(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ paddingHorizontal: 16, paddingTop: 54, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>Topluluk Merkezi Seçimi</Text>
            <TouchableOpacity onPress={() => setShowLocationPicker(false)}>
              <Text style={{ color: colors.primary, fontWeight: '800' }}>Kapat</Text>
            </TouchableOpacity>
          </View>

          <MapView
            style={{ flex: 1 }}
            initialRegion={pickerRegion}
            onRegionChangeComplete={(region) => {
              setPickerRegion(region);
              setCommunityCenter({ latitude: region.latitude, longitude: region.longitude });
              setCommunityZoom(zoomFromDelta(region.latitudeDelta));
            }}
            onLongPress={(event) => {
              const nextCenter = event.nativeEvent.coordinate;
              setCommunityCenter(nextCenter);
              setPickerRegion((prev) => ({
                ...prev,
                latitude: nextCenter.latitude,
                longitude: nextCenter.longitude,
              }));
            }}
          >
            <Marker coordinate={communityCenter ?? { latitude: pickerRegion.latitude, longitude: pickerRegion.longitude }} />
          </MapView>

          <View style={{ padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colors.border }}>
            <Text style={{ color: colors.muted, marginBottom: 8 }}>
              Haritayı sürükleyip orta noktayı belirle veya uzun basarak nokta seç.
            </Text>
            <TouchableOpacity
              onPress={() => setShowLocationPicker(false)}
              style={{ backgroundColor: colors.primary, borderRadius: 12, padding: 13 }}
            >
              <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800' }}>Bu Merkezi Kullan</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </RefreshableScrollView>
  );
}