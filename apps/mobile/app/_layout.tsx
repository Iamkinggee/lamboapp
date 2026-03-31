// // FILE: apps/mobile/app/_layout.tsx

// import { useEffect } from "react";
// import { Stack } from "expo-router";
// import { StatusBar } from "expo-status-bar";
// import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// import { supabase } from "../services/supabase";
// import { useAuthStore } from "../store/useAuthStore";
// import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

// const queryClient = new QueryClient({
//   defaultOptions: {
//     queries: {
//       retry: 2,
//       staleTime: 30_000,
//     },
//   },
// });

// export default function RootLayout() {
//   useEffect(() => {
//     supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
//       if (data.session) {
//         useAuthStore.setState({
//           token:  data.session.access_token,
//           userId: data.session.user.id,
//           user:   {},
//         });
//       }
//     });

//     const { data: listener } = supabase.auth.onAuthStateChange(
//       (_event: AuthChangeEvent, session: Session | null) => {
//         if (session) {
//           useAuthStore.setState({
//             token:  session.access_token,
//             userId: session.user.id,
//             user:   {},
//           });
//         } else {
//           useAuthStore.setState({ token: null, userId: null, user: null });
//         }
//       }
//     );

//     return () => listener.subscription.unsubscribe();
//   }, []);

//   return (
//     <QueryClientProvider client={queryClient}>
//       <StatusBar style="light" />
//       <Stack screenOptions={{ headerShown: false }}>
//         <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
//         <Stack.Screen name="(auth)" options={{ headerShown: false }} />
//       </Stack>
//     </QueryClientProvider>
//   );
// }











// FILE: apps/mobile/app/_layout.tsx
import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "../services/supabase";
import { useAuthStore } from "../store/useAuthStore";
import { setupNotifications } from "../services/notifications"; // ← ADD
import { wsService } from "../services/ws";                     // ← ADD
import { useSignalStore } from "../store/useSignalStore";       // ← ADD
import * as Notifications from "expo-notifications";           // ← ADD
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 30_000 } },
});

export default function RootLayout() {
  const addSignal = useSignalStore((s) => s.addSignal);

  // ── Supabase auth sync (unchanged) ───────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      if (data.session) {
        useAuthStore.setState({
          token:  data.session.access_token,
          userId: data.session.user.id,
          user:   {},
        });
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (session) {
          useAuthStore.setState({
            token:  session.access_token,
            userId: session.user.id,
            user:   {},
          });
        } else {
          useAuthStore.setState({ token: null, userId: null, user: null });
        }
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  // ── Push notifications setup ─────────────────────────────
  useEffect(() => {
    const cleanup = setupNotifications(); // registers token + attaches listeners
    return cleanup;
  }, []);

  // ── WebSocket connection + foreground notifications ───────
  useEffect(() => {
    wsService.connect();

    const unsubSignal = wsService.onSignal(async (signal) => {
      // 1. Push to store (updates the list in real-time)
      addSignal(signal);

      // 2. Fire a local notification so the user sees it even when in-app
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${signal.type === "BUY" ? "🟢 LONG" : "🔴 SHORT"} ${signal.pair.replace("USDT", "")}/USDT`,
          body:  `Entry ${signal.entry} · RR 1:${signal.risk_reward} · ${signal.confidence_score}% confidence`,
          sound: "default",
          data: {
            screen:   "signal-detail",
            signalId: signal.signal_id,
            pair:     signal.pair,
          },
        },
        trigger: null, // fire immediately
      });
    });

    return () => {
      unsubSignal();
      wsService.disconnect();
    };
  }, [addSignal]);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack>
    </QueryClientProvider>
  );
}