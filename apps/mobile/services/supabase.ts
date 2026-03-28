
// // apps/mobile/services/supabase.ts
// // Supabase client — auth + database

// import { createClient } from "@supabase/supabase-js";
// import * as SecureStore from "expo-secure-store";

// const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
// const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// // Custom storage adapter — uses Expo SecureStore (encrypted on device)
// const ExpoSecureStoreAdapter = {
//   getItem: (key: string) => SecureStore.getItemAsync(key),
//   setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
//   removeItem: (key: string) => SecureStore.deleteItemAsync(key),
// };

// export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
//   auth: {
//     storage: ExpoSecureStoreAdapter,
//     autoRefreshToken: true,
//     persistSession: true,
//     detectSessionInUrl: false,
//   },
// });

// // Helper: get current user id safely
// export const getCurrentUserId = async (): Promise<string | null> => {
//   const {
//     data: { user },
//   } = await supabase.auth.getUser();
//   return user?.id ?? null;
// };









// apps/mobile/services/supabase.ts
// Supabase client — auth + database

import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Custom storage adapter — SecureStore on native, localStorage on web
// expo-secure-store does not support web; falling back prevents runtime crash.
const ExpoSecureStoreAdapter = {
  getItem: (key: string): Promise<string | null> => {
    if (Platform.OS === "web") {
      return Promise.resolve(localStorage.getItem(key));
    }
    return SecureStore.getItemAsync(key);
  },
  setItem: (key: string, value: string): Promise<void> => {
    if (Platform.OS === "web") {
      localStorage.setItem(key, value);
      return Promise.resolve();
    }
    return SecureStore.setItemAsync(key, value);
  },
  removeItem: (key: string): Promise<void> => {
    if (Platform.OS === "web") {
      localStorage.removeItem(key);
      return Promise.resolve();
    }
    return SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage:            ExpoSecureStoreAdapter,
    autoRefreshToken:   true,
    persistSession:     true,
    detectSessionInUrl: false,
  },
});

// Helper: get current user id safely
export const getCurrentUserId = async (): Promise<string | null> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
};