import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Card } from '../src/components/Card';
import { useAuth } from '../src/context/AuthContext';
import { useCommunity } from '../src/context/CommunityContext';
import { colors } from '../src/theme';
import { CommunityMembership, getMembershipsForUser, leaveCommunityByUser } from '../src/services/communityService';
import { isSupabaseDataEnabled } from '../src/services/supabase';

export default function MyCommunitiesScreen() {
  const { currentUser } = useAuth();
  const {
    allCommunities,
    selectedCommunity,
    clearSelectedCommunity,
    refreshCommunities,
  } = useCommunity();

  const [memberships, setMemberships] = useState<CommunityMembership[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [leavingCommunityId, setLeavingCommunityId] = useState<string | null>(null);

  const mappedRows = useMemo(() => {
    const communityMap = new Map(allCommunities.map((community) => [community.id, community]));
    return memberships.map((membership) => {
      const community = communityMap.get(membership.communityId);
      return {
        ...membership,
        communityName: community?.name ?? 'Bilinmeyen topluluk',
        neighborhood: community?.neighborhood ?? 'Belirtilmedi',
        communityStatus: community?.status ?? null,
      };
    });
  }, [allCommunities, memberships]);

  const visibleRows = useMemo(() => (
    mappedRows.filter((row) => {
      if (!row.communityStatus) return false;
      if (row.communityStatus === 'rejected') return false;
      if (row.status === 'rejected') return false;
      return true;
    })
  ), [mappedRows]);

  const activeRows = useMemo(() => (
    visibleRows.filter((row) => row.status === 'active' || row.status === 'approved')
  ), [visibleRows]);

  const pendingRows = useMemo(() => (
    visibleRows.filter((row) => row.status === 'pending')
  ), [visibleRows]);

  const visibleRowsCount = activeRows.length + pendingRows.length;

  const loadMemberships = useCallback(async () => {
    if (!currentUser || !isSupabaseDataEnabled()) {
      setMemberships([]);
      return;
    }

    setIsLoading(true);
    try {
      // Always refresh communities first so status changes (e.g. rejected) are reflected before filtering.
      await refreshCommunities();
      const rows = await getMembershipsForUser(currentUser.id);
      setMemberships(rows);
    } catch (error: any) {
      Alert.alert('Topluluklarım hatası', String(error?.message ?? 'Üyelik listesi yüklenemedi.'));
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, refreshCommunities]);

  useFocusEffect(
    useCallback(() => {
      loadMemberships();
    }, [loadMemberships])
  );

  async function onLeaveCommunity(communityId: string, communityName: string) {
    if (!currentUser) return;

    setLeavingCommunityId(communityId);
    try {
      await leaveCommunityByUser({
        communityId,
        userId: currentUser.id,
      });

      await refreshCommunities();
      await loadMemberships();

      if (selectedCommunity?.id === communityId) {
        clearSelectedCommunity();
        router.replace('/community-select');
        return;
      }

      Alert.alert('Topluluktan ayrıldın', `${communityName} için üyelik durumun pasif yapıldı.`);
    } catch (error: any) {
      Alert.alert('Ayrılma hatası', String(error?.message ?? 'Topluluktan ayrılma işlemi tamamlanamadı.'));
    } finally {
      setLeavingCommunityId(null);
    }
  }

  function askLeaveCommunity(communityId: string, communityName: string) {
    Alert.alert(
      'Topluluktan ayrıl',
      `${communityName} topluluğundan ayrılmak istediğine emin misin? Durumun pasif olur ve yeniden katılım için admin onayı gerekir.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Ayrıl',
          style: 'destructive',
          onPress: () => {
            void onLeaveCommunity(communityId, communityName);
          },
        },
      ]
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 40 }}>
      <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ paddingVertical: 6, paddingHorizontal: 8, alignSelf: 'flex-start' }}><Text style={{ fontSize: 38, lineHeight: 38 }}>‹</Text></TouchableOpacity>
      <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text, marginTop: 10 }}>Topluluklarım</Text>
      <Text style={{ color: colors.muted, marginTop: 5 }}>Üye olduğun toplulukları görüntüleyebilir ve ayrılabilirsin.</Text>

      {!isSupabaseDataEnabled() ? (
        <Card style={{ marginTop: 18 }}>
          <Text style={{ color: colors.muted }}>Bu ekran şu anda aktif değil.</Text>
        </Card>
      ) : null}

      {isLoading ? (
        <Card style={{ marginTop: 18 }}>
          <Text style={{ color: colors.muted }}>Toplulukların yükleniyor...</Text>
        </Card>
      ) : null}

      {!isLoading && isSupabaseDataEnabled() && visibleRowsCount === 0 ? (
        <Card style={{ marginTop: 18 }}>
          <Text style={{ color: colors.muted }}>Henüz görüntülenebilir bir topluluk üyeliğin bulunmuyor.</Text>
        </Card>
      ) : null}

      {!isLoading && activeRows.length > 0 ? (
        <Text style={{ color: colors.text, fontWeight: '800', marginTop: 18, marginBottom: 8 }}>Aktif Topluluklar</Text>
      ) : null}
      {!isLoading ? activeRows.map((row) => (
        <Card key={`active-${row.communityId}`} style={{ marginBottom: 10 }}>
          <Text style={{ color: colors.text, fontWeight: '800' }}>{row.communityName}</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{row.neighborhood}</Text>
          <Text style={{ color: colors.muted, marginTop: 2 }}>Rol: {row.role} · Durum: {row.status}</Text>

          <View style={{ marginTop: 10 }}>
            <TouchableOpacity
              onPress={() => askLeaveCommunity(row.communityId, row.communityName)}
              disabled={leavingCommunityId === row.communityId}
              style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: 10, paddingVertical: 10, backgroundColor: '#fff', opacity: leavingCommunityId === row.communityId ? 0.7 : 1 }}
            >
              <Text style={{ textAlign: 'center', color: colors.danger, fontWeight: '800' }}>
                {leavingCommunityId === row.communityId ? 'İşleniyor...' : 'Topluluktan Çık'}
              </Text>
            </TouchableOpacity>
          </View>
        </Card>
      )) : null}

      {!isLoading && pendingRows.length > 0 ? (
        <Text style={{ color: colors.text, fontWeight: '800', marginTop: 8, marginBottom: 8 }}>Bekleyen İstekler</Text>
      ) : null}
      {!isLoading ? pendingRows.map((row) => (
        <Card key={`pending-${row.communityId}`} style={{ marginBottom: 10 }}>
          <Text style={{ color: colors.text, fontWeight: '800' }}>{row.communityName}</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{row.neighborhood}</Text>
          <Text style={{ color: colors.muted, marginTop: 2 }}>Rol: {row.role} · Durum: {row.status}</Text>
        </Card>
      )) : null}
    </ScrollView>
  );
}
