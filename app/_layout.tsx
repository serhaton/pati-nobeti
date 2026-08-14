import { Stack, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { AuthProvider } from '../src/context/AuthContext';
import { useAuth } from '../src/context/AuthContext';
import { CommunityProvider, useCommunity } from '../src/context/CommunityContext';
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
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
        </CommunityProvider>
      </AuthProvider>
    </View>
  );
}
