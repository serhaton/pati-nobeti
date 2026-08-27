import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, View, Text, TouchableOpacity, Platform } from 'react-native';
import { RefreshableScrollView } from '../src/components/RefreshableScrollView';
import { BannerAd, BannerAdSize, MobileAds, TestIds } from 'react-native-google-mobile-ads';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../src/context/AuthContext';
import { Card } from '../src/components/Card';
import { Logo } from '../src/components/Logo';
import { useCommunity } from '../src/context/CommunityContext';
import { colors } from '../src/theme';
import { getTodayFeedingRecordCountByCommunity } from '../src/data/feedingPointStore';
import { ExpenseRecord, getApprovedExpensesByCommunity } from '../src/services/expenseService';
import { ContributionRecord, getContributionsByCommunity } from '../src/services/contributionService';
import { isSupabaseDataEnabled } from '../src/services/supabase';
import { getUserProfileSettings } from '../src/services/communityService';

const HOME_BANNER_UNIT_ID = __DEV__
  ? TestIds.BANNER
  : Platform.OS === 'ios'
    ? process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER_ID ?? TestIds.BANNER
    : process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID ?? TestIds.BANNER;

const IS_SHOW_ADS_ENABLED = (process.env.EXPO_PUBLIC_SHOW_ADS ?? 'true').toLowerCase() !== 'false';

