import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const supabaseUrl     = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage:            AsyncStorage,
    autoRefreshToken:   true,
    persistSession:     true,
    detectSessionInUrl: false,
  },
});

export const sessionReady: Promise<void> = supabase.auth
  .getSession()
  .then(() => { console.log("[Supabase] Session loaded from storage"); })
  .catch((err) => { console.warn("[Supabase] Session load error:", err); });

export const getCurrentUserId = async (): Promise<string | null> => {
  await sessionReady;
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
};