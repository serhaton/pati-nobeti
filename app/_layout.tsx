import { Stack, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
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
    const allowWithoutAuth =
      pathname === '/'
      || pathname === '/register'
      || pathname === '/auth/confirm'
      || pathname === '/auth/reset-password';

    if (!currentUser && !allowWithoutAuth) {
      router.replace('/');
      return;
    }

    if (currentUser && pathname === '/') {
      router.replace('/community-select');
      return;
    }

    const allowWithoutCommunity =
      pathname === '/'
      || pathname === '/register'
      || pathname === '/auth/confirm'
      || pathname === '/auth/reset-password'
      || pathname === '/community-select'
      || pathname === '/profile'
      || pathname === '/my-communities'
      || pathname === '/settings'
      || pathname === '/notifications'
      || pathname === '/community-admin-approvals';

    if (currentUser && !selectedCommunity && !allowWithoutCommunity) {
      router.replace('/community-select');
      return;
    }

    if (
      currentUser
      && selectedCommunity
      && selectedCommunity.status === 'rejected'
      && !allowWithoutCommunity
    ) {
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

    const unsubscribe = subscribeToPushNavigation(async ({ screen, communityId, eventType }) => {
      if (
        eventType === 'join_request_pending'
        || eventType === 'expense_pending'
        || eventType === 'contribution_pending'
      ) {
        if (communityId) {
          void ensureCommunitySelectedById(communityId).catch(() => {
            // Navigation should still proceed even if selection refresh fails.
          });
        }
        router.replace('/community');
        return;
      }

      if (eventType === 'community_pending') {
        router.replace('/community-admin-approvals');
        return;
      }

      if (eventType === 'community_approved') {
        router.replace('/community-select');
        return;
      }

      if (communityId) {
        void ensureCommunitySelectedById(communityId).catch(() => {
          // Navigation should still proceed even if selection refresh fails.
        });
        router.replace('/community');
        return;
      }

      if (screen === 'home') {
        router.replace('/home');
        return;
      }

      if (screen === 'community') {
        router.replace('/community');
        return;
      }

      router.replace('/community');
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
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
    >
      <AuthProvider>
        <CommunityProvider>
          <StatusBar style="dark" />
          <CommunityGuard />
          <PushNotificationsBootstrap />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
        </CommunityProvider>
      </AuthProvider>
    </KeyboardAvoidingView>
  );
}
