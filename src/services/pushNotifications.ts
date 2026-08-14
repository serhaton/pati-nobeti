import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { isSupabaseDataEnabled, supabase } from './supabase';

let activeExpoPushToken: string | null = null;
let notificationHandlerConfigured = false;
let lastHandledNotificationId: string | null = null;

async function ensureProfileExists(userId: string): Promise<void> {
  const { error } = await supabase.from('profiles').upsert({ id: userId }, { onConflict: 'id' });
  if (error) {
    throw error;
  }
}

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
      console.warn('[push] Notification permission not granted for user:', userId);
      return null;
    }

    const projectId = getProjectId();
    if (!projectId) {
      console.warn('[push] EAS projectId not found. Skipping push token registration.');
      return null;
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResponse.data;
    activeExpoPushToken = token;

    // Ensure FK target exists if auth trigger has not been applied yet.
    await ensureProfileExists(userId);

    const nowIso = new Date().toISOString();
    const { error: registerRpcError } = await supabase.rpc('register_user_device', {
      p_expo_push_token: token,
      p_platform: Platform.OS,
      p_last_seen_at: nowIso,
    });

    if (registerRpcError) {
      const functionMissing =
        registerRpcError.code === '42883'
        || String(registerRpcError.message ?? '').toLowerCase().includes('register_user_device');

      if (!functionMissing) {
        throw registerRpcError;
      }

      const { error: fallbackError } = await supabase
        .from('user_devices')
        .upsert(
          {
            user_id: userId,
            expo_push_token: token,
            platform: Platform.OS,
            is_active: true,
            last_seen_at: nowIso,
          },
          { onConflict: 'expo_push_token' }
        );

      if (fallbackError) {
        throw fallbackError;
      }
    }

    console.log('[push] Token registered for user:', userId);

    return token;
  } catch (error) {
    console.error('[push] Failed to register push token:', error);
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
  onNavigate: (payload: { screen?: string; communityId?: string; eventType?: string }) => void
): () => void {
  const handleNotificationResponse = (response: Notifications.NotificationResponse) => {
    const notificationId = response.notification.request.identifier;
    if (notificationId && notificationId === lastHandledNotificationId) {
      return;
    }
    lastHandledNotificationId = notificationId;

    const data = response.notification.request.content.data as Record<string, unknown>;
    onNavigate({
      screen: typeof data?.screen === 'string' ? data.screen : undefined,
      communityId: typeof data?.communityId === 'string' ? data.communityId : undefined,
      eventType: typeof data?.eventType === 'string' ? data.eventType : undefined,
    });
  };

  const subscription = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);

  void Notifications.getLastNotificationResponseAsync().then((response) => {
    if (!response) return;
    handleNotificationResponse(response);
  });

  return () => {
    subscription.remove();
  };
}
