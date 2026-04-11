// ──────────────────────────────────────────────
// src/models/signal.ts
// Shared types for the entire API server
// UPDATES: TP1/TP2/TP3 ladder, rr_1/2/3, is_anticipatory, pre_signal_note
// ──────────────────────────────────────────────

export type SignalType    = 'BUY' | 'SELL';
export type HTFBias       = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type EntryModel    = 'ANTICIPATION' | 'CONFIRMATION';
export type SkillLevel    = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
export type TradeOutcome  = 'WIN' | 'LOSS' | 'PENDING' | 'BREAKEVEN';

export interface SMCSignal {
  signal_id:        string;
  pair:             string;
  type:             SignalType;
  entry:            number;
  stop_loss:        number;

  // TP Ladder
  take_profit_1:    number;   // TP1 ~1:2   — scalp partial (50% exit)
  take_profit_2:    number;   // TP2 ~1:3.5 — main swing target (30% exit)
  take_profit_3:    number;   // TP3 ~1:5.5 — runner/liquidity (20% exit)
  rr_1:             number;
  rr_2:             number;
  rr_3:             number;

  // Legacy (mirrors TP2 for backwards compat)
  take_profit:      number;
  risk_reward:      number;

  confidence_score: number;
  confluences:      string[];
  htf_bias:         HTFBias;
  entry_model:      EntryModel;
  ai_explanation:   string;
  timeframe:        string;
  htf_timeframe:    string;

  // Anticipatory vs confirmatory
  is_anticipatory:  boolean;
  pre_signal_note:  string;

  timestamp:        number;
}

export interface TradeLog {
  id?:              string;
  user_id:          string;
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

export interface UserPreferences {
  user_id:                string;
  skill_level:            SkillLevel;
  min_confidence_threshold: number;
  watched_pairs:          string[];
  default_rr_target:      number;
  sl_buffer_multiplier:   number;
  notify_high_confidence: boolean;
  notify_all_signals:     boolean;
  notify_bias_change:     boolean;
  fcm_token?:             string;
}

export interface ChatMessage {
  role:        'user' | 'assistant';
  content:     string;
  created_at?: string;
}

// ── WebSocket event types (Server → Client) ──
export type WSEvent =
  | { event: 'signal:new';    data: SMCSignal }
  | { event: 'signal:update'; data: Partial<SMCSignal> & { signal_id: string } }
  | { event: 'market:bias';   data: { pair: string; bias: HTFBias; timeframe: string } }
  | { event: 'ping';          data: { ts: number; message?: string } }
  | { event: 'auth_ok';       data: { ts: number } }
  | { event: 'error';         data: { message: string } };

// ── WebSocket event types (Client → Server) ──
export interface WSClientAuth      { type: 'auth';        token: string  }
export interface WSClientSubscribe { type: 'subscribe' | 'unsubscribe'; pairs: string[] }
export interface WSClientPong      { type: 'pong' }
export type WSClientEvent = WSClientAuth | WSClientSubscribe | WSClientPong;