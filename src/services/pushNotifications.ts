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
    // Some projects enforce strict profiles RLS. Do not block push registration for this helper step.
    console.warn('[push] ensureProfileExists skipped due to policy:', {
      code: error?.code,
      message: error?.message,
    });
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

    // Best-effort only: in strict RLS setups this can fail and should not block token registration.
    await ensureProfileExists(userId);

    const nowIso = new Date().toISOString();
    const registerPayload = {
      p_expo_push_token: token,
      p_platform: Platform.OS,
      p_last_seen_at: nowIso,
    };

    let { error: registerRpcError } = await supabase.rpc('register_user_device', registerPayload);

    const isAuthMissingError = (error: any) => {
      const code = String(error?.code ?? '').toUpperCase();
      const message = String(error?.message ?? '').toLowerCase();
      return code === 'P0001' && message.includes('kullanici dogrulanamadi');
    };

    if (registerRpcError && isAuthMissingError(registerRpcError)) {
      // Transient auth context issue can happen right after login/signup; retry once after refresh.
      await supabase.auth.refreshSession();
      const retried = await supabase.rpc('register_user_device', {
        ...registerPayload,
        p_last_seen_at: new Date().toISOString(),
      });
      registerRpcError = retried.error;
    }

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

    // Kick notification processor to flush pending/failed queue.
    // This helps when push events were created before recipient tokens were active.
    try {
      await supabase.functions.invoke('admin-approval-push', {
        body: {},
      });
    } catch (dispatchError: any) {
      console.warn('[push] Notification dispatch after token registration failed:', {
        userId,
        message: dispatchError?.message ?? null,
      });
    }

    return token;
  } catch (error: any) {
    // Use warn instead of error to avoid red-screen in development for non-fatal push registration issues.
    console.warn('[push] Push token registration skipped:', {
      code: error?.code ?? null,
      message: error?.message ?? String(error),
      details: error?.details ?? null,
    });
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

export async function sendDirectPushNotification(input: {
  recipientUserId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  if (!isSupabaseDataEnabled()) return;

  const recipientUserId = String(input.recipientUserId ?? '').trim();
  const title = String(input.title ?? '').trim();
  const body = String(input.body ?? '').trim();
  if (!recipientUserId || !title || !body) return;

  try {
    await supabase.functions.invoke('admin-approval-push', {
      body: {
        directNotification: {
          recipientUserId,
          title,
          body,
          data: input.data ?? {},
        },
      },
    });
  } catch (error: any) {
    console.warn('[push] Direct notification invoke failed:', {
      recipientUserId,
      message: error?.message ?? null,
    });
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
