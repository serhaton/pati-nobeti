import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { RefreshableScrollView } from '../src/components/RefreshableScrollView';
import { Card } from '../src/components/Card';
import { useAuth } from '../src/context/AuthContext';
import { useCommunity } from '../src/context/CommunityContext';
import {
  AppAdminCommunityRecord,
  deleteCommunityByAppAdmin,
  getCommunitiesForAppAdmin,
  getIsCurrentUserAppAdmin,
  updateCommunityStatusByAppAdmin,
} from '../src/services/communityService';
import { colors } from '../src/theme';

export default function CommunityAdminApprovalsScreen() {
  const params = useLocalSearchParams<{ source?: string }>();
  const { currentUser } = useAuth();
  const { refreshCommunities } = useCommunity();
  const source = Array.isArray(params.source) ? params.source[0] : params.source;

  const [isLoading, setIsLoading] = useState(false);
  const [isAppAdmin, setIsAppAdmin] = useState(false);
  const [rows, setRows] = useState<AppAdminCommunityRecord[]>([]);
  const [actioningCommunityId, setActioningCommunityId] = useState<string | null>(null);

  function goBackBySource() {
    if (source === 'profile') {
      router.replace({ pathname: '/profile', params: { source: 'home' } });
      return;
    }

    if (source === 'community-select') {
      router.replace('/community-select');
      return;
    }

    router.replace('/profile');
  }

  const sortedRows = useMemo(() => {
    const statusOrder: Record<AppAdminCommunityRecord['status'], number> = {
      pending: 0,
      approved: 1,
      rejected: 2,
    };

    return [...rows].sort((left, right) => {
      const statusDelta = statusOrder[left.status] - statusOrder[right.status];
      if (statusDelta !== 0) return statusDelta;
      return right.createdAt.localeCompare(left.createdAt);
    });
  }, [rows]);

  const pendingCount = useMemo(
    () => rows.filter((item) => item.status === 'pending').length,
    [rows]
  );

  const loadRows = useCallback(async () => {
    if (!currentUser) return;

    setIsLoading(true);
    try {
      const [adminFlag, communities] = await Promise.all([
        getIsCurrentUserAppAdmin(currentUser.id),
        getCommunitiesForAppAdmin(),
      ]);
      setIsAppAdmin(adminFlag);
      setRows(communities);
    } catch (error: any) {
      Alert.alert('Yükleme hatası', String(error?.message ?? 'Topluluk onay kayıtları yüklenemedi.'));
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  useFocusEffect(
    useCallback(() => {
      loadRows();
    }, [loadRows])
  );

  async function setStatus(communityId: string, status: 'approved' | 'rejected') {
    if (!currentUser) return;

    setActioningCommunityId(communityId);
    try {
      await updateCommunityStatusByAppAdmin({
        communityId,
        status,
        actorUserId: currentUser.id,
      });

      setRows((prev) => prev.map((item) => (
        item.id === communityId
          ? { ...item, status }
          : item
      )));
      await refreshCommunities();
    } catch (error: any) {
      Alert.alert('Durum güncelleme hatası', String(error?.message ?? 'Topluluk durumu güncellenemedi.'));
    } finally {
      setActioningCommunityId(null);
    }
  }

  async function deleteCommunity(community: AppAdminCommunityRecord) {
    setActioningCommunityId(community.id);
    try {
      const result = await deleteCommunityByAppAdmin({ communityId: community.id });
      setRows((prev) => prev.filter((item) => item.id !== community.id));
      await refreshCommunities();

      Alert.alert(
        'Topluluk silindi',
        `${community.name} topluluğu ve bağlı veriler kalıcı olarak silindi. Silinen dosya sayısı: ${result.deletedStorageObjects}`
      );
    } catch (error: any) {
      Alert.alert('Topluluk silme hatası', String(error?.message ?? 'Topluluk silinemedi.'));
    } finally {
      setActioningCommunityId(null);
    }
  }

  function askDeleteCommunity(community: AppAdminCommunityRecord) {
    Alert.alert(
      'Topluluğu sil',
      `${community.name} topluluğunu silmek istediğine emin misin?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Devam et',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Son onay',
              'Bu işlem geri alınamaz. Topluluğa ait tüm kayıtlar ve yüklenmiş dosyalar kalıcı olarak silinecek.',
              [
                { text: 'İptal', style: 'cancel' },
                {
                  text: 'Evet, kalıcı olarak sil',
                  style: 'destructive',
                  onPress: () => {
                    void deleteCommunity(community);
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }

  if (!currentUser) return null;

  if (!isLoading && !isAppAdmin) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 58 }}>
        <TouchableOpacity onPress={goBackBySource} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ paddingVertical: 6, paddingHorizontal: 8, alignSelf: 'flex-start' }}>
          <Text style={{ fontSize: 38, lineHeight: 38 }}>‹</Text>
        </TouchableOpacity>
        <Text style={{ marginTop: 14, color: colors.text, fontSize: 24, fontWeight: '800' }}>Yetkisiz işlem</Text>
        <Text style={{ marginTop: 8, color: colors.muted }}>Bu sayfa sadece sistem yöneticileri içindir.</Text>
      </View>
    );
  }

  return (
    <RefreshableScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 36 }}>
      <TouchableOpacity onPress={goBackBySource} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ paddingVertical: 6, paddingHorizontal: 8, alignSelf: 'flex-start' }}>
        <Text style={{ fontSize: 38, lineHeight: 38 }}>‹</Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text, marginTop: 10 }}>Topluluk Admin İşlemleri</Text>
      <Text style={{ color: colors.muted, marginTop: 5 }}>Bekleyen topluluk onayları: {pendingCount}</Text>

      {isLoading ? (
        <Card style={{ marginTop: 14 }}>
          <Text style={{ color: colors.muted }}>Topluluk kayıtları yükleniyor...</Text>
        </Card>
      ) : null}

      {!isLoading && sortedRows.length === 0 ? (
        <Card style={{ marginTop: 14 }}>
          <Text style={{ color: colors.muted }}>Topluluk kaydı bulunamadı.</Text>
        </Card>
      ) : null}

      {!isLoading && sortedRows.map((item, index) => {
        const statusColor = item.status === 'approved' ? '#2F7A44' : item.status === 'rejected' ? '#A94842' : '#94601F';
        const statusBg = item.status === 'approved' ? '#EAF7ED' : item.status === 'rejected' ? '#FDECEC' : '#FFF4D6';
        const canAct = actioningCommunityId !== item.id;

        return (
          <Card key={item.id} style={{ marginTop: index === 0 ? 14 : 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', color: colors.text, fontSize: 16 }}>{item.name}</Text>
                <Text style={{ color: colors.muted, marginTop: 4 }}>{item.neighborhood || 'Bölge belirtilmedi'}</Text>
                <Text style={{ color: colors.muted, marginTop: 2, fontSize: 12 }}>
                  Oluşturan: {item.createdByName}
                </Text>
                <Text style={{ color: colors.muted, marginTop: 2, fontSize: 12 }}>
                  {item.createdAt ? new Date(item.createdAt).toLocaleString('tr-TR') : ''}
                </Text>
              </View>
              <View style={{ backgroundColor: statusBg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text style={{ color: statusColor, fontWeight: '800', fontSize: 12 }}>
                  {item.status === 'approved' ? 'ONAYLI' : item.status === 'rejected' ? 'REDDEDİLDİ' : 'BEKLİYOR'}
                </Text>
              </View>
            </View>

            {item.description ? (
              <Text style={{ color: colors.text, marginTop: 10, lineHeight: 20 }}>Açıklama: {item.description}</Text>
            ) : null}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity
                disabled={!canAct}
                onPress={() => setStatus(item.id, 'approved')}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  paddingVertical: 10,
                  backgroundColor: '#2F7A44',
                  opacity: canAct ? 1 : 0.6,
                }}
              >
                <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800' }}>
                  {actioningCommunityId === item.id ? 'İşleniyor...' : 'Onayla'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                disabled={!canAct}
                onPress={() => setStatus(item.id, 'rejected')}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  paddingVertical: 10,
                  backgroundColor: '#A94842',
                  opacity: canAct ? 1 : 0.6,
                }}
              >
                <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800' }}>Reddet</Text>
              </TouchableOpacity>

              <TouchableOpacity
                disabled={!canAct}
                onPress={() => askDeleteCommunity(item)}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  paddingVertical: 10,
                  backgroundColor: '#7A1010',
                  opacity: canAct ? 1 : 0.6,
                }}
              >
                <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800' }}>
                  {actioningCommunityId === item.id ? 'İşleniyor...' : 'Sil'}
                </Text>
              </TouchableOpacity>
            </View>
          </Card>
        );
      })}
    </RefreshableScrollView>
  );
}
