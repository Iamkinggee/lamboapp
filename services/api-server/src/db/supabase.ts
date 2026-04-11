// FILE: services/api-server/src/db/supabase.ts
// UPDATES: mapSignalRow now includes take_profit_1/2/3, rr_1/2/3, is_anticipatory, pre_signal_note
//          saveSignal persists all new TP ladder fields

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SMCSignal, TradeLog, UserPreferences, ChatMessage } from '../models/signal';

const supabaseUrl         = process.env.SUPABASE_URL!;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl)         throw new Error('[DB] SUPABASE_URL env var is missing');
if (!supabaseServiceRole) throw new Error('[DB] SUPABASE_SERVICE_ROLE_KEY env var is missing');

const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export default supabase;

// ─── SIGNALS ──────────────────────────────────────────────────

function mapSignalRow(row: Record<string, unknown>): SMCSignal {
  // Gracefully handle both old rows (no TP ladder) and new rows
  const tp1 = (row.take_profit_1 as number) ?? 0;
  const tp2 = (row.take_profit_2 as number) ?? (row.take_profit as number) ?? 0;
  const tp3 = (row.take_profit_3 as number) ?? 0;
  const rr1 = (row.rr_1 as number) ?? 0;
  const rr2 = (row.rr_2 as number) ?? (row.risk_reward as number) ?? 0;
  const rr3 = (row.rr_3 as number) ?? 0;

  return {
    signal_id:        row.id               as string,
    pair:             row.pair             as string,
    type:             row.type             as 'BUY' | 'SELL',
    entry:            row.entry            as number,
    stop_loss:        row.stop_loss        as number,
    take_profit_1:    tp1,
    take_profit_2:    tp2,
    take_profit_3:    tp3,
    rr_1:             rr1,
    rr_2:             rr2,
    rr_3:             rr3,
    take_profit:      tp2,
    risk_reward:      rr2,
    confidence_score: row.confidence_score as number,
    confluences:      (row.confluences     as string[]) ?? [],
    htf_bias:         row.htf_bias         as 'BULLISH' | 'BEARISH' | 'NEUTRAL',
    entry_model:      (row.entry_model     as 'ANTICIPATION' | 'CONFIRMATION') ?? 'CONFIRMATION',
    ai_explanation:   (row.ai_explanation  as string) ?? '',
    timeframe:        row.timeframe        as string,
    htf_timeframe:    (row.htf_timeframe   as string) ?? '4H',
    is_anticipatory:  (row.is_anticipatory as boolean) ?? false,
    pre_signal_note:  (row.pre_signal_note as string) ?? '',
    timestamp:        new Date(row.signal_time as string).getTime(),
  };
}

export async function saveSignal(signal: SMCSignal): Promise<void> {
  const { error } = await supabase.from('signals').upsert(
    {
      id:               signal.signal_id,
      pair:             signal.pair,
      type:             signal.type,
      entry:            signal.entry,
      stop_loss:        signal.stop_loss,
      // TP ladder
      take_profit_1:    signal.take_profit_1 ?? 0,
      take_profit_2:    signal.take_profit_2 ?? signal.take_profit ?? 0,
      take_profit_3:    signal.take_profit_3 ?? 0,
      rr_1:             signal.rr_1 ?? 0,
      rr_2:             signal.rr_2 ?? signal.risk_reward ?? 0,
      rr_3:             signal.rr_3 ?? 0,
      // Legacy
      take_profit:      signal.take_profit_2 ?? signal.take_profit ?? 0,
      risk_reward:      signal.rr_2 ?? signal.risk_reward ?? 0,
      confidence_score: signal.confidence_score,
      confluences:      signal.confluences,
      htf_bias:         signal.htf_bias,
      entry_model:      signal.entry_model,
      ai_explanation:   signal.ai_explanation,
      timeframe:        signal.timeframe,
      htf_timeframe:    signal.htf_timeframe,
      is_anticipatory:  signal.is_anticipatory ?? false,
      pre_signal_note:  signal.pre_signal_note ?? '',
      signal_time:      new Date(signal.timestamp).toISOString(),
    },
    { onConflict: 'id' }
  );
  if (error) throw new Error(`saveSignal failed: ${error.message}`);
}

