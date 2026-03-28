






// // ============================================================
// // FILE: apps/mobile/app/_layout.tsx
// // ============================================================
// import React, { useEffect } from 'react';
// import { Stack } from 'expo-router';
// import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// import { useAuthStore } from '../store/useAuthStore';
// import { colors } from '../utils/theme';
// import {
//   registerForPushNotifications,
//   setupNotificationListeners,
//   handleInitialNotification,
// } from '../services/notifications';

// const queryClient = new QueryClient({
//   defaultOptions: {
//     queries: { retry: 2, staleTime: 30_000 },
//   },
// });

// export default function RootLayout() {
//   const { hydrate, user } = useAuthStore();   // ✅ user instead of token

//   // Step 1: Restore Supabase session on launch
//   useEffect(() => { hydrate(); }, []);

//   // Step 2: Register for push + set up deep link listeners
//   //         Only after user is authenticated
//   useEffect(() => {
//     if (!user) return;                          // ✅ guard on user, not token

//     registerForPushNotifications();
//     const cleanup = setupNotificationListeners();
//     handleInitialNotification();

//     return cleanup;
//   }, [user]);

//   return (
//     <QueryClientProvider client={queryClient}>
//       <Stack
//         screenOptions={{
//           headerStyle:         { backgroundColor: colors.background },
//           headerTintColor:     colors.textPrimary,
//           contentStyle:        { backgroundColor: colors.background },
//           headerShadowVisible: false,
//         }}
//       >
//         <Stack.Screen name="(auth)"    options={{ headerShown: false }} />
//         <Stack.Screen name="(tabs)"    options={{ headerShown: false }} />
//         <Stack.Screen
//           name="signal/[id]"
//           options={{
//             title:        'Signal Detail',
//             presentation: 'modal',
//             headerShown:  true,
//             headerStyle:  { backgroundColor: colors.surface },
//           }}
//         />
//       </Stack>
//     </QueryClientProvider>
//   );
// }












// FILE: apps/mobile/app/_layout.tsx
import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "../store/useAuthStore";
import { setupNotifications } from "../services/notifications";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:  1000 * 60 * 2,  // 2 minutes
      retry:      2,
    },
  },
});

export default function RootLayout() {
  useEffect(() => {
    setupNotifications();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)"  options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)"  options={{ headerShown: false }} />
        <Stack.Screen
          name="signal/[id]"
          options={{
            presentation:   "modal",
            headerShown:    true,
            headerTitle:    "Signal Detail",
            headerStyle:    { backgroundColor: "#0c0c20" },
            headerTintColor:"#00D4FF",
          }}
        />
      </Stack>
    </QueryClientProvider>
  );
}