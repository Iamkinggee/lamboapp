// FILE: apps/mobile/app/_layout.tsx

import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase, sessionReady } from "../services/supabase";
import { useAuthStore } from "../store/useAuthStore";
import { useWatchlistStore } from "../store/useWatchlistStore";
import { setupNotifications } from "../services/notifications";
import { wsService } from "../services/ws";
import { useSignalStore } from "../store/useSignalStore";
import * as Notifications from "expo-notifications";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 30_000 } },
});

export default function RootLayout() {
  const [appReady, setAppReady] = useState(false);

  const addSignal       = useSignalStore((s) => s.addSignal);
  const hydrate         = useAuthStore((s) => s.hydrate);
  const hydrateWatchlist = useWatchlistStore((s) => s.hydrate);

  // ── Boot sequence — nothing renders until this resolves ─────────────────
  useEffect(() => {
    async function boot() {
      try {
        // 1. Wait for Supabase to read the persisted session from SecureStore
        await sessionReady;

        // 2. Hydrate auth store (refreshes token if expired)
        await hydrate();

        // 3. Hydrate other stores (non-blocking for auth, but await for consistency)
        await hydrateWatchlist();
      } catch (err) {
        console.error("[Boot] Error during hydration:", err);
      } finally {
        // Always unblock rendering — even if something failed
        setAppReady(true);
      }
    }

    boot();
  }, []);

  // ── Supabase auth state listener ─────────────────────────────────────────
  // Keeps the store in sync whenever Supabase fires TOKEN_REFRESHED,
  // SIGNED_IN, SIGNED_OUT etc. — runs independently of boot sequence.
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (session) {
          useAuthStore.getState().login(session.access_token, session.user.id);
        } else {
          useAuthStore.setState({ token: null, userId: null, user: null });
        }
      }
    );
    return () => listener.subscription.unsubscribe();
  }, []);

  // ── Push notifications ───────────────────────────────────────────────────
  useEffect(() => {
    const cleanup = setupNotifications();
    return cleanup;
  }, []);

  // ── WebSocket ────────────────────────────────────────────────────────────
  useEffect(() => {
    wsService.connect();

    const unsubSignal = wsService.onSignal(async (signal) => {
      addSignal(signal);
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
        trigger: null,
      });
    });

    return () => {
      unsubSignal();
      wsService.disconnect();
    };
  }, [addSignal]);

  // ── Block render until session is loaded ─────────────────────────────────
  if (!appReady) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0a0a0a", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#f0b429" />
      </View>
    );
  }

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