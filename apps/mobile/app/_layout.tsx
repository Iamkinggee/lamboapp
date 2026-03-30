// FILE: apps/mobile/app/_layout.tsx

import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "../services/supabase";
import { useAuthStore } from "../store/useAuthStore";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
    },
  },
});

export default function RootLayout() {
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