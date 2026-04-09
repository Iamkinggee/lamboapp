// FILE: apps/mobile/app/_layout.tsx
// LOCATION: apps/mobile/app/_layout.tsx

import { useEffect, useState, useRef } from "react";
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
import { useWebSocket } from "../hooks/useWebSocket";
import * as Notifications from "expo-notifications";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import type { SMCSignal } from "../services/api";













const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 30_000 } },
});

// AppCore runs inside QueryClientProvider — all hooks live here
function AppCore() {
  // PriceMonitor: checks SL/TP every 30s
  usePriceMonitor();

  // useWebSocket: syncs WS status to store + pipes signals to store
  // This is the ONLY place useWebSocket is called
  useWebSocket();

  // Register a single notification handler for incoming signals
  useEffect(() => {
    const unsubSignal = wsService.onSignal(async (signal: SMCSignal) => {
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `⚡ New Signal — ${signal.pair.replace("USDT", "")}/USDT`,
            body: `${signal.type === "BUY" ? "🟢 LONG" : "🔴 SHORT"} · Entry ${signal.entry} · RR 1:${signal.risk_reward} · ${signal.confidence_score}% confidence`,
            sound: "default",
            data: { screen: "signal-detail", signalId: signal.signal_id, pair: signal.pair },
          },
          trigger: null,
        });
      } catch (err) {
        console.warn("[WS] Notification scheduling failed:", err);
      }
    });
    return () => unsubSignal();
  }, []);

  return null;
}

export default function RootLayout() {
  const [appReady, setAppReady]   = useState(false);
  const [authed,   setAuthed]     = useState(false);
  const wsStarted = useRef(false);

  const hydrate          = useAuthStore((s) => s.hydrate);
  const hydrateWatchlist = useWatchlistStore((s) => s.hydrate);

  // ── Boot sequence ──────────────────────────────────────────────────
  useEffect(() => {
    async function boot() {
      try {
        await sessionReady;
        await hydrate();
        await hydrateWatchlist();

        const token = useAuthStore.getState().token;
        if (token) setAuthed(true);
      } catch (err) {
        console.error("[Boot] Error during hydration:", err);
      } finally {
        setAppReady(true);
      }
    }
    boot();
  }, []);

  // ── Connect WS only after we have a confirmed token ───────────────
  useEffect(() => {
    if (authed && !wsStarted.current) {
      wsStarted.current = true;
      wsService.connect();
    }
  }, [authed]);

  // ── Supabase auth state listener ───────────────────────────────────
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (session) {
          useAuthStore.getState().login(session.access_token, session.user.id);
          setAuthed(true);
          // FIX: Only reconnect if genuinely disconnected and not already started.
          // Previous code called setAuthed(true) twice on the same session event,
          // which could cause wsService.connect() to be called while already connecting.
          const wsStatus = wsService.getStatus();
          if (wsStatus === "DISCONNECTED" && wsStarted.current) {
            wsStarted.current = false; // allow re-trigger on the authed effect
          }
        } else {
          useAuthStore.setState({ token: null, userId: null, user: null });
          setAuthed(false);
          wsStarted.current = false;
          wsService.disconnect();
        }
      }
    );
    return () => listener.subscription.unsubscribe();
  }, []);

  // ── Push notifications — setup after boot ─────────────────────────
  // FIX: Register push token AFTER hydration so the session is available
  // and registerFCMToken() won't 401 due to a missing/stale token.
  useEffect(() => {
    if (!appReady) return; // wait until session is confirmed
    const cleanup = setupNotifications();
    return cleanup;
  }, [appReady]);

  // ── Cleanup WS on unmount ──────────────────────────────────────────
  useEffect(() => {
    return () => {
      wsService.disconnect();
    };
  }, []);

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
      <AppCore />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack>
    </QueryClientProvider>
  );
}