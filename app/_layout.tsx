import { Stack, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { AuthProvider } from '../src/context/AuthContext';
import { useAuth } from '../src/context/AuthContext';
import { CommunityProvider, useCommunity } from '../src/context/CommunityContext';
import { configureForegroundNotificationHandler, subscribeToPushNavigation } from '../src/services/pushNotifications';
import { colors } from '../src/theme';

void SplashScreen.preventAutoHideAsync();

function CommunityGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const { currentUser } = useAuth();
  const { selectedCommunity } = useCommunity();

  useEffect(() => {
    if (!currentUser && pathname !== '/') {
      router.replace('/');
      return;
    }

    if (currentUser && pathname === '/') {
      router.replace('/community-select');
      return;
    }

    const allowWithoutCommunity = pathname === '/' || pathname === '/community-select';

    if (currentUser && !selectedCommunity && !allowWithoutCommunity) {
      router.replace('/community-select');
      return;
    }

    if (currentUser && selectedCommunity && pathname === '/community-select') {
      router.replace('/home');
    }
  }, [currentUser, pathname, router, selectedCommunity]);

  return null;
}

function PushNotificationsBootstrap() {
  const router = useRouter();
  const { ensureCommunitySelectedById } = useCommunity();

  useEffect(() => {
    configureForegroundNotificationHandler();

    const unsubscribe = subscribeToPushNavigation(async ({ screen, communityId }) => {
      if (communityId) {
        await ensureCommunitySelectedById(communityId);
      }

      if (screen === 'home') {
        router.push('/home');
        return;
      }

      if (screen === 'community') {
        router.push('/community');
        return;
      }

      router.push('/community');
    });

    return () => {
      unsubscribe();
    };
  }, [ensureCommunitySelectedById, router]);

  return null;
}

export default function Layout() {
  useEffect(() => {
    const splashTimer = setTimeout(() => {
      void SplashScreen.hideAsync();
    }, 2000);

    return () => {
      clearTimeout(splashTimer);
    };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AuthProvider>
        <CommunityProvider>
          <StatusBar style="dark" />
          <CommunityGuard />
          <PushNotificationsBootstrap />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
        </CommunityProvider>
      </AuthProvider>
    </View>
  );
}
