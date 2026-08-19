import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { RefreshableScrollView } from '../src/components/RefreshableScrollView';
import { Card } from '../src/components/Card';
import { useAuth } from '../src/context/AuthContext';
import { useCommunity } from '../src/context/CommunityContext';
import { colors } from '../src/theme';
import {
  getCommunityMembersForAdmin,
  ManagedCommunityMember,
  updateCommunityMemberByAdmin,
} from '../src/services/communityService';
import { isSupabaseDataEnabled } from '../src/services/supabase';

export default function CommunityMembersScreen() {
  const params = useLocalSearchParams<{ source?: string }>();
  const { currentUser } = useAuth();
  const { selectedCommunity } = useCommunity();
  const [members, setMembers] = useState<ManagedCommunityMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actioningMemberId, setActioningMemberId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');

  const selectedCommunityId = selectedCommunity?.id ?? null;
  const isCommunityAdmin = !!currentUser && selectedCommunity?.adminUserIds.includes(currentUser.id);
  const source = Array.isArray(params.source) ? params.source[0] : params.source;

  function goBackBySource() {
    if (source === 'community') {
      router.replace('/community');
      return;
    }
    router.replace('/home');
  }

  const activeAdminCount = useMemo(() => (
    members.filter((member) => member.role === 'admin' && (member.status === 'active' || member.status === 'approved')).length
  ), [members]);

  const filteredMembers = useMemo(() => {
    const normalized = searchText.trim().toLowerCase();
    if (!normalized) return members;

    return members.filter((member) => {
      const fullName = member.fullName.toLowerCase();
      const username = member.username.toLowerCase();
      return fullName.includes(normalized) || username.includes(normalized);
    });
  }, [members, searchText]);

  const loadMembers = useCallback(async () => {
    if (!selectedCommunityId || !isCommunityAdmin || !isSupabaseDataEnabled()) {
      setMembers([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const rows = await getCommunityMembersForAdmin(selectedCommunityId);
      setMembers(rows);
    } catch (error: any) {
      Alert.alert('Üye listesi hatası', String(error?.message ?? 'Üyeler yüklenemedi.'));
    } finally {
      setIsLoading(false);
    }
  }, [isCommunityAdmin, selectedCommunityId]);

  useFocusEffect(
    useCallback(() => {
      loadMembers();
    }, [loadMembers])
  );

  async function toggleBlock(member: ManagedCommunityMember) {
    if (!selectedCommunityId) return;

    if (currentUser?.id === member.userId) {
      Alert.alert('İşlem engellendi', 'Kendi uyeligini bu ekrandan bloklayamazsin.');
      return;
    }

    const nextStatus = member.status === 'passive' ? 'active' : 'passive';
    setActioningMemberId(member.id);

    try {
      await updateCommunityMemberByAdmin({
        membershipId: member.id,
        communityId: selectedCommunityId,
        status: nextStatus,
      });
      await loadMembers();
    } catch (error: any) {
      Alert.alert('Guncelleme hatası', String(error?.message ?? 'Üye durumu güncellenemedi.'));
    } finally {
      setActioningMemberId(null);
    }
  }

  async function toggleRole(member: ManagedCommunityMember) {
    if (!selectedCommunityId) return;

    if (currentUser?.id === member.userId) {
      Alert.alert('İşlem engellendi', 'Kendi rolünü bu ekrandan degistiremezsin.');
      return;
    }

    if (member.role === 'admin' && activeAdminCount <= 1) {
      Alert.alert('İşlem engellendi', 'Toplulukta en az bir admin kalmalidir.');
      return;
    }

    const nextRole = member.role === 'admin' ? 'member' : 'admin';
    setActioningMemberId(member.id);

    try {
      await updateCommunityMemberByAdmin({
        membershipId: member.id,
        communityId: selectedCommunityId,
        role: nextRole,
      });
      await loadMembers();
    } catch (error: any) {
      Alert.alert('Guncelleme hatası', String(error?.message ?? 'Üye rolu güncellenemedi.'));
    } finally {
      setActioningMemberId(null);
    }
  }

  if (!selectedCommunity) return null;

  return (
    <RefreshableScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 40 }}>
      <TouchableOpacity onPress={goBackBySource} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ paddingVertical: 6, paddingHorizontal: 8, alignSelf: 'flex-start' }}><Text style={{ fontSize: 38, lineHeight: 38 }}>‹</Text></TouchableOpacity>
      <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text, marginTop: 12 }}>Üye Listesi</Text>
      <Text style={{ color: colors.muted, marginTop: 5 }}>{selectedCommunity.name}</Text>

      <TextInput
        value={searchText}
        onChangeText={setSearchText}
        placeholder="Isimden ara"
        placeholderTextColor={colors.muted}
        style={{
          marginTop: 14,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          backgroundColor: '#fff',
          paddingHorizontal: 12,
          paddingVertical: 11,
          color: colors.text,
        }}
      />

      {!isSupabaseDataEnabled() ? (
        <Card style={{ marginTop: 18 }}>
          <Text style={{ color: colors.muted }}>Bu ekran şu anda aktif değil.</Text>
        </Card>
      ) : null}

      {!isCommunityAdmin ? (
        <Card style={{ marginTop: 18 }}>
          <Text style={{ color: colors.text, fontWeight: '800' }}>Yetki gerekli</Text>
          <Text style={{ color: colors.muted, marginTop: 6 }}>Bu sayfayi sadece topluluk yöneticileri kullanabilir.</Text>
        </Card>
      ) : null}

      {isCommunityAdmin && isSupabaseDataEnabled() ? (
        <>
          <Card style={{ marginTop: 18, marginBottom: 10 }}>
            <Text style={{ color: colors.text, fontWeight: '800' }}>{filteredMembers.length} üye</Text>
            <Text style={{ color: colors.muted, marginTop: 5 }}>
              Üyeleri bloklayabilir veya rollerini güncelleyebilirsin.
            </Text>
          </Card>

          {isLoading ? (
            <View style={{ marginTop: 18, alignItems: 'center' }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null}

          {!isLoading && filteredMembers.length === 0 ? (
            <Card>
              <Text style={{ color: colors.muted }}>Aramana uygun üye bulunamadı.</Text>
            </Card>
          ) : null}

          {!isLoading ? filteredMembers.map((member) => {
            const isBusy = actioningMemberId === member.id;
            const isBlocked = member.status === 'passive';
            const roleLabel = member.role === 'admin' ? 'Admin' : 'Üye';

            return (
              <Card key={member.id} style={{ marginBottom: 10 }}>
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>{member.fullName}</Text>
                <Text style={{ color: colors.muted, marginTop: 4 }}>@{member.username || 'kullanici'}</Text>
                <Text style={{ color: colors.muted, marginTop: 6 }}>Rol: {roleLabel} · Durum: {member.status}</Text>

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <TouchableOpacity
                    disabled={isBusy}
                    onPress={() => toggleRole(member)}
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 10,
                      paddingVertical: 10,
                      opacity: isBusy ? 0.7 : 1,
                    }}
                  >
                    <Text style={{ textAlign: 'center', color: colors.text, fontWeight: '700' }}>
                      {member.role === 'admin' ? 'Rolünü Üye Yap' : 'Rolünü Admin Yap'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    disabled={isBusy}
                    onPress={() => toggleBlock(member)}
                    style={{
                      flex: 1,
                      backgroundColor: isBlocked ? colors.primary : '#D97A7A',
                      borderRadius: 10,
                      paddingVertical: 10,
                      opacity: isBusy ? 0.7 : 1,
                    }}
                  >
                    <Text style={{ textAlign: 'center', color: '#fff', fontWeight: '700' }}>
                      {isBlocked ? 'Engeli Kaldır' : 'Üyeyi Blokla'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {currentUser?.id === member.userId ? (
                  <Text style={{ color: colors.muted, marginTop: 8, fontSize: 12 }}>
                    Kendi üyelik kaydını bu ekrandan degistiremezsin.
                  </Text>
                ) : null}
              </Card>
            );
          }) : null}
        </>
      ) : null}
    </RefreshableScrollView>
  );
}