export async function getSignals(
  limit  = 50,
  offset = 0,
  pair?: string,
  type?: 'BUY' | 'SELL'
): Promise<SMCSignal[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from('signals')
    .select('*')
    .gte('signal_time', since)
    .order('signal_time', { ascending: false })
    .range(offset, offset + limit - 1);

  if (pair) query = query.eq('pair', pair);
  if (type) query = query.eq('type', type);

  const { data, error } = await query;
  if (error) throw new Error(`getSignals failed: ${error.message}`);
  return (data ?? []).map(mapSignalRow);
}

export async function getSignalById(id: string): Promise<SMCSignal | null> {
  const { data, error } = await supabase
    .from('signals').select('*').eq('id', id).single();
  if (error || !data) return null;
  return mapSignalRow(data as Record<string, unknown>);
}

// ─── TRADES ───────────────────────────────────────────────────

export async function saveTrade(trade: TradeLog): Promise<TradeLog> {
  const { data, error } = await supabase
    .from('trades')
    .insert({
      user_id:          trade.user_id,
      signal_id:        trade.signal_id || null,
      pair:             trade.pair,
      type:             trade.type,
      entry:            trade.entry,
      stop_loss:        trade.stop_loss,
      take_profit:      trade.take_profit,
      risk_reward:      trade.risk_reward,
      confidence_score: trade.confidence_score,
      outcome:          trade.outcome,
      notes:            trade.notes ?? null,
    })
    .select().single();
  if (error) throw new Error(`saveTrade failed: ${error.message}`);
  return data as TradeLog;
}

export async function getUserTrades(
  userId: string, limit = 50, offset = 0
): Promise<TradeLog[]> {
  const { data, error } = await supabase
    .from('trades').select('*').eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(`getUserTrades failed: ${error.message}`);
  return (data ?? []) as TradeLog[];
}

export async function getTradeStats(userId: string) {
  const { data, error } = await supabase
    .from('trades').select('outcome, risk_reward')
    .eq('user_id', userId).neq('outcome', 'PENDING');
  if (error) throw new Error(`getTradeStats failed: ${error.message}`);
  const trades = data ?? [];
  const wins   = trades.filter((t) => t.outcome === 'WIN').length;
  const losses = trades.filter((t) => t.outcome === 'LOSS').length;
  const total  = trades.length;
  const avg_rr = total > 0
    ? trades.reduce((sum: number, t: any) => sum + (t.risk_reward as number), 0) / total
    : 0;
  return { total, wins, losses, win_rate: total > 0 ? Math.round((wins / total) * 100) : 0, avg_rr: Math.round(avg_rr * 100) / 100 };
}

// ─── USER PREFERENCES ─────────────────────────────────────────

export async function getUserPreferences(userId: string): Promise<UserPreferences | null> {
  const { data, error } = await supabase
    .from('user_preferences').select('*').eq('user_id', userId).single();
  if (error || !data) return null;
  return data as UserPreferences;
}

export async function upsertUserPreferences(
  prefs: Partial<UserPreferences> & { user_id: string }
): Promise<void> {
  const { error } = await supabase
    .from('user_preferences').upsert(prefs, { onConflict: 'user_id' });
  if (error) throw new Error(`upsertUserPreferences failed: ${error.message}`);
}

export async function saveFCMToken(userId: string, fcmToken: string): Promise<void> {
  const { error } = await supabase
    .from('user_preferences')
    .upsert({ user_id: userId, fcm_token: fcmToken }, { onConflict: 'user_id' });
  if (error) throw new Error(`saveFCMToken failed: ${error.message}`);
}

// ─── CHAT HISTORY ─────────────────────────────────────────────

export async function saveChatMessage(userId: string, message: ChatMessage): Promise<void> {
  const { error } = await supabase.from('chat_messages').insert({
    user_id: userId, role: message.role, content: message.content,
  });
  if (error) console.error(`[DB] saveChatMessage failed: ${error.message}`);
}

export async function getChatHistory(userId: string, limit = 20): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages').select('role, content, created_at')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(limit);
  if (error) { console.error(`[DB] getChatHistory failed: ${error.message}`); return []; }
  return ((data ?? []) as ChatMessage[]).reverse();
}