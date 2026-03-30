// FILE: apps/mobile/store/useAuthStore.ts

import { create } from "zustand";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { supabase } from "../services/supabase";

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

export const useAuthStore = create<AuthState>((set) => ({
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

  // ← key fix: sign out from Supabase so session is fully cleared
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
    const token  = await storage.get(TOKEN_KEY);
    const userId = await storage.get(USER_KEY);
    if (token && userId) {
      set({ token, userId, user: {} });
    }
  },
}));