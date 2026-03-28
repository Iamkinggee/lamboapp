
// import * as Notifications from 'expo-notifications';
// import * as Device from 'expo-device';
// import { Platform } from 'react-native';
// import { router } from 'expo-router';
// import { registerFCMToken } from './api';

// // ── Foreground notification display config ────────────────────
// // FIX 1: Must be inside Platform guard — crashes on web otherwise
// if (Platform.OS !== 'web') {
//   Notifications.setNotificationHandler({
//     handleNotification: async () => ({
//       shouldShowAlert: true,
//       shouldPlaySound: true,
//       shouldSetBadge:  false,
//     }),
//   });
// }

// // ── Top-level setup — call once in _layout.tsx ───────────────
// // Registers push token, attaches listeners, and handles cold-start taps.
// // Returns a cleanup function to remove listeners on unmount.

// export function setupNotifications(): () => void {
//   // Fire-and-forget async work (token registration + cold-start deep link)
//   registerForPushNotifications().catch((err) =>
//     console.error('[Notifications] Setup error:', err)
//   );
//   handleInitialNotification().catch((err) =>
//     console.error('[Notifications] Initial notification error:', err)
//   );

//   // Return listener cleanup for useEffect
//   return setupNotificationListeners();
// }

// // ── Register device for push notifications ────────────────────

// export async function registerForPushNotifications(): Promise<string | null> {
//   // FIX 3: Web push requires VAPID setup in app.json — skip on web
//   // To enable later: run `npx web-push generate-vapid-keys` and
//   // add the public key to app.json → expo.web.notification.vapidPublicKey
//   if (Platform.OS === 'web') {
//     console.log('[Notifications] Web push skipped — VAPID not configured');
//     return null;
//   }

//   // Push only works on real physical devices
//   if (!Device.isDevice) {
//     console.log('[Notifications] Skipping — simulator detected');
//     return null;
//   }

//   // Request permission if not already granted
//   const { status: existingStatus } = await Notifications.getPermissionsAsync();
//   let finalStatus = existingStatus;

//   if (existingStatus !== 'granted') {
//     const { status } = await Notifications.requestPermissionsAsync();
//     finalStatus = status;
//   }

//   if (finalStatus !== 'granted') {
//     console.log('[Notifications] Permission denied by user');
//     return null;
//   }

//   // Android requires a notification channel
//   if (Platform.OS === 'android') {
//     await Notifications.setNotificationChannelAsync('signals', {
//       name:             'SMC Signals',
//       importance:       Notifications.AndroidImportance.HIGH,
//       vibrationPattern: [0, 250, 250, 250],
//       lightColor:       '#00D4FF',
//       sound:            'default',
//       enableVibrate:    true,
//     });
//   }

//   // Guard: EXPO_PUBLIC_EAS_PROJECT_ID must be set in .env
//   const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
//   if (!projectId) {
//     throw new Error(
//       '[Notifications] Missing EXPO_PUBLIC_EAS_PROJECT_ID in .env — ' +
//       'run `eas project:info` to find your project ID.'
//     );
//   }

//   // Get Expo push token (works for both iOS APNs + Android FCM via Expo)
//   const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
//   const token = tokenData.data;
//   console.log('[Notifications] Push token acquired:', token);

//   // Send token to our Node.js backend to store in user_preferences
//   try {
//     await registerFCMToken(token);
//     console.log('[Notifications] Token registered with server');
//   } catch (err) {
//     console.error('[Notifications] Token registration failed:', err);
//   }

//   return token;
// }

// // ── Deep link handler — notification tap → screen ─────────────

// export function setupNotificationListeners(): () => void {
//   // FIX 4: Native notification listeners don't exist on web
//   if (Platform.OS === 'web') {
//     return () => {}; // return no-op cleanup — nothing to remove on web
//   }

//   // Fired when a notification is tapped while app is in background/closed
//   const responseSub = Notifications.addNotificationResponseReceivedListener(
//     (response) => {
//       const data = response.notification.request.content.data as {
//         screen?: string;
//         signalId?: string;
//         pair?: string;
//       };

//       if (data.screen === 'signal-detail' && data.signalId) {
//         router.push({
//           pathname: '/signal/[id]',
//           params:   { id: data.signalId },
//         });
//         return;
//       }

//       if (data.screen === 'signals') {
//         router.push('/(tabs)/signals');
//       }
//     }
//   );