export default function Home() {
  const insets = useSafeAreaInsets();
  const showAds = IS_SHOW_ADS_ENABLED;
  const { selectedCommunity } = useCommunity();
  const { currentUser } = useAuth();
  const [approvedExpenses, setApprovedExpenses] = useState<ExpenseRecord[]>([]);
  const [contributions, setContributions] = useState<ContributionRecord[]>([]);
  const [profileDisplayName, setProfileDisplayName] = useState(currentUser?.fullName ?? 'Gonullu');
  const [profileAvatarUrl, setProfileAvatarUrl] = useState('');

  const normalizedFullName = useMemo(() => {
    const normalized = String(profileDisplayName ?? '').trim().replace(/\s+/g, ' ');
    return normalized || 'Gönüllü';
  }, [profileDisplayName]);

  const greetingDisplayName = useMemo(() => {
    const rawName = String(normalizedFullName ?? '').trim();
    if (!rawName || rawName.includes('@')) return 'Gönüllü';

    const emailPrefix = String(currentUser?.email ?? '').split('@')[0].trim().toLowerCase();
    if (emailPrefix && rawName.toLowerCase() === emailPrefix) {
      return 'Gönüllü';
    }

    return rawName;
  }, [currentUser?.email, normalizedFullName]);

  const isCommunityAdmin = !!currentUser && selectedCommunity?.adminUserIds.includes(currentUser.id);
  const todayFedCount = selectedCommunity ? getTodayFeedingRecordCountByCommunity(selectedCommunity.id) : 0;

  const openDebt = useMemo(
    () => approvedExpenses.reduce((total, item) => total + item.dueAmount, 0),
    [approvedExpenses]
  );

  const approvedContributionRemainingTotal = useMemo(
    () => contributions
      .filter((item) => item.approvalStatus === 'approved')
      .reduce((total, item) => total + item.remainingAmount, 0),
    [contributions]
  );

  const debtCreditBalance = useMemo(
    () => approvedContributionRemainingTotal - openDebt,
    [approvedContributionRemainingTotal, openDebt]
  );

  const greetingText = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Günaydın';
    if (hour < 18) return 'İyi günler';
    return 'İyi akşamlar';
  }, []);

  useEffect(() => {
    if (!showAds) return;
    MobileAds().initialize();
  }, [showAds]);

  const loadFinanceSummary = useCallback(async () => {
    if (!selectedCommunity?.id) {
      setApprovedExpenses([]);
      setContributions([]);
      return;
    }

    try {
      const [approvedRows, contributionRows] = await Promise.all([
        getApprovedExpensesByCommunity(selectedCommunity.id),
        getContributionsByCommunity(selectedCommunity.id),
      ]);

      setApprovedExpenses(approvedRows);
      setContributions(contributionRows);
    } catch {
      setApprovedExpenses([]);
      setContributions([]);
    }
  }, [selectedCommunity?.id]);

  const loadProfileUi = useCallback(async () => {
    if (!currentUser) return;

    if (!isSupabaseDataEnabled()) {
      setProfileDisplayName(currentUser.fullName ?? 'Gonullu');
      setProfileAvatarUrl('');
      return;
    }

    try {
      const profile = await getUserProfileSettings(currentUser.id);
      setProfileDisplayName(profile.fullName || currentUser.fullName || 'Gonullu');
      setProfileAvatarUrl(profile.avatarUrl || '');
    } catch {
      setProfileDisplayName(currentUser.fullName ?? 'Gonullu');
      setProfileAvatarUrl('');
    }
  }, [currentUser]);

  useFocusEffect(
    useCallback(() => {
      loadFinanceSummary();
    }, [loadFinanceSummary])
  );

  useFocusEffect(
    useCallback(() => {
      void loadProfileUi();
    }, [loadProfileUi])
  );

  if (!selectedCommunity) return null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <RefreshableScrollView
        onRefreshAction={async () => {
          await Promise.all([loadFinanceSummary(), loadProfileUi()]);
        }}
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: 20,
          paddingTop: 58,
          paddingBottom: showAds ? 110 + insets.bottom : 24 + insets.bottom,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View>
          <Logo small />
          <Text style={{ color: colors.primary, marginTop: 6, fontWeight: '700' }}>{selectedCommunity.name}</Text>
        </View>
        <TouchableOpacity onPress={() => router.push({ pathname: '/profile', params: { source: 'home' } })}>
          {profileAvatarUrl ? (
            <Image source={{ uri: profileAvatarUrl }} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#EAECEF' }} />
          ) : (
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 19 }}>👤</Text>
            </View>
          )}
        </TouchableOpacity>
        </View>

        <View style={{ marginTop: 26 }}>
          <Text style={{ color: colors.muted, fontSize: 14 }}>{greetingText} {greetingDisplayName} 👋</Text>
          <Text style={{ color: colors.text, fontSize: 27, fontWeight: '800', marginTop: 5 }}>Bugün neler oldu?</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
          <TouchableOpacity onPress={() => router.push({ pathname: '/feeding', params: { source: 'home' } })} style={{ flex: 1 }}>
            <Card style={{ flex: 1 }}>
              <Text style={{ fontSize: 25 }}>🥣</Text>
              <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text, marginTop: 7 }}>{todayFedCount}</Text>
              <Text style={{ color: colors.muted }}>Bugünkü besleme kaydı</Text>
            </Card>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push({ pathname: '/finance', params: { source: 'home' } })} style={{ flex: 1 }}>
            <Card style={{ flex: 1 }}>
              <Text style={{ fontSize: 25 }}>💳</Text>
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: '800',
                  color: debtCreditBalance >= 0 ? '#2F7A44' : colors.danger,
                  marginTop: 7,
                }}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {debtCreditBalance >= 0 ? '+' : '-'}{Math.abs(debtCreditBalance).toLocaleString('tr-TR')} ₺
              </Text>
              <Text style={{ color: colors.muted }}>Borç / Alacak</Text>
            </Card>
          </TouchableOpacity>
        </View>

        <Text style={{ fontSize: 19, fontWeight: '800', color: colors.text, marginTop: 18, marginBottom: 12 }}>Hızlı işlemler</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {[
          ['🗺️','Haritayı aç','/map'],
          ['🐱','Can dostlar','/animal'],
          ['🍚','Besleme kaydı','/feeding'],
          ['🧾','Masraf ekle','/expenses'],
          ['🤝','Pati Uzat','/pati-uzat']
        ].map(([icon, label, path]) => (
          <TouchableOpacity
            key={label}
            onPress={() => {
              if (path === '/pati-uzat') {
                router.push({ pathname: '/pati-uzat', params: { view: 'mine', source: 'home' } });
                return;
              }
              if (path === '/expenses') {
                router.push({
                  pathname: '/expenses',
                  params: { mode: 'member-history', source: 'home' },
                });
                return;
              }
              if (path === '/animal') {
                router.push({
                  pathname: '/animal',
                  params: { source: 'home' },
                });
                return;
              }
              if (path === '/map') {
                router.push({ pathname: '/map', params: { source: 'home' } });
                return;
              }
              router.push(path as any);
            }}
            style={{ width: '48%' }}
          >
            <Card>
              <Text style={{ fontSize: 26 }}>{icon}</Text>
              <Text style={{ fontWeight: '700', marginTop: 9, color: colors.text }}>{label}</Text>
            </Card>
          </TouchableOpacity>
        ))}
        </View>

        {isCommunityAdmin ? (
          <>
            <Text style={{ fontSize: 19, fontWeight: '800', color: colors.text, marginTop: 25, marginBottom: 12 }}>Yönetici işlemleri</Text>
            <TouchableOpacity onPress={() => router.push({ pathname: '/community', params: { source: 'home' } })}>
              <Card style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View>
                    <Text style={{ fontWeight: '800', fontSize: 17, color: colors.text }}>{selectedCommunity.name}</Text>
                    <Text style={{ color: colors.muted, marginTop: 5 }}>{selectedCommunity.neighborhood}</Text>
                    <Text style={{ color: colors.muted, marginTop: 2 }}>{selectedCommunity.members} üye · {selectedCommunity.animals} can</Text>
                  </View>
                  <Text style={{ fontSize: 28 }}>›</Text>
                </View>
              </Card>
            </TouchableOpacity>
          </>
        ) : null}
      </RefreshableScrollView>

      {showAds ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            paddingBottom: Math.max(insets.bottom, 8),
            paddingTop: 8,
            alignItems: 'center',
            backgroundColor: colors.background,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <BannerAd
            unitId={HOME_BANNER_UNIT_ID}
            size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
            requestOptions={{ requestNonPersonalizedAdsOnly: true }}
          />
        </View>
      ) : null}
    </View>
  );
}
