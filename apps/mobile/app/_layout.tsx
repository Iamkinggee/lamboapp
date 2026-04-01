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
import { usePriceMonitor } from "../hooks/usePriceMonitor";
import * as Notifications from "expo-notifications";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 30_000 } },
});

// Inner component so hooks (usePriceMonitor) run inside QueryClientProvider
function AppCore() {
  // ── Start price monitor (checks SL/TP every 30s) ──────────────────
  usePriceMonitor();
  return null;
}

export default function RootLayout() {
  const [appReady, setAppReady] = useState(false);

  const addSignal        = useSignalStore((s) => s.addSignal);
  const hydrate          = useAuthStore((s) => s.hydrate);
  const hydrateWatchlist = useWatchlistStore((s) => s.hydrate);

  // ── Boot sequence ────────────────────────────────────────────────────
  useEffect(() => {
    async function boot() {
      try {
        await sessionReady;
        await hydrate();
        await hydrateWatchlist();
      } catch (err) {
        console.error("[Boot] Error during hydration:", err);
      } finally {
        setAppReady(true);
      }
    }
    boot();
  }, []);

  // ── Supabase auth state listener ─────────────────────────────────────
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

  // ── Push notifications ───────────────────────────────────────────────
  useEffect(() => {
    const cleanup = setupNotifications();
    return cleanup;
  }, []);

  // ── WebSocket — real-time signal delivery ────────────────────────────
  useEffect(() => {
    wsService.connect();

    const unsubSignal = wsService.onSignal(async (signal) => {
      // Add to the signal store (shows immediately on Signals page)
      addSignal(signal);

      // Fire a local push notification for every new signal
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `⚡ New Signal — ${signal.pair.replace("USDT", "")}/USDT`,
            body: `${signal.type === "BUY" ? "🟢 LONG" : "🔴 SHORT"} · Entry ${signal.entry} · RR 1:${signal.risk_reward} · ${signal.confidence_score}% confidence`,
            sound: "default",
            data: {
              screen:   "signal-detail",
              signalId: signal.signal_id,
              pair:     signal.pair,
            },
          },
          trigger: null,
        });
      } catch (err) {
        console.warn("[WS] Notification scheduling failed:", err);
      }
    });

    return () => {
      unsubSignal();
      wsService.disconnect();
    };
  }, [addSignal]);

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
      {/* AppCore runs price monitor inside the provider */}
      <AppCore />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack>
    </QueryClientProvider>
  );
}