//   // Fired when notification arrives while app is in foreground
//   const receivedSub = Notifications.addNotificationReceivedListener(
//     (notification) => {
//       const title = notification.request.content.title ?? '';
//       console.log('[Notifications] Foreground notification:', title);
//       // No navigation needed — signal appears via WebSocket anyway
//     }
//   );

//   return () => {
//     responseSub.remove();
//     receivedSub.remove();
//   };
// }

// // ── Check for notification that launched the app ─────────────
// // Called on cold start to handle tapped notifications

// export async function handleInitialNotification(): Promise<void> {
//   // FIX 2: getLastNotificationResponseAsync is native-only
//   // Throws UnavailabilityError on web — must guard before calling
//   if (Platform.OS === 'web') return;

//   const response = await Notifications.getLastNotificationResponseAsync();
//   if (!response) return;

//   const data = response.notification.request.content.data as {
//     screen?: string;
//     signalId?: string;
//   };

//   if (data.screen === 'signal-detail' && data.signalId) {
//     const signalId = data.signalId;
//     setTimeout(() => {
//       router.push({
//         pathname: '/signal/[id]',
//         params:   { id: signalId },
//       });
//     }, 500);
//   }
// }



















// FILE: apps/mobile/services/notifications.ts
// PURPOSE: Expo push notification setup — registers device
//          token, configures Android channel, handles deep
//          links from notification taps into signal detail.
//
// FIX 1: Notifications.setNotificationHandler() moved inside
//         Platform.OS !== 'web' guard — web has no native handler
// FIX 2: getLastNotificationResponseAsync() guarded — native-only API
// FIX 3: registerForPushNotifications() early-returns on web —
//         web push requires VAPID key setup, skip for now
// FIX 4: setupNotificationListeners() returns no-op on web —
//         addNotificationResponseReceivedListener is native-only
// ============================================================

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { registerFCMToken } from './api';

// ── Foreground notification display config ────────────────────
// FIX 1: Must be inside Platform guard — crashes on web otherwise
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

export function setupNotifications(): () => void {
  // Fire-and-forget async work (token registration + cold-start deep link)
  registerForPushNotifications().catch((err) =>
    console.error('[Notifications] Setup error:', err)
  );
  handleInitialNotification().catch((err) =>
    console.error('[Notifications] Initial notification error:', err)
  );

  // Return listener cleanup for useEffect
  return setupNotificationListeners();
}

// ── Register device for push notifications ────────────────────

export async function registerForPushNotifications(): Promise<string | null> {
  // FIX 3: Web push requires VAPID setup in app.json — skip on web
  // To enable later: run `npx web-push generate-vapid-keys` and
  // add the public key to app.json → expo.web.notification.vapidPublicKey
  if (Platform.OS === 'web') {
    console.log('[Notifications] Web push skipped — VAPID not configured');
    return null;
  }

  // Push only works on real physical devices
  if (!Device.isDevice) {
    console.log('[Notifications] Skipping — simulator detected');
    return null;
  }

  // Request permission if not already granted
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

  // Android requires a notification channel
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

  // Guard: EXPO_PUBLIC_EAS_PROJECT_ID must be set in .env
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (!projectId) {
    throw new Error(
      '[Notifications] Missing EXPO_PUBLIC_EAS_PROJECT_ID in .env — ' +
      'run `eas project:info` to find your project ID.'
    );
  }

  // Get Expo push token (works for both iOS APNs + Android FCM via Expo)
  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = tokenData.data;
  console.log('[Notifications] Push token acquired:', token);

  // Send token to our Node.js backend to store in user_preferences
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
  // FIX 4: Native notification listeners don't exist on web
  if (Platform.OS === 'web') {
    return () => {}; // return no-op cleanup — nothing to remove on web
  }

  // Fired when a notification is tapped while app is in background/closed
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

  // Fired when notification arrives while app is in foreground
  const receivedSub = Notifications.addNotificationReceivedListener(
    (notification) => {
      const title = notification.request.content.title ?? '';
      console.log('[Notifications] Foreground notification:', title);
      // No navigation needed — signal appears via WebSocket anyway
    }
  );

  return () => {
    responseSub.remove();
    receivedSub.remove();
  };
}

// ── Check for notification that launched the app ─────────────
// Called on cold start to handle tapped notifications

export async function handleInitialNotification(): Promise<void> {
  // FIX 2: getLastNotificationResponseAsync is native-only
  // Throws UnavailabilityError on web — must guard before calling
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