// FILE: apps/mobile/services/api.ts

import { Platform } from 'react-native';
import { supabase } from './supabase';

// localhost doesn't reach Docker from a device or emulator.
// - Android emulator  → 10.0.2.2  (loopback alias)
// - iOS simulator     → localhost  (shares host network)
// - Physical device   → set EXPO_PUBLIC_API_URL to your machine's LAN IP
//                       e.g. http://192.168.1.x:3001  (run `ipconfig` to find it)
const getFallbackUrl = () => {
  if (Platform.OS === 'android') return 'http://10.0.2.2:3001';  
  return 'http://localhost:3001';                                  
};

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? getFallbackUrl();

// ── Auth ──────────────────────────────────────

export async function apiLogin(
  email: string,
  password: string
): Promise<{ token: string; userId: string }> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return {
    token:  data.session.access_token,
    userId: data.user.id,
  };
}

export async function apiRegister(
  name: string,
  email: string,
  password: string,
  skillLevel: string
): Promise<{ token: string; userId: string }> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, skill_level: skillLevel },
    },
  });
  if (error) throw new Error(error.message);
  if (!data.session) {
    throw new Error('Please check your email and confirm your account before signing in.');
  }
  return {
    token:  data.session.access_token,
    userId: data.user!.id,
  };
}

// ── Token helpers ─────────────────────────────
export async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function saveToken(_token: string): Promise<void> {}
export async function clearToken(): Promise<void> {}








// // ── Base fetch wrapper ────────────────────────
// async function request<T>(
//   path: string,
//   options: RequestInit = {}
// ): Promise<T> {
//   const token = await getToken();

//   const headers: Record<string, string> = {
//     'Content-Type': 'application/json',
//     ...(options.headers as Record<string, string>),
//   };

//   if (token) headers['Authorization'] = `Bearer ${token}`;

//   const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

//   if (!res.ok) {
//     const body = await res.json().catch(() => ({}));
//     throw new APIError(
//       res.status,
//       (body as { error?: string }).error ?? 'Request failed'
//     );
//   }

//   return res.json() as Promise<T>;
// }



// ── Base fetch wrapper ────────────────────────
async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getToken();

  // 401 debug — remove after fixing
  console.log('[API] token present:', !!token, 'path:', path);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // Log full error for debugging
    console.error('[API] Error:', res.status, path, body);
    throw new APIError(
      res.status,
      (body as { error?: string }).error ?? 'Request failed'
    );
  }

  return res.json() as Promise<T>;
}











export class APIError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'APIError';
  }
}

// ── Signals ───────────────────────────────────
export async function fetchSignals(params?: {
  limit?: number;
  offset?: number;
  pair?: string;
  type?: 'BUY' | 'SELL';
}) {
  const qs = new URLSearchParams();
  if (params?.limit)  qs.set('limit',  String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  if (params?.pair)   qs.set('pair',   params.pair);
  if (params?.type)   qs.set('type',   params.type);
  return request<{ signals: SMCSignal[] }>(`/signals?${qs}`);
}

export async function fetchSignalById(id: string) {
  return request<{ signal: SMCSignal }>(`/signals/${id}`);
}

// ── Trades ────────────────────────────────────
export async function logTrade(trade: Omit<TradeLog, 'id' | 'created_at'>) {
  return request<{ trade: TradeLog }>('/trades', {
    method: 'POST',
    body: JSON.stringify(trade),
  });
}

export async function fetchTrades(params?: { limit?: number; offset?: number }) {
  const qs = new URLSearchParams();
  if (params?.limit)  qs.set('limit',  String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  return request<{ trades: TradeLog[]; stats: TradeStats }>(`/trades?${qs}`);
}

// ── AI ────────────────────────────────────────
export async function sendChatMessage(message: string) {
  return request<{ response: string }>('/ai/chat', {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export async function explainSignal(signalId: string) {
  return request<{ explanation: string }>(`/ai/explain/${signalId}`, {
    method: 'POST',
  });
}

export async function fetchChatHistory() {
  return request<{ history: ChatMessage[] }>('/ai/history');
}

// ── User ──────────────────────────────────────
export async function updatePreferences(prefs: Partial<UserPreferences>) {
  return request<{ message: string }>('/user/preferences', {
    method: 'PUT',
    body: JSON.stringify(prefs),
  });
}

export async function updateSkillLevel(skill_level: SkillLevel) {
  return request<{ message: string; skill_level: SkillLevel }>(
    '/user/skill-level',
    {
      method: 'PUT',
      body: JSON.stringify({ skill_level }),
    }
  );
}

export async function registerFCMToken(fcm_token: string) {
  return request('/user/fcm-token', {
    method: 'POST',
    body: JSON.stringify({ fcm_token }),
  });
}

// ── Shared Types ──────────────────────────────
export type SignalType   = 'BUY' | 'SELL';
export type HTFBias      = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type EntryModel   = 'ANTICIPATION' | 'CONFIRMATION';
export type SkillLevel   = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
export type TradeOutcome = 'WIN' | 'LOSS' | 'PENDING' | 'BREAKEVEN';

export interface User {
  id:          string;
  email:       string;
  name:        string;
  skill_level: SkillLevel;
}

export interface SMCSignal {
  signal_id:        string;
  pair:             string;
  type:             SignalType;
  entry:            number;
  stop_loss:        number;
  take_profit:      number;
  risk_reward:      number;
  confidence_score: number;
  confluences:      string[];
  htf_bias:         HTFBias;
  entry_model:      EntryModel;
  ai_explanation:   string;
  timeframe:        string;
  htf_timeframe:    string;
  timestamp:        number;
}

export interface TradeLog {
  id?:              string;
  user_id?:         string;
  signal_id:        string;
  pair:             string;
  type:             SignalType;
  entry:            number;
  stop_loss:        number;
  take_profit:      number;
  risk_reward:      number;
  confidence_score: number;
  outcome:          TradeOutcome;
  notes?:           string;
  created_at?:      string;
}

export interface TradeStats {
  total:    number;
  wins:     number;
  losses:   number;
  win_rate: number;
  avg_rr:   number;
}

export interface ChatMessage {
  role:       'user' | 'assistant';
  content:    string;
  created_at?: string;
}

export interface UserPreferences {
  min_confidence_threshold: number;
  watched_pairs:            string[];
  default_rr_target:        number;
  notify_high_confidence:   boolean;
  notify_all_signals:       boolean;
  notify_bias_change:       boolean;
}