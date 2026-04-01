// FILE: apps/mobile/services/notifications.ts

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { registerFCMToken, getToken } from './api';

// ── Foreground notification display config ────────────────────
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge:  false,
    }),
  });
}

// ── Top-level setup — call once in _layout.tsx ───────────────
// Registers push token, attaches listeners, and handles cold-start taps.
// Returns a cleanup function to remove listeners on unmount.
// FIX: Call this AFTER appReady so the Supabase session is confirmed
// before we attempt to POST the FCM token (avoids the 401 on cold start).

export function setupNotifications(): () => void {
  registerForPushNotifications().catch((err) =>
    console.error('[Notifications] Setup error:', err)
  );
  handleInitialNotification().catch((err) =>
    console.error('[Notifications] Initial notification error:', err)
  );

  return setupNotificationListeners();
}

// ── Register device for push notifications ────────────────────

export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') {
    console.log('[Notifications] Web push skipped — VAPID not configured');
    return null;
  }

  if (!Device.isDevice) {
    console.log('[Notifications] Skipping — simulator detected');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[Notifications] Permission denied by user');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('signals', {
      name:             'SMC Signals',
      importance:       Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor:       '#00D4FF',
      sound:            'default',
      enableVibrate:    true,
    });
  }

  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (!projectId) {
    throw new Error(
      '[Notifications] Missing EXPO_PUBLIC_EAS_PROJECT_ID in .env — ' +
      'run `eas project:info` to find your project ID.'
    );
  }

  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = tokenData.data;
  console.log('[Notifications] Push token acquired:', token);

  // FIX: Verify we have a valid session token before POSTing to /user/fcm-token.
  // Without this guard the request fires during cold start before Supabase has
  // restored the session, resulting in a 401 Unauthorized from the API server.
  const sessionToken = await getToken();
  if (!sessionToken) {
    console.warn('[Notifications] No active session — skipping FCM token registration (will retry on next launch)');
    return token;
  }

  try {
    await registerFCMToken(token);
    console.log('[Notifications] Token registered with server');
  } catch (err) {
    console.error('[Notifications] Token registration failed:', err);
  }

  return token;
}

// ── Deep link handler — notification tap → screen ─────────────

export function setupNotificationListeners(): () => void {
  if (Platform.OS === 'web') {
    return () => {};
  }

  const responseSub = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data as {
        screen?: string;
        signalId?: string;
        pair?: string;
      };

      if (data.screen === 'signal-detail' && data.signalId) {
        router.push({
          pathname: '/signal/[id]',
          params:   { id: data.signalId },
        });
        return;
      }

      if (data.screen === 'signals') {
        router.push('/(tabs)/signals');
      }
    }
  );

  const receivedSub = Notifications.addNotificationReceivedListener(
    (notification) => {
      const title = notification.request.content.title ?? '';
      console.log('[Notifications] Foreground notification:', title);
    }
  );

  return () => {
    responseSub.remove();
    receivedSub.remove();
  };
}

// ── Check for notification that launched the app ─────────────

export async function handleInitialNotification(): Promise<void> {
  if (Platform.OS === 'web') return;

  const response = await Notifications.getLastNotificationResponseAsync();
  if (!response) return;

  const data = response.notification.request.content.data as {
    screen?: string;
    signalId?: string;
  };

  if (data.screen === 'signal-detail' && data.signalId) {
    const signalId = data.signalId;
    setTimeout(() => {
      router.push({
        pathname: '/signal/[id]',
        params:   { id: signalId },
      });
    }, 500);
  }
}