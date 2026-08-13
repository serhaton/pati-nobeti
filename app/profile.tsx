import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { Image, View, Text, TouchableOpacity } from 'react-native';
import { useAuth } from '../src/context/AuthContext';
import { Card } from '../src/components/Card';
import { useCommunity } from '../src/context/CommunityContext';
import { colors } from '../src/theme';
import { isSupabaseDataEnabled } from '../src/services/supabase';
import { getUserProfileSettings } from '../src/services/communityService';

export default function Profile() {
  const { currentUser, signOut } = useAuth();
  const { selectedCommunity, clearSelectedCommunity } = useCommunity();
  const [displayName, setDisplayName] = useState(currentUser?.fullName ?? 'Gonullu');
  const [avatarUrl, setAvatarUrl] = useState('');

  useFocusEffect(
    useCallback(() => {
      let mounted = true;

      async function loadProfileUi() {
        if (!currentUser) return;

        if (!isSupabaseDataEnabled()) {
          if (!mounted) return;
          setDisplayName(currentUser.fullName ?? 'Gonullu');
          setAvatarUrl('');
          return;
        }

        try {
          const profile = await getUserProfileSettings(currentUser.id);
          if (!mounted) return;
          setDisplayName(profile.fullName || currentUser.fullName || 'Gonullu');
          setAvatarUrl(profile.avatarUrl || '');
        } catch {
          if (!mounted) return;
          setDisplayName(currentUser.fullName ?? 'Gonullu');
          setAvatarUrl('');
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
      <TouchableOpacity onPress={() => router.back()}><Text style={{ fontSize: 30 }}>‹</Text></TouchableOpacity>
      <View style={{ alignItems: 'center', marginTop: 20 }}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={{ width: 78, height: 78, borderRadius: 28, backgroundColor: '#EAECEF' }} />
        ) : (
          <View style={{ width: 78, height: 78, borderRadius: 28, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 36 }}>👤</Text></View>
        )}
        <Text style={{ fontSize: 23, fontWeight: '800', color: colors.text, marginTop: 12 }}>{displayName}</Text>
        <Text style={{ color: colors.muted }}>Seçili: {selectedCommunity?.name ?? '-'}</Text>
      </View>
      <Card style={{ marginTop: 25 }}>
        {['Topluluklarim', 'Ayarlar'].map((x) => (
          <TouchableOpacity
            key={x}
            onPress={() => {
              if (x === 'Topluluklarim') {
                router.push('/my-communities');
                return;
              }
              if (x === 'Ayarlar') {
                router.push('/settings');
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
