import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, View, Text, TouchableOpacity } from 'react-native';
import { useAuth } from '../src/context/AuthContext';
import { Card } from '../src/components/Card';
import { useCommunity } from '../src/context/CommunityContext';
import { colors } from '../src/theme';
import { isSupabaseDataEnabled } from '../src/services/supabase';
import { getIsCurrentUserAppAdmin, getUserProfileSettings } from '../src/services/communityService';

function resolveDisplayName(input: { profileName?: string; authName?: string; email?: string }): string {
  const profileName = String(input.profileName ?? '').trim().replace(/\s+/g, ' ');
  if (profileName && !profileName.includes('@')) return profileName;

  const authName = String(input.authName ?? '').trim().replace(/\s+/g, ' ');
  const emailPrefix = String(input.email ?? '').split('@')[0].trim().toLowerCase();
  if (authName && !authName.includes('@') && authName.toLowerCase() !== emailPrefix) return authName;

  return 'Gönüllü';
}

export default function Profile() {
  const params = useLocalSearchParams<{ source?: string }>();
  const { currentUser, signOut } = useAuth();
  const { selectedCommunity, clearSelectedCommunity } = useCommunity();
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isAppAdmin, setIsAppAdmin] = useState(false);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const source = Array.isArray(params.source) ? params.source[0] : params.source;

  function goBackBySource() {
    if (source === 'home') {
      router.replace('/home');
      return;
    }

    if (source === 'community') {
      router.replace('/community');
      return;
    }

    router.back();
  }

  useFocusEffect(
    useCallback(() => {
      let mounted = true;

      async function loadProfileUi() {
        if (!currentUser) return;

        setIsProfileLoading(true);

        if (!isSupabaseDataEnabled()) {
          if (!mounted) return;
          setDisplayName(resolveDisplayName({ authName: currentUser.fullName, email: currentUser.email }));
          setAvatarUrl('');
          setIsAppAdmin(false);
          setIsProfileLoading(false);
          return;
        }

        try {
          const [profile, appAdminFlag] = await Promise.all([
            getUserProfileSettings(currentUser.id),
            getIsCurrentUserAppAdmin(currentUser.id),
          ]);
          if (!mounted) return;
          setDisplayName(resolveDisplayName({ profileName: profile.fullName, authName: currentUser.fullName, email: currentUser.email }));
          setAvatarUrl(profile.avatarUrl || '');
          setIsAppAdmin(appAdminFlag);
        } catch {
          if (!mounted) return;
          setDisplayName(resolveDisplayName({ authName: currentUser.fullName, email: currentUser.email }));
          setAvatarUrl('');
          setIsAppAdmin(false);
        } finally {
          if (!mounted) return;
          setIsProfileLoading(false);
        }
      }

      loadProfileUi();

      return () => {
        mounted = false;
      };
    }, [currentUser?.fullName, currentUser?.id])
  );

  async function handleLogout() {
    clearSelectedCommunity();
    await signOut();
    router.replace('/');
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 58 }}>
      <TouchableOpacity onPress={goBackBySource} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ paddingVertical: 6, paddingHorizontal: 8, alignSelf: 'flex-start' }}><Text style={{ fontSize: 38, lineHeight: 38 }}>‹</Text></TouchableOpacity>
      <View style={{ alignItems: 'center', marginTop: 20 }}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={{ width: 78, height: 78, borderRadius: 28, backgroundColor: '#EAECEF' }} />
        ) : (
          <View style={{ width: 78, height: 78, borderRadius: 28, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 36 }}>👤</Text></View>
        )}
        {isProfileLoading ? (
          <View style={{ marginTop: 12, alignItems: 'center' }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ color: colors.muted, marginTop: 6 }}>Profil yükleniyor...</Text>
          </View>
        ) : (
          <Text style={{ fontSize: 23, fontWeight: '800', color: colors.text, marginTop: 12 }}>{displayName}</Text>
        )}
        <Text style={{ color: colors.muted }}>Seçili: {selectedCommunity?.name ?? '-'}</Text>
      </View>
      <Card style={{ marginTop: 25 }}>
        {['Topluluklarim', 'Ayarlar', 'Bildirimlerim', ...(isAppAdmin ? ['Topluluk Admin İşlemleri'] : [])].map((x) => (
          <TouchableOpacity
            key={x}
            onPress={() => {
              if (x === 'Topluluklarim') {
                router.push({ pathname: '/my-communities', params: source ? { source } : undefined });
                return;
              }
              if (x === 'Ayarlar') {
                router.push({ pathname: '/settings', params: source ? { source } : undefined });
                return;
              }
              if (x === 'Bildirimlerim') {
                router.push({ pathname: '/notifications', params: { source: 'profile' } });
                return;
              }
              if (x === 'Topluluk Admin İşlemleri') {
                router.push({ pathname: '/community-admin-approvals', params: { source: 'profile' } });
              }
            }}
            style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}
          >
            <Text style={{ color: colors.text, fontWeight: '700' }}>{x}</Text>
          </TouchableOpacity>
        ))}
      </Card>

      <TouchableOpacity
        onPress={() => {
          clearSelectedCommunity();
          router.replace('/community-select');
        }}
        style={{ marginTop: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 13 }}
      >
        <Text style={{ color: colors.text, fontWeight: '700', textAlign: 'center' }}>Topluluk Değiştir</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handleLogout}
        style={{ marginTop: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.danger, borderRadius: 12, padding: 13 }}
      >
        <Text style={{ color: colors.danger, fontWeight: '800', textAlign: 'center' }}>Cikis Yap</Text>
      </TouchableOpacity>
    </View>
  );
}
