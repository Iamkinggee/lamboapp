

// // ──────────────────────────────────────────────
// // apps/mobile/store/useAuthStore.ts
// // Auth state — powered by Supabase directly
// // ──────────────────────────────────────────────
// import { create } from 'zustand';
// import { supabase } from '../services/supabase';
// import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

// import { User } from '../services/api';

// interface AuthState {
//   user:       User | null;
//   isLoading:  boolean;
//   error:      string | null;

//   // Actions
//   login:      (email: string, password: string) => Promise<void>;
//   register:   (email: string, password: string, name: string) => Promise<void>;
//   logout:     () => Promise<void>;
//   hydrate:    () => Promise<void>;
//   clearError: () => void;
// }

// // Map Supabase user → our User shape
// function mapUser(supaUser: {
//   id: string;
//   email?: string;
//   user_metadata?: { name?: string; skill_level?: string };
// }): User {
//   return {
//     id:          supaUser.id,
//     email:       supaUser.email ?? '',
//     name:        supaUser.user_metadata?.name ?? '',
//     skill_level: (supaUser.user_metadata?.skill_level as User['skill_level']) ?? 'BEGINNER',
//   };
// }

// export const useAuthStore = create<AuthState>((set) => ({
//   user:      null,
//   isLoading: false,
//   error:     null,

//   login: async (email, password) => {
//     set({ isLoading: true, error: null });
//     const { data, error } = await supabase.auth.signInWithPassword({ email, password });
//     if (error) {
//       set({ error: error.message, isLoading: false });
//       throw error;
//     }
//     set({ user: mapUser(data.user), isLoading: false });
//   },

//   register: async (email, password, name) => {
//     set({ isLoading: true, error: null });
//     const { data, error } = await supabase.auth.signUp({
//       email,
//       password,
//       options: { data: { name } },
//     });
//     if (error) {
//       set({ error: error.message, isLoading: false });
//       throw error;
//     }
//     // signUp returns a user even before email confirmation
//     if (data.user) {
//       set({ user: mapUser(data.user), isLoading: false });
//     } else {
//       // Email confirmation required — still clear loading
//       set({ isLoading: false });
//     }
//   },

//   logout: async () => {
//     await supabase.auth.signOut();
//     set({ user: null });
//   },

//   // Called on app launch — restores session from SecureStore automatically
//   // (Supabase handles persistence via ExpoSecureStoreAdapter)
//   hydrate: async () => {
//     const { data } = await supabase.auth.getSession();
//     if (data.session?.user) {
//       set({ user: mapUser(data.session.user) });
//     }

//     // Keep store in sync with Supabase session changes (token refresh, signout, etc.)
//     // supabase.auth.onAuthStateChange((_event, session) => {
//     //   set({ user: session?.user ? mapUser(session.user) : null });
//     // });


//     supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
//   set({ user: session?.user ? mapUser(session.user) : null });
// });



//   },

//   clearError: () => set({ error: null }),
// }));







// // FILE: apps/mobile/store/useAuthStore.ts
// import { create } from "zustand";
// import * as SecureStore from "expo-secure-store";

// const TOKEN_KEY = "smc_jwt_token";
// const USER_KEY  = "smc_user_id";

// interface AuthState {
//   token:      string | null;
//   userId:     string | null;
//   skillLevel: "beginner" | "intermediate" | "advanced";
//   preferences: Record<string, any>;
//   user:       { email?: string } | null;

//   login:             (token: string, userId: string) => Promise<void>;
//   logout:            () => Promise<void>;
//   setSkillLevel:     (level: "beginner" | "intermediate" | "advanced") => void;
//   updatePreferences: (prefs: Record<string, any>) => void;
//   hydrate:           () => Promise<void>;
// }

// export const useAuthStore = create<AuthState>((set, get) => ({
//   token:       null,
//   userId:      null,
//   skillLevel:  "beginner",
//   preferences: { notifyHighConf: true, notifyAll: false, notifyBiasChange: true, notifyDailyTip: true, watchedPairs: ["BTCUSDT", "ETHUSDT", "SOLUSDT"] },
//   user:        null,

//   login: async (token, userId) => {
//     await SecureStore.setItemAsync(TOKEN_KEY, token);
//     await SecureStore.setItemAsync(USER_KEY, userId);
//     set({ token, userId, user: {} });
//   },

//   logout: async () => {
//     await SecureStore.deleteItemAsync(TOKEN_KEY);
//     await SecureStore.deleteItemAsync(USER_KEY);
//     set({ token: null, userId: null, user: null });
//   },

//   setSkillLevel: (skillLevel) => set({ skillLevel }),

//   updatePreferences: (prefs) =>
//     set((state) => ({ preferences: { ...state.preferences, ...prefs } })),

//   hydrate: async () => {
//     const token  = await SecureStore.getItemAsync(TOKEN_KEY);
//     const userId = await SecureStore.getItemAsync(USER_KEY);
//     if (token && userId) {
//       set({ token, userId, user: {} });
//     }
//   },
// }));











// FILE: apps/mobile/store/useAuthStore.ts
import { create } from "zustand";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "smc_jwt_token";
const USER_KEY  = "smc_user_id";

// Platform-aware storage — SecureStore on native, localStorage on web
const storage = {
  get: (key: string): Promise<string | null> => {
    if (Platform.OS === "web") {
      return Promise.resolve(localStorage.getItem(key));
    }
    return SecureStore.getItemAsync(key);
  },
  set: (key: string, value: string): Promise<void> => {
    if (Platform.OS === "web") {
      localStorage.setItem(key, value);
      return Promise.resolve();
    }
    return SecureStore.setItemAsync(key, value);
  },
  delete: (key: string): Promise<void> => {
    if (Platform.OS === "web") {
      localStorage.removeItem(key);
      return Promise.resolve();
    }
    return SecureStore.deleteItemAsync(key);
  },
};

interface AuthState {
  token:      string | null;
  userId:     string | null;
  skillLevel: "beginner" | "intermediate" | "advanced";
  preferences: Record<string, any>;
  user:       { email?: string } | null;

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
  preferences: { notifyHighConf: true, notifyAll: false, notifyBiasChange: true, notifyDailyTip: true, watchedPairs: ["BTCUSDT", "ETHUSDT", "SOLUSDT"] },
  user:        null,

  login: async (token, userId) => {
    await storage.set(TOKEN_KEY, token);
    await storage.set(USER_KEY, userId);
    set({ token, userId, user: {} });
  },

  logout: async () => {
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