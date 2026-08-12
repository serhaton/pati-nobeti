import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, ActivityIndicator, ScrollView, View, Text, TouchableOpacity } from 'react-native';
import { Card } from '../src/components/Card';
import { useCommunity } from '../src/context/CommunityContext';
import { useAuth } from '../src/context/AuthContext';
import { colors } from '../src/theme';
import { getAnimalsByCommunity } from '../src/data/animalStore';
import { getCommunityMembers } from '../src/data/mock';
import {
  approveJoinRequest,
  getPendingJoinRequestsForCommunity,
  PendingJoinRequest,
  rejectJoinRequest,
} from '../src/services/communityService';
import { isSupabaseDataEnabled } from '../src/services/supabase';

export default function Community() {
  const { selectedCommunity, refreshCommunities } = useCommunity();
  const { currentUser } = useAuth();
  const [pendingRequests, setPendingRequests] = useState<PendingJoinRequest[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [actioningRequestId, setActioningRequestId] = useState<string | null>(null);
  const selectedCommunityId = selectedCommunity?.id ?? null;
  const isCommunityAdmin = !!currentUser && selectedCommunity?.adminUserIds.includes(currentUser.id);
  const communityMenuItems = [
    ...(isCommunityAdmin ? [
      ['🛡️', 'Uye Listesi ve Yetkiler', '/community-members'],
      ['🩺', 'Veterinerler', '/veterinarians'],
    ] : []),
    ['🗺️', 'Harita ve besleme noktalari', '/map'],
    ['🐾', 'Can dostlar', '/animal'],
    ['💰', 'Gelir / gider ve borclar', '/expenses'],
    ['📣', 'Duyurular', '/community'],
  ] as const;
  const memberCount = useMemo(() => {
    if (!selectedCommunity) return 0;
    return getCommunityMembers(selectedCommunity.id)
      .filter((member) => member.status === 'active')
      .length;
  }, [selectedCommunity]);
  const animalCount = useMemo(() => {
    if (!selectedCommunity) return 0;
    return getAnimalsByCommunity(selectedCommunity.id).length;
  }, [selectedCommunity]);

  const loadPendingRequests = useCallback(async () => {
    if (!selectedCommunityId || !isCommunityAdmin || !isSupabaseDataEnabled()) {
      setPendingRequests([]);
      return;
    }

    setIsLoadingRequests(true);
    try {
      const rows = await getPendingJoinRequestsForCommunity(selectedCommunityId);
      setPendingRequests(rows);
    } catch (error: any) {
      Alert.alert('Istek okuma hatasi', String(error?.message ?? 'Katilim istekleri yuklenemedi.'));
    } finally {
      setIsLoadingRequests(false);
    }
  }, [isCommunityAdmin, selectedCommunityId]);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;

      async function refreshScreenData() {
        await refreshCommunities();
        if (!mounted) return;
        await loadPendingRequests();
      }

      refreshScreenData();

      return () => {
        mounted = false;
      };
    }, [loadPendingRequests, refreshCommunities])
  );

  async function onApprove(request: PendingJoinRequest) {
    setActioningRequestId(request.id);
    try {
      await approveJoinRequest({
        requestId: request.id,
        communityId: request.communityId,
        userId: request.userId,
      });
      await refreshCommunities();
      await loadPendingRequests();
    } catch (error: any) {
      Alert.alert('Onay hatasi', String(error?.message ?? 'Istek onaylanamadi.'));
    } finally {
      setActioningRequestId(null);
    }
  }

  async function onReject(request: PendingJoinRequest) {
    setActioningRequestId(request.id);
    try {
      await rejectJoinRequest({
        requestId: request.id,
        communityId: request.communityId,
        userId: request.userId,
      });
      await refreshCommunities();
      await loadPendingRequests();
    } catch (error: any) {
      Alert.alert('Red hatasi', String(error?.message ?? 'Istek reddedilemedi.'));
    } finally {
      setActioningRequestId(null);
    }
  }

  if (!selectedCommunity) return null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 40 }}>
      <TouchableOpacity onPress={() => router.back()}><Text style={{ fontSize: 30 }}>‹</Text></TouchableOpacity>
      <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text, marginTop: 12 }}>{selectedCommunity.name}</Text>
      <Text style={{ color: colors.muted, marginTop: 5 }}>{selectedCommunity.neighborhood} · {memberCount} uye · {animalCount} can dost</Text>

      <View style={{ flexDirection: 'row', gap: 9, marginTop: 22 }}>
        {[
          [String(animalCount),'Can Dost'],
          ['12','Besleme'],
          [`${selectedCommunity.debt.toLocaleString('tr-TR')} ₺`,'Acik Borc']
        ].map(([v,l]) => <Card key={l} style={{ flex: 1, padding: 13 }}><Text style={{ fontWeight: '800', fontSize: 18, color: colors.text }}>{v}</Text><Text style={{ color: colors.muted, marginTop: 3, fontSize: 12 }}>{l}</Text></Card>)}
      </View>

      {isCommunityAdmin ? (
        <>
          <Text style={{ fontSize: 19, fontWeight: '800', color: colors.text, marginTop: 28, marginBottom: 12 }}>Yönetici işlemleri</Text>
          <Card>
            <Text style={{ fontWeight: '800', color: colors.text, fontSize: 16 }}>
              {pendingRequests.length} yeni katilim istegi
            </Text>

            {isLoadingRequests ? (
              <View style={{ marginTop: 12, alignItems: 'center' }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : null}

            {!isLoadingRequests && pendingRequests.length === 0 ? (
              <Text style={{ color: colors.muted, marginTop: 10 }}>Bekleyen katilim istegi yok.</Text>
            ) : null}

            {pendingRequests.map((r) => (
              <View key={r.id} style={{ paddingTop: 15, marginTop: 13, borderTopWidth: 1, borderTopColor: colors.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontWeight: '800', color: colors.primary }}>
                      {r.requesterName
                        .split(' ')
                        .map((part) => part[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ fontWeight: '800', color: colors.text }}>{r.requesterName}</Text>
                    <Text style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}>{r.note || 'Not yok'}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 11 }}>
                  <TouchableOpacity
                    disabled={actioningRequestId === r.id}
                    onPress={() => onApprove(r)}
                    style={{ flex: 1, backgroundColor: colors.primary, borderRadius: 12, padding: 11, opacity: actioningRequestId === r.id ? 0.7 : 1 }}
                  >
                    <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>Onayla</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={actioningRequestId === r.id}
                    onPress={() => onReject(r)}
                    style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 11, opacity: actioningRequestId === r.id ? 0.7 : 1 }}
                  >
                    <Text style={{ color: colors.text, textAlign: 'center', fontWeight: '700' }}>Reddet</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

          </Card>
        </>
      ) : null}

      <Text style={{ fontSize: 19, fontWeight: '800', color: colors.text, marginTop: 28, marginBottom: 12 }}>Topluluk menüsü</Text>
      {communityMenuItems.map(([icon,label,path]) => (
        <TouchableOpacity key={label} onPress={() => router.push(path as any)}>
          <Card style={{ marginBottom: 9 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 24, width: 38 }}>{icon}</Text>
              <Text style={{ fontWeight: '700', color: colors.text, flex: 1 }}>{label}</Text>
              <Text style={{ fontSize: 23 }}>›</Text>
            </View>
          </Card>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}
