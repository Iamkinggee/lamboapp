


// FILE: apps/mobile/services/supabase.ts

import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const supabaseUrl     = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

const CHUNK_SIZE = 1800; // safely under SecureStore's 2048 byte limit

const ChunkedSecureStore = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === "web") return localStorage.getItem(key);
    try {
      const countStr = await SecureStore.getItemAsync(`${key}_count`);
      if (!countStr) return SecureStore.getItemAsync(key); // legacy fallback
      const count  = parseInt(countStr, 10);
      const chunks: string[] = [];
      for (let i = 0; i < count; i++) {
        const chunk = await SecureStore.getItemAsync(`${key}_${i}`);
        if (chunk === null) return null;
        chunks.push(chunk);
      }
      return chunks.join("");
    } catch {
      return null;
    }
  },

  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === "web") { localStorage.setItem(key, value); return; }
    try {
      if (value.length <= CHUNK_SIZE) {
        await SecureStore.setItemAsync(key, value);
        return;
      }
      const chunks: string[] = [];
      for (let i = 0; i < value.length; i += CHUNK_SIZE) {
        chunks.push(value.slice(i, i + CHUNK_SIZE));
      }
      for (let i = 0; i < chunks.length; i++) {
        await SecureStore.setItemAsync(`${key}_${i}`, chunks[i]);
      }
      await SecureStore.setItemAsync(`${key}_count`, String(chunks.length));
    } catch (e) {
      console.error("[SecureStore] setItem failed:", e);
    }
  },

  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === "web") { localStorage.removeItem(key); return; }
    try {
      const countStr = await SecureStore.getItemAsync(`${key}_count`);
      if (countStr) {
        const count = parseInt(countStr, 10);
        for (let i = 0; i < count; i++) {
          await SecureStore.deleteItemAsync(`${key}_${i}`);
        }
        await SecureStore.deleteItemAsync(`${key}_count`);
      } else {
        await SecureStore.deleteItemAsync(key);
      }
    } catch (e) {
      console.error("[SecureStore] removeItem failed:", e);
    }
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage:            ChunkedSecureStore,
    autoRefreshToken:   true,
    persistSession:     true,
    detectSessionInUrl: false,
  },
});

export const getCurrentUserId = async (): Promise<string | null> => {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
};