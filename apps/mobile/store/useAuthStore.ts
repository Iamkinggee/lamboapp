// FILE: apps/mobile/store/useAuthStore.ts

import { create } from "zustand";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { supabase, sessionReady } from "../services/supabase";

const TOKEN_KEY = "smc_jwt_token";
const USER_KEY  = "smc_user_id";

const storage = {
  get: (key: string): Promise<string | null> => {
    if (Platform.OS === "web") return Promise.resolve(localStorage.getItem(key));
    return SecureStore.getItemAsync(key);
  },
  set: (key: string, value: string): Promise<void> => {
    if (Platform.OS === "web") { localStorage.setItem(key, value); return Promise.resolve(); }
    return SecureStore.setItemAsync(key, value);
  },
  delete: (key: string): Promise<void> => {
    if (Platform.OS === "web") { localStorage.removeItem(key); return Promise.resolve(); }
    return SecureStore.deleteItemAsync(key);
  },
};

interface AuthState {
  token:       string | null;
  userId:      string | null;
  skillLevel:  "beginner" | "intermediate" | "advanced";
  preferences: Record<string, any>;
  user:        { email?: string } | null;

  login:             (token: string, userId: string) => Promise<void>;
  logout:            () => Promise<void>;
  setSkillLevel:     (level: "beginner" | "intermediate" | "advanced") => void;
  updatePreferences: (prefs: Record<string, any>) => void;
  hydrate:           () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token:       null,
  userId:      null,
  skillLevel:  "beginner",
  preferences: {
    notifyHighConf:   true,
    notifyAll:        false,
    notifyBiasChange: true,
    notifyDailyTip:   true,
    watchedPairs:     ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
  },
  user: null,

  login: async (token, userId) => {
    await storage.set(TOKEN_KEY, token);
    await storage.set(USER_KEY, userId);
    set({ token, userId, user: {} });
  },

  logout: async () => {
    await supabase.auth.signOut();
    await storage.delete(TOKEN_KEY);
    await storage.delete(USER_KEY);
    set({ token: null, userId: null, user: null });
  },

  setSkillLevel: (skillLevel) => set({ skillLevel }),

  updatePreferences: (prefs) =>
    set((state) => ({ preferences: { ...state.preferences, ...prefs } })),

  hydrate: async () => {
    try {
      // Wait for Supabase to finish reading from SecureStore before querying session
      await sessionReady;

      const { data, error } = await supabase.auth.getSession();

      if (error || !data.session) {
        await storage.delete(TOKEN_KEY);
        await storage.delete(USER_KEY);
        set({ token: null, userId: null, user: null });
        return;
      }

      const { access_token, expires_at, user } = data.session;
      const now = Math.floor(Date.now() / 1000);

      if (expires_at && expires_at - now <= 60) {
        console.log('[Auth] Token expiring — refreshing during hydrate...');
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();

        if (refreshError || !refreshed.session) {
          console.warn('[Auth] Refresh failed during hydrate — clearing session');
          await storage.delete(TOKEN_KEY);
          await storage.delete(USER_KEY);
          set({ token: null, userId: null, user: null });
          return;
        }

        const newToken = refreshed.session.access_token;
        await storage.set(TOKEN_KEY, newToken);
        await storage.set(USER_KEY, refreshed.session.user.id);
        set({ token: newToken, userId: refreshed.session.user.id, user: {} });
        console.log('[Auth] Hydrated with refreshed token');
        return;
      }

      await storage.set(TOKEN_KEY, access_token);
      await storage.set(USER_KEY, user.id);
      set({ token: access_token, userId: user.id, user: {} });
      console.log('[Auth] Hydrated with valid token');

    } catch (err) {
      console.error('[Auth] Hydrate error:', err);
      set({ token: null, userId: null, user: null });
    }
  },
}));