import { router } from 'expo-router';
import * as Location from 'expo-location';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { Card } from '../src/components/Card';
import { Logo } from '../src/components/Logo';
import { useAuth } from '../src/context/AuthContext';
import { useCommunity } from '../src/context/CommunityContext';
import {
  createCommunityAndAssignAdmin,
  getMembershipsForUser,
  sendJoinRequest,
} from '../src/services/communityService';
import { isSupabaseDataEnabled } from '../src/services/supabase';
import { colors } from '../src/theme';

const SEARCH_RADIUS_KM = 10;

type NearbyCommunity = {
  id: string;
  name: string;
  neighborhood: string;
  latitude: number;
  longitude: number;
  members: number;
  animals: number;
  distanceKm: number | null;
};

type MembershipStatus = 'none' | 'pending' | 'rejected' | 'approved' | 'active' | 'passive';
type MembershipRole = 'admin' | 'member' | 'none';

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceInKm(
  leftLat: number,
  leftLng: number,
  rightLat: number,
  rightLng: number,
) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(rightLat - leftLat);
  const dLng = toRadians(rightLng - leftLng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(leftLat)) * Math.cos(toRadians(rightLat)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function zoomFromDelta(latitudeDelta: number): number {
  if (!Number.isFinite(latitudeDelta) || latitudeDelta <= 0) return 17;
  const zoom = Math.log2(360 / latitudeDelta);
  return Math.max(3, Math.min(20, zoom));
}

function deltaFromZoom(zoom: number): number {
  const safeZoom = Math.max(3, Math.min(20, zoom));
  return 360 / Math.pow(2, safeZoom);
}

export default function CommunitySelectScreen() {
  const { currentUser, signOut } = useAuth();
  const {
    allCommunities,
    selectedCommunity,
    selectCommunityById,
    clearSelectedCommunity,
    communityLoadError,
    refreshCommunities,
  } = useCommunity();
  const [isLocating, setIsLocating] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  const [membershipsByCommunity, setMembershipsByCommunity] = useState<Record<string, MembershipStatus>>({});
  const [membershipRolesByCommunity, setMembershipRolesByCommunity] = useState<Record<string, MembershipRole>>({});
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [targetCommunityId, setTargetCommunityId] = useState<string | null>(null);
  const [joinNote, setJoinNote] = useState('');
  const [isSendingJoinRequest, setIsSendingJoinRequest] = useState(false);

  const [communityName, setCommunityName] = useState('');
  const [communityNeighborhood, setCommunityNeighborhood] = useState('');
  const [communityDescription, setCommunityDescription] = useState('');
  const [communityCenter, setCommunityCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  const [communityZoom, setCommunityZoom] = useState(17);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [returnToCreateAfterPicker, setReturnToCreateAfterPicker] = useState(false);
  const [isCreatingCommunity, setIsCreatingCommunity] = useState(false);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [pendingSelectionId, setPendingSelectionId] = useState<string | null>(null);

  const [pickerRegion, setPickerRegion] = useState<Region>({
    latitude: 41.018101,
    longitude: 29.125607,
    latitudeDelta: 0.08,
    longitudeDelta: 0.08,
  });

  useEffect(() => {
    let mounted = true;

    async function loadUserLocation() {
      setIsLocating(true);
      setLocationError(null);

      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') {
          if (mounted) {
            setLocationError('Konum izni verilmedi. Yakın topluluk önerileri gosterilemiyor.');
          }
          return;
        }

        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!mounted) return;

        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        setUserCoords(coords);
        setPickerRegion((prev) => ({
          ...prev,
          latitude: coords.latitude,
          longitude: coords.longitude,
        }));
      } catch {
        if (mounted) {
          setLocationError('Konum alinirken bir hata oluştu.');
        }
      } finally {
        if (mounted) setIsLocating(false);
      }
    }

    loadUserLocation();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadMemberships() {
      if (!currentUser || !isSupabaseDataEnabled()) {
        setMembershipsByCommunity({});
        setMembershipRolesByCommunity({});
        return;
      }

      try {
        const memberships = await getMembershipsForUser(currentUser.id);
        if (!mounted) return;

        const next: Record<string, MembershipStatus> = {};
        const nextRoles: Record<string, MembershipRole> = {};
        memberships.forEach((membership) => {
          const rawStatus = membership.status.toLowerCase();
          const rawRole = membership.role.toLowerCase();
          if (rawStatus === 'pending') next[membership.communityId] = 'pending';
          else if (rawStatus === 'rejected') next[membership.communityId] = 'rejected';
          else if (rawStatus === 'approved') next[membership.communityId] = 'approved';
          else if (rawStatus === 'passive') next[membership.communityId] = 'passive';
          else next[membership.communityId] = 'active';

          nextRoles[membership.communityId] = rawRole === 'admin' ? 'admin' : 'member';
        });
        setMembershipsByCommunity(next);
        setMembershipRolesByCommunity(nextRoles);
      } catch (error: any) {
        if (!mounted) return;
        Alert.alert('Üyelik hatası', String(error?.message ?? 'Üyelik durumlari okunamadi.'));
      }
    }

    loadMemberships();

    return () => {
      mounted = false;
    };
  }, [allCommunities.length, currentUser?.id]);

  const communitiesWithDistance = useMemo<NearbyCommunity[]>(() => {
    return allCommunities
      .map((community) => {
        const distanceKm = userCoords
          ? distanceInKm(
            userCoords.latitude,
            userCoords.longitude,
            community.latitude,
            community.longitude,
          )
          : null;

        return {
          ...community,
          distanceKm,
        };
      })
      .sort((left, right) => {
        if (left.distanceKm === null && right.distanceKm === null) {
          return left.name.localeCompare(right.name, 'tr-TR');
        }
        if (left.distanceKm === null) return 1;
        if (right.distanceKm === null) return -1;
        return left.distanceKm - right.distanceKm;
      });
  }, [allCommunities, userCoords]);

  const memberCommunityIds = useMemo(() => (
    new Set(
      Object.entries(membershipsByCommunity)
        .filter(([, status]) => status === 'active' || status === 'approved')
        .map(([communityId]) => communityId)
    )
  ), [membershipsByCommunity]);

  const memberCommunities = useMemo<NearbyCommunity[]>(() => {
    return communitiesWithDistance.filter((community) => memberCommunityIds.has(community.id));
  }, [communitiesWithDistance, memberCommunityIds]);

  const nearbyNonMemberCommunities = useMemo<NearbyCommunity[]>(() => {
    return communitiesWithDistance
      .filter((community) => !memberCommunityIds.has(community.id))
      .filter((community) => community.distanceKm !== null && community.distanceKm <= SEARCH_RADIUS_KM);
  }, [communitiesWithDistance, memberCommunityIds]);

  const allNonMemberCommunities = useMemo<NearbyCommunity[]>(() => {
    return communitiesWithDistance.filter((community) => !memberCommunityIds.has(community.id));
  }, [communitiesWithDistance, memberCommunityIds]);

  const targetCommunity = useMemo(
    () => communitiesWithDistance.find((community) => community.id === targetCommunityId) ?? null,
    [communitiesWithDistance, targetCommunityId],
  );

  useEffect(() => {
    if (!pendingSelectionId) return;
    if (selectedCommunity?.id !== pendingSelectionId) return;

    setPendingSelectionId(null);
    router.replace('/home');
  }, [pendingSelectionId, selectedCommunity?.id]);

  function selectAndContinue(id: string) {
    setPendingSelectionId(id);
    selectCommunityById(id);
  }

  function getMembershipStatus(communityId: string): MembershipStatus {
    return membershipsByCommunity[communityId] ?? 'none';
  }

  function getMembershipRole(communityId: string): MembershipRole {
    return membershipRolesByCommunity[communityId] ?? 'none';
  }

  function openJoinRequest(communityId: string) {
    setTargetCommunityId(communityId);
    setJoinNote('');
    setShowJoinModal(true);
  }

  async function submitJoinRequest() {
    if (!currentUser || !targetCommunity) return;

    if (!joinNote.trim()) {
      Alert.alert('Eksik bilgi', 'Topluluğa katılım için kısa bir not yazmalısın.');
      return;
    }

    setIsSendingJoinRequest(true);
    try {
      await sendJoinRequest({
        communityId: targetCommunity.id,
        userId: currentUser.id,
        requesterName: currentUser.fullName,
        note: joinNote.trim(),
      });

      setMembershipsByCommunity((prev) => ({
        ...prev,
        [targetCommunity.id]: 'pending',
      }));
      setShowJoinModal(false);
      Alert.alert('İstek gonderildi', 'Katılım isteğin topluluk admininin onayına düştü.');
    } catch (error: any) {
      Alert.alert('İstek hatası', String(error?.message ?? 'Katılım isteği gonderilemedi.'));
    } finally {
      setIsSendingJoinRequest(false);
    }
  }

  async function createCommunity() {
    if (!currentUser) return;

    if (!communityName.trim()) {
      Alert.alert('Eksik bilgi', 'Topluluk ismi zorunlu.');
      return;
    }

    if (!communityNeighborhood.trim()) {
      Alert.alert('Eksik bilgi', 'Ilce/Bolge bilgisi zorunlu.');
      return;
    }

    if (!communityCenter) {
      Alert.alert('Eksik bilgi', 'Haritadan topluluk merkezini seçmelisin.');
      return;
    }

    setIsCreatingCommunity(true);
    try {
      const created = await createCommunityAndAssignAdmin({
        name: communityName.trim(),
        neighborhood: communityNeighborhood.trim(),
        description: communityDescription.trim() ? communityDescription.trim() : undefined,
        latitude: communityCenter.latitude,
        longitude: communityCenter.longitude,
        defaultZoom: Math.round(communityZoom),
        userId: currentUser.id,
      });

      await refreshCommunities();
      selectCommunityById(created.communityId);
      setPendingSelectionId(created.communityId);
      setShowCreateModal(false);
    } catch (error: any) {
      Alert.alert('Topluluk oluşturma hatası', String(error?.message ?? 'Topluluk oluşturulamadı.'));
    } finally {
      setIsCreatingCommunity(false);
    }
  }

  function onCommunityPress(communityId: string) {
    const membership = getMembershipStatus(communityId);

    if (!isSupabaseDataEnabled()) {
      selectAndContinue(communityId);
      return;
    }

    if (membership === 'active' || membership === 'approved') {
      selectAndContinue(communityId);
      return;
    }

    if (membership === 'pending') {
      Alert.alert('Bekleyen istek', 'Bu topluluk için katılım isteğin zaten beklemede.');
      return;
    }

    if (membership === 'rejected') {
      Alert.alert('İstek reddedildi', 'Bu topluluk isteğini yeniden gonderebilirsin.');
    }

    if (membership === 'passive') {
      Alert.alert('Pasif üyelik', 'Bu topluluktan ayrıldın. Yeniden katılmak için istek gönderebilirsin.');
    }

    openJoinRequest(communityId);
  }

  async function applyCenterWithAddress(center: { latitude: number; longitude: number }, zoom?: number) {
    setCommunityCenter(center);
    if (Number.isFinite(zoom)) {
      setCommunityZoom(zoom as number);
    }
    setIsResolvingAddress(true);

    try {
      const results = await Location.reverseGeocodeAsync(center);
      const first = results[0];
      if (!first) return;

      const district = first.district ?? first.subregion ?? first.name ?? '';
      const city = first.city ?? first.region ?? '';
      const text = [district, city].filter(Boolean).join(' / ');

      if (text) {
        setCommunityNeighborhood(text);
      }
    } catch {
      // Keep manual neighborhood entry when reverse geocode fails.
    } finally {
      setIsResolvingAddress(false);
    }
  }

  function openCreateModal() {
    setShowCreateModal(true);
  }

  async function handleLogout() {
    try {
      clearSelectedCommunity();
      await signOut();
      router.replace('/');
    } catch (error: any) {
      Alert.alert('Çıkış hatası', String(error?.message ?? 'Çıkış yapılamadı.'));
    }
  }

  function openLocationPickerFromCreateModal() {
    if (communityCenter) {
      const previewDelta = deltaFromZoom(communityZoom);
      setPickerRegion({
        latitude: communityCenter.latitude,
        longitude: communityCenter.longitude,
        latitudeDelta: previewDelta,
        longitudeDelta: previewDelta,
      });
    }

    setReturnToCreateAfterPicker(true);
    setShowCreateModal(false);
    setShowLocationPicker(true);
  }

  async function requestLocationAgain() {
    setIsLocating(true);
    setLocationError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocationError('Konum izni verilmedi. Yakın topluluk önerileri gosterilemiyor.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      setUserCoords(coords);
      setPickerRegion((prev) => ({
        ...prev,
        latitude: coords.latitude,
        longitude: coords.longitude,
      }));
    } catch {
      setLocationError('Konum alinirken bir hata oluştu.');
    } finally {
      setIsLocating(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 32 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Logo small />
        <TouchableOpacity
          onPress={handleLogout}
          style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' }}
        >
          <Text style={{ color: colors.danger, fontWeight: '800' }}>Çıkış Yap</Text>
        </TouchableOpacity>
      </View>
      <Text style={{ color: colors.text, fontSize: 26, fontWeight: '800', marginTop: 18 }}>Topluluk Seçimi</Text>
      <Text style={{ color: colors.muted, marginTop: 7 }}>Konumuna 10 km içindeki topluluklar listelenir.</Text>

      <View style={{ marginTop: 22 }}>
        {communityLoadError ? (
          <Card style={{ borderColor: colors.danger, borderWidth: 1 }}>
            <Text style={{ fontWeight: '800', color: colors.danger, fontSize: 16 }}>Veritabani Hatası</Text>
            <Text style={{ color: colors.text, marginTop: 6 }}>{communityLoadError}</Text>
          </Card>
        ) : null}

        {isLocating ? (
          <Card>
            <Text style={{ color: colors.text, fontWeight: '700' }}>Konum alınıyor...</Text>
          </Card>
        ) : null}

        {!communityLoadError && !isLocating && locationError ? (
          <Card style={{ borderColor: colors.accent, borderWidth: 1 }}>
            <Text style={{ fontWeight: '800', color: colors.text, fontSize: 16 }}>Konum Uyarisi</Text>
            <Text style={{ color: colors.muted, marginTop: 6 }}>{locationError}</Text>
            <TouchableOpacity
              onPress={requestLocationAgain}
              style={{ marginTop: 10, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 9 }}
            >
              <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800' }}>Konum Iznini Tekrar Dene</Text>
            </TouchableOpacity>
          </Card>
        ) : null}

        {!communityLoadError && !isLocating ? (
          <Text style={{ marginTop: 12, marginBottom: 8, color: colors.text, fontWeight: '800' }}>
            Dahil Oldugun Topluluklar
          </Text>
        ) : null}

        {!communityLoadError && !isLocating && memberCommunities.length === 0 ? (
          <Card style={{ marginBottom: 10 }}>
            <Text style={{ color: colors.muted }}>Henüz aktif oldugun bir topluluk yok.</Text>
          </Card>
        ) : null}

        {memberCommunities.map((community) => {
          const isSelected = selectedCommunity?.id === community.id;
          const membershipStatus = getMembershipStatus(community.id);
          const membershipRole = getMembershipRole(community.id);

          const actionLabel = membershipStatus === 'active' || membershipStatus === 'approved' || membershipStatus === 'passive'
            ? 'Bu Toplulukla Devam Et'
            : membershipStatus === 'pending'
              ? 'Katılım isteği beklemede'
              : membershipStatus === 'rejected'
                ? 'Yeniden katılım isteği gonder'
                : 'Topluluğa katılım isteği gonder';

          return (
            <TouchableOpacity key={community.id} onPress={() => onCommunityPress(community.id)}>
              <Card style={{ marginBottom: 10, borderColor: isSelected ? colors.primary : colors.border, borderWidth: isSelected ? 2 : 1 }}>
                <Text style={{ fontWeight: '800', color: colors.text, fontSize: 17 }}>{community.name}</Text>
                <Text style={{ color: colors.muted, marginTop: 5 }}>{community.neighborhood}</Text>
                <Text style={{ color: colors.muted, marginTop: 2 }}>
                  {community.members} üye · {community.animals} can{community.distanceKm !== null ? ` · ${community.distanceKm.toFixed(1)} km` : ''}
                </Text>

                {isSupabaseDataEnabled() ? (
                  <Text style={{ color: colors.muted, marginTop: 7, fontSize: 12 }}>
                    Üyelik durumu: {membershipStatus}{membershipRole !== 'none' ? ` · Rol: ${membershipRole}` : ''}
                  </Text>
                ) : null}

                <View
                  style={{
                    marginTop: 10,
                    backgroundColor: membershipStatus === 'pending' ? '#8BA899' : colors.primary,
                    borderRadius: 10,
                    paddingVertical: 9,
                  }}
                >
                  <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800' }}>{actionLabel}</Text>
                </View>
              </Card>
            </TouchableOpacity>
          );
        })}

        {!communityLoadError && !isLocating ? (
          <Text style={{ marginTop: 12, marginBottom: 8, color: colors.text, fontWeight: '800' }}>
            10 km Yakinindaki Diğer Topluluklar
          </Text>
        ) : null}

        {!communityLoadError && !isLocating && nearbyNonMemberCommunities.length === 0 ? (
          <Card style={{ marginBottom: 10 }}>
            <Text style={{ color: colors.muted }}>10 km yakınında katılabileceğin topluluk bulunamadı.</Text>
          </Card>
        ) : null}

        {nearbyNonMemberCommunities.map((community) => {
          const isSelected = selectedCommunity?.id === community.id;
          const membershipStatus = getMembershipStatus(community.id);
          const membershipRole = getMembershipRole(community.id);

          const actionLabel = membershipStatus === 'pending'
            ? 'Katılım isteği beklemede'
            : membershipStatus === 'rejected'
              ? 'Yeniden katılım isteği gonder'
              : membershipStatus === 'passive'
                ? 'Yeniden katılım isteği gonder'
              : 'Topluluğa katılım isteği gonder';

          return (
            <TouchableOpacity key={community.id} onPress={() => onCommunityPress(community.id)}>
              <Card style={{ marginBottom: 10, borderColor: isSelected ? colors.primary : colors.border, borderWidth: isSelected ? 2 : 1 }}>
                <Text style={{ fontWeight: '800', color: colors.text, fontSize: 17 }}>{community.name}</Text>
                <Text style={{ color: colors.muted, marginTop: 5 }}>{community.neighborhood}</Text>
                <Text style={{ color: colors.muted, marginTop: 2 }}>
                  {community.members} üye · {community.animals} can{community.distanceKm !== null ? ` · ${community.distanceKm.toFixed(1)} km` : ''}
                </Text>

                {isSupabaseDataEnabled() ? (
                  <Text style={{ color: colors.muted, marginTop: 7, fontSize: 12 }}>
                    Üyelik durumu: {membershipStatus}{membershipRole !== 'none' ? ` · Rol: ${membershipRole}` : ''}
                  </Text>
                ) : null}

                <View
                  style={{
                    marginTop: 10,
                    backgroundColor: membershipStatus === 'pending' ? '#8BA899' : colors.primary,
                    borderRadius: 10,
                    paddingVertical: 9,
                  }}
                >
                  <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800' }}>{actionLabel}</Text>
                </View>
              </Card>
            </TouchableOpacity>
          );
        })}

        {!communityLoadError && !isLocating ? (
          <Text style={{ marginTop: 12, marginBottom: 8, color: colors.text, fontWeight: '800' }}>
            Tüm Topluluklar (Üye Olmadiklarin)
          </Text>
        ) : null}

        {!communityLoadError && !isLocating && allNonMemberCommunities.length === 0 ? (
          <Card style={{ marginBottom: 10 }}>
            <Text style={{ color: colors.muted }}>Üye olmadığın topluluk bulunamadı.</Text>
          </Card>
        ) : null}

        {allNonMemberCommunities.map((community) => {
          const isSelected = selectedCommunity?.id === community.id;
          const membershipStatus = getMembershipStatus(community.id);
          const membershipRole = getMembershipRole(community.id);

          const actionLabel = membershipStatus === 'pending'
            ? 'Katılım isteği beklemede'
            : membershipStatus === 'rejected'
              ? 'Yeniden katılım isteği gonder'
              : membershipStatus === 'passive'
                ? 'Yeniden katılım isteği gonder'
              : 'Topluluğa katılım isteği gonder';

          return (
            <TouchableOpacity key={`all-${community.id}`} onPress={() => onCommunityPress(community.id)}>
              <Card style={{ marginBottom: 10, borderColor: isSelected ? colors.primary : colors.border, borderWidth: isSelected ? 2 : 1 }}>
                <Text style={{ fontWeight: '800', color: colors.text, fontSize: 17 }}>{community.name}</Text>
                <Text style={{ color: colors.muted, marginTop: 5 }}>{community.neighborhood}</Text>
                <Text style={{ color: colors.muted, marginTop: 2 }}>
                  {community.members} üye · {community.animals} can{community.distanceKm !== null ? ` · ${community.distanceKm.toFixed(1)} km` : ''}
                </Text>

                {isSupabaseDataEnabled() ? (
                  <Text style={{ color: colors.muted, marginTop: 7, fontSize: 12 }}>
                    Üyelik durumu: {membershipStatus}{membershipRole !== 'none' ? ` · Rol: ${membershipRole}` : ''}
                  </Text>
                ) : null}

                <View
                  style={{
                    marginTop: 10,
                    backgroundColor: membershipStatus === 'pending' ? '#8BA899' : colors.primary,
                    borderRadius: 10,
                    paddingVertical: 9,
                  }}
                >
                  <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800' }}>{actionLabel}</Text>
                </View>
              </Card>
            </TouchableOpacity>
          );
        })}

        {!communityLoadError && !isLocating ? (
          <TouchableOpacity
            onPress={openCreateModal}
            style={{ marginTop: 10, backgroundColor: colors.primary, borderRadius: 12, padding: 12 }}
          >
            <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800' }}>Yeni Topluluk Oluştur</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <Modal visible={showJoinModal} transparent animationType="fade" onRequestClose={() => setShowJoinModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', padding: 20 }}>
          <Card>
            <Text style={{ fontWeight: '800', color: colors.text, fontSize: 17 }}>Katılım isteği gonder</Text>
            <Text style={{ color: colors.muted, marginTop: 6 }}>
              {targetCommunity ? `${targetCommunity.name} topluluguna katılım notunu yaz.` : ''}
            </Text>

            <TextInput
              value={joinNote}
              onChangeText={setJoinNote}
              placeholder="Neden katılmak istediğini kısaca yaz"
              multiline
              style={{ marginTop: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: '#fff', padding: 12, minHeight: 90, textAlignVertical: 'top' }}
            />

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity onPress={() => setShowJoinModal(false)} style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 11 }}>
                <Text style={{ textAlign: 'center', color: colors.text, fontWeight: '700' }}>Vazgec</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitJoinRequest}
                disabled={isSendingJoinRequest}
                style={{ flex: 1, backgroundColor: colors.primary, borderRadius: 12, padding: 11, opacity: isSendingJoinRequest ? 0.7 : 1 }}
              >
                <Text style={{ textAlign: 'center', color: '#fff', fontWeight: '800' }}>
                  {isSendingJoinRequest ? 'Gonderiliyor...' : 'İstek Gonder'}
                </Text>
              </TouchableOpacity>
            </View>
          </Card>
        </View>
      </Modal>

      <Modal
        visible={showLocationPicker}
        animationType="slide"
        onRequestClose={() => {
          setShowLocationPicker(false);
          if (returnToCreateAfterPicker) {
            setShowCreateModal(true);
            setReturnToCreateAfterPicker(false);
          }
        }}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ paddingHorizontal: 16, paddingTop: 54, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>Topluluk Merkezi Seçimi</Text>
            <TouchableOpacity
              onPress={() => {
                setShowLocationPicker(false);
                if (returnToCreateAfterPicker) {
                  setShowCreateModal(true);
                  setReturnToCreateAfterPicker(false);
                }
              }}
            >
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
              const currentZoom = zoomFromDelta(pickerRegion.latitudeDelta);
              void applyCenterWithAddress(nextCenter, currentZoom);
            }}
          >
            {userCoords ? (
              <Marker
                coordinate={userCoords}
                pinColor={colors.blue}
                title="Konumun"
              />
            ) : null}
            <Marker coordinate={communityCenter ?? { latitude: pickerRegion.latitude, longitude: pickerRegion.longitude }} />
          </MapView>

          <View style={{ padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colors.border }}>
            <Text style={{ color: colors.muted, marginBottom: 8 }}>
              Haritayı surukleyip orta noktayi belirle veya uzun basarak nokta seç.
            </Text>
            <TouchableOpacity
              onPress={async () => {
                await applyCenterWithAddress(
                  { latitude: pickerRegion.latitude, longitude: pickerRegion.longitude },
                  zoomFromDelta(pickerRegion.latitudeDelta)
                );
                setShowLocationPicker(false);
                if (returnToCreateAfterPicker) {
                  setShowCreateModal(true);
                  setReturnToCreateAfterPicker(false);
                }
              }}
              style={{ backgroundColor: colors.primary, borderRadius: 12, padding: 13 }}
            >
              <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800' }}>Bu Merkezi Kullan</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showCreateModal} animationType="slide" onRequestClose={() => setShowCreateModal(false)}>
        <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 40 }}>
          <TouchableOpacity onPress={() => setShowCreateModal(false)}><Text style={{ fontSize: 38, lineHeight: 38 }}>‹</Text></TouchableOpacity>
          <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text, marginTop: 10 }}>Yeni Topluluk Oluştur</Text>
          <Text style={{ color: colors.muted, marginTop: 5 }}>İsim gir, merkez seç ve açıklama ekle.</Text>

          <Card style={{ marginTop: 20 }}>
            <Text style={{ marginTop: 2, fontWeight: '700', color: colors.text }}>Topluluk ismi</Text>
            <TextInput
              value={communityName}
              onChangeText={setCommunityName}
              placeholder="Orn. Kadikoy Gece Besleme Grubu"
              style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: '#fff', padding: 12 }}
            />

            <TouchableOpacity
              onPress={openLocationPickerFromCreateModal}
              style={{ marginTop: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: '#fff', padding: 12 }}
            >
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                {communityCenter
                  ? `Merkez: ${communityCenter.latitude.toFixed(5)}, ${communityCenter.longitude.toFixed(5)}`
                  : 'Haritadan topluluk merkezini seç'}
              </Text>
              {userCoords ? (
                <Text style={{ color: colors.muted, marginTop: 4, fontSize: 12 }}>Haritada mavi marker konumunu gosterecek.</Text>
              ) : null}
            </TouchableOpacity>

            {communityCenter ? (
              <View style={{ marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden', height: 140 }}>
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

            <Text style={{ marginTop: 12, fontWeight: '700', color: colors.text }}>Ilce/Bolge</Text>
            <TextInput
              value={communityNeighborhood}
              onChangeText={setCommunityNeighborhood}
              placeholder={isResolvingAddress ? 'Adres çözülüyor...' : 'Haritadan seçince otomatik dolar'}
              style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: '#fff', padding: 12 }}
            />

            <Text style={{ marginTop: 12, fontWeight: '700', color: colors.text }}>Açıklama (opsiyonel)</Text>
            <TextInput
              value={communityDescription}
              onChangeText={setCommunityDescription}
              placeholder="Topluluğun amacını kısaca yaz"
              multiline
              style={{ marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: '#fff', padding: 12, minHeight: 90, textAlignVertical: 'top' }}
            />
          </Card>

          <TouchableOpacity
            onPress={createCommunity}
            disabled={isCreatingCommunity}
            style={{ marginTop: 14, backgroundColor: colors.primary, borderRadius: 12, padding: 12, opacity: isCreatingCommunity ? 0.7 : 1 }}
          >
            <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800' }}>
              {isCreatingCommunity ? 'Olusturuluyor...' : 'Topluluğu Oluştur'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </Modal>
    </ScrollView>
  );
}
