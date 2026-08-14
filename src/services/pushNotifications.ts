import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { isSupabaseDataEnabled, supabase } from './supabase';

let activeExpoPushToken: string | null = null;
let notificationHandlerConfigured = false;

function getProjectId(): string | null {
  const easProjectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof easProjectId === 'string' && easProjectId.length > 0) {
    return easProjectId;
  }

  const fallbackProjectId = (Constants as any)?.easConfig?.projectId;
  if (typeof fallbackProjectId === 'string' && fallbackProjectId.length > 0) {
    return fallbackProjectId;
  }

  return null;
}

export function configureForegroundNotificationHandler() {
  if (notificationHandlerConfigured) return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  notificationHandlerConfigured = true;
}

export async function registerPushTokenForUser(userId: string): Promise<string | null> {
  if (!isSupabaseDataEnabled()) return null;

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const permission = await Notifications.getPermissionsAsync();
    let status = permission.status;

    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }

    if (status !== 'granted') {
      return null;
    }

    const projectId = getProjectId();
    if (!projectId) {
      return null;
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResponse.data;
    activeExpoPushToken = token;

    const { error } = await supabase
      .from('user_devices')
      .upsert(
        {
          user_id: userId,
          expo_push_token: token,
          platform: Platform.OS,
          is_active: true,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'expo_push_token' }
      );

    if (error) {
      throw error;
    }

    return token;
  } catch {
    return null;
  }
}

export async function deactivatePushTokenForUser(userId: string): Promise<void> {
  if (!isSupabaseDataEnabled()) return;

  try {
    if (activeExpoPushToken) {
      await supabase
        .from('user_devices')
        .update({ is_active: false, last_seen_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('expo_push_token', activeExpoPushToken);
    }
  } catch {
    // Ignore push token deactivation errors during logout.
  }
}

export function subscribeToPushNavigation(
  onNavigate: (payload: { screen?: string; communityId?: string }) => void
): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, unknown>;
    onNavigate({
      screen: typeof data?.screen === 'string' ? data.screen : undefined,
      communityId: typeof data?.communityId === 'string' ? data.communityId : undefined,
    });
  });

  return () => {
    subscription.remove();
  };
}
