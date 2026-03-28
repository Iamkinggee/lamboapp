// import { createClient, SupabaseClient } from '@supabase/supabase-js';
// import { SMCSignal, TradeLog, UserPreferences, ChatMessage } from '../models/signal';

// // ─────────────────────────────────────────────
// // Supabase client (service role — server only)
// // NEVER expose this key to the client
// // ─────────────────────────────────────────────
// const supabase: SupabaseClient = createClient(
//   process.env.SUPABASE_URL!,
//   process.env.SUPABASE_SERVICE_ROLE_KEY!,
//   {
//     auth: {
//       autoRefreshToken: false,
//       persistSession: false,
//     },
//   }
// );

// export default supabase;

// // ─────────────────────────────────────────────
// // SIGNALS
// // ─────────────────────────────────────────────

// /**
//  * Save a new signal from the Python engine into the DB.
//  */
// export async function saveSignal(signal: SMCSignal): Promise<void> {
//   const { error } = await supabase.from('signals').upsert(
//     {
//       id: signal.signal_id,
//       pair: signal.pair,
//       type: signal.type,
//       entry: signal.entry,
//       stop_loss: signal.stop_loss,
//       take_profit: signal.take_profit,
//       risk_reward: signal.risk_reward,
//       confidence_score: signal.confidence_score,
//       confluences: signal.confluences,
//       htf_bias: signal.htf_bias,
//       entry_model: signal.entry_model,
//       ai_explanation: signal.ai_explanation,
//       timeframe: signal.timeframe,
//       htf_timeframe: signal.htf_timeframe,
//       signal_time: new Date(signal.timestamp).toISOString(),
//     },
//     { onConflict: 'id' }
//   );

//   if (error) throw new Error(`saveSignal failed: ${error.message}`);
// }

// /**
//  * Fetch paginated signal history. Default: last 50 signals.
//  */
// export async function getSignals(
//   limit = 50,
//   offset = 0,
//   pair?: string,
//   type?: 'BUY' | 'SELL'
// ): Promise<SMCSignal[]> {
//   let query = supabase
//     .from('signals')
//     .select('*')
//     .order('signal_time', { ascending: false })
//     .range(offset, offset + limit - 1);

//   if (pair) query = query.eq('pair', pair);
//   if (type) query = query.eq('type', type);

//   const { data, error } = await query;
//   if (error) throw new Error(`getSignals failed: ${error.message}`);

//   return (data ?? []).map(mapSignalRow);
// }

// /**
//  * Fetch a single signal by ID.
//  */
// export async function getSignalById(id: string): Promise<SMCSignal | null> {
//   const { data, error } = await supabase
//     .from('signals')
//     .select('*')
//     .eq('id', id)
//     .single();

//   if (error) return null;
//   return mapSignalRow(data);
// }

// function mapSignalRow(row: Record<string, unknown>): SMCSignal {
//   return {
//     signal_id: row.id as string,
//     pair: row.pair as string,
//     type: row.type as 'BUY' | 'SELL',
//     entry: row.entry as number,
//     stop_loss: row.stop_loss as number,
//     take_profit: row.take_profit as number,
//     risk_reward: row.risk_reward as number,
//     confidence_score: row.confidence_score as number,
//     confluences: row.confluences as string[],
//     htf_bias: row.htf_bias as 'BULLISH' | 'BEARISH' | 'NEUTRAL',
//     entry_model: row.entry_model as 'ANTICIPATION' | 'CONFIRMATION',
//     ai_explanation: row.ai_explanation as string,
//     timeframe: row.timeframe as string,
//     htf_timeframe: row.htf_timeframe as string,
//     timestamp: new Date(row.signal_time as string).getTime(),
//   };
// }

// // ─────────────────────────────────────────────
// // TRADES
// // ─────────────────────────────────────────────

// export async function saveTrade(trade: TradeLog): Promise<TradeLog> {
//   const { data, error } = await supabase
//     .from('trades')
//     .insert({
//       user_id: trade.user_id,
//       signal_id: trade.signal_id,
//       pair: trade.pair,
//       type: trade.type,
//       entry: trade.entry,
//       stop_loss: trade.stop_loss,
//       take_profit: trade.take_profit,
//       risk_reward: trade.risk_reward,
//       confidence_score: trade.confidence_score,
//       outcome: trade.outcome,
//       notes: trade.notes ?? null,
//     })
//     .select()
//     .single();

//   if (error) throw new Error(`saveTrade failed: ${error.message}`);
//   return data as TradeLog;
// }

// export async function getUserTrades(
//   userId: string,
//   limit = 50,
//   offset = 0
// ): Promise<TradeLog[]> {
//   const { data, error } = await supabase
//     .from('trades')
//     .select('*')
//     .eq('user_id', userId)
//     .order('created_at', { ascending: false })
//     .range(offset, offset + limit - 1);

//   if (error) throw new Error(`getUserTrades failed: ${error.message}`);
//   return (data ?? []) as TradeLog[];
// }

// export async function getTradeStats(userId: string): Promise<{
//   total: number;
//   wins: number;
//   losses: number;
//   win_rate: number;
//   avg_rr: number;
// }> {
//   const { data, error } = await supabase
//     .from('trades')
//     .select('outcome, risk_reward')
//     .eq('user_id', userId)
//     .neq('outcome', 'PENDING');

//   if (error) throw new Error(`getTradeStats failed: ${error.message}`);

//   const trades = data ?? [];
//   const wins = trades.filter((t) => t.outcome === 'WIN').length;
//   const losses = trades.filter((t) => t.outcome === 'LOSS').length;
//   const total = trades.length;
//   const avg_rr =
//     total > 0
//       ? trades.reduce((sum, t) => sum + (t.risk_reward as number), 0) / total
//       : 0;

//   return {
//     total,
//     wins,
//     losses,
//     win_rate: total > 0 ? Math.round((wins / total) * 100) : 0,
//     avg_rr: Math.round(avg_rr * 100) / 100,
//   };
// }

// // ─────────────────────────────────────────────
// // USER PREFERENCES
// // ─────────────────────────────────────────────

// export async function getUserPreferences(
//   userId: string
// ): Promise<UserPreferences | null> {
//   const { data, error } = await supabase
//     .from('user_preferences')
//     .select('*')
//     .eq('user_id', userId)
//     .single();

//   if (error) return null;
//   return data as UserPreferences;
// }

// export async function upsertUserPreferences(
//   prefs: Partial<UserPreferences> & { user_id: string }
// ): Promise<void> {
//   const { error } = await supabase
//     .from('user_preferences')
//     .upsert(prefs, { onConflict: 'user_id' });

//   if (error) throw new Error(`upsertUserPreferences failed: ${error.message}`);
// }

// export async function saveFCMToken(
//   userId: string,
//   fcmToken: string
// ): Promise<void> {
//   const { error } = await supabase
//     .from('user_preferences')
//     .upsert({ user_id: userId, fcm_token: fcmToken }, { onConflict: 'user_id' });

//   if (error) throw new Error(`saveFCMToken failed: ${error.message}`);
// }

// // ─────────────────────────────────────────────
// // CHAT HISTORY
// // ─────────────────────────────────────────────

// export async function saveChatMessage(
//   userId: string,
//   message: ChatMessage
// ): Promise<void> {
//   const { error } = await supabase.from('chat_history').insert({
//     user_id: userId,
//     role: message.role,
//     content: message.content,
//   });

//   if (error) throw new Error(`saveChatMessage failed: ${error.message}`);
// }

// export async function getChatHistory(
//   userId: string,
//   limit = 20
// ): Promise<ChatMessage[]> {
//   const { data, error } = await supabase
//     .from('chat_history')
//     .select('role, content, created_at')
//     .eq('user_id', userId)
//     .order('created_at', { ascending: false })
//     .limit(limit);

//   if (error) throw new Error(`getChatHistory failed: ${error.message}`);

//   // Return in chronological order for LLM context
//   return ((data ?? []) as ChatMessage[]).reverse();
// }

















// FILE: services/api-server/src/db/supabase.ts

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SMCSignal, TradeLog, UserPreferences, ChatMessage } from '../models/signal';

// ─────────────────────────────────────────────
// FIX: Added explicit guards so missing env vars throw a clear
//      error at startup instead of crashing with "supabaseUrl is required"
// ─────────────────────────────────────────────
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl)  throw new Error('[DB] SUPABASE_URL env var is missing');
if (!supabaseKey)  throw new Error('[DB] SUPABASE_SERVICE_ROLE_KEY env var is missing');

const supabase: SupabaseClient = createClient(
  supabaseUrl,
  supabaseKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession:   false,
    },
  }
);

export default supabase;

// ─────────────────────────────────────────────
// SIGNALS
// ─────────────────────────────────────────────

export async function saveSignal(signal: SMCSignal): Promise<void> {
  const { error } = await supabase.from('signals').upsert(
    {
      id:               signal.signal_id,
      pair:             signal.pair,
      type:             signal.type,
      entry:            signal.entry,
      stop_loss:        signal.stop_loss,
      take_profit:      signal.take_profit,
      risk_reward:      signal.risk_reward,
      confidence_score: signal.confidence_score,
      confluences:      signal.confluences,
      htf_bias:         signal.htf_bias,
      entry_model:      signal.entry_model,
      ai_explanation:   signal.ai_explanation,
      timeframe:        signal.timeframe,
      htf_timeframe:    signal.htf_timeframe,
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
  let query = supabase
    .from('signals')
    .select('*')
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
    .from('signals')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return null;
  return mapSignalRow(data);
}

function mapSignalRow(row: Record<string, unknown>): SMCSignal {
  return {
    signal_id:        row.id               as string,
    pair:             row.pair             as string,
    type:             row.type             as 'BUY' | 'SELL',
    entry:            row.entry            as number,
    stop_loss:        row.stop_loss        as number,
    take_profit:      row.take_profit      as number,
    risk_reward:      row.risk_reward      as number,
    confidence_score: row.confidence_score as number,
    confluences:      row.confluences      as string[],
    htf_bias:         row.htf_bias         as 'BULLISH' | 'BEARISH' | 'NEUTRAL',
    entry_model:      row.entry_model      as 'ANTICIPATION' | 'CONFIRMATION',
    ai_explanation:   row.ai_explanation   as string,
    timeframe:        row.timeframe        as string,
    htf_timeframe:    row.htf_timeframe    as string,
    timestamp:        new Date(row.signal_time as string).getTime(),
  };
}

// ─────────────────────────────────────────────
// TRADES
// ─────────────────────────────────────────────

export async function saveTrade(trade: TradeLog): Promise<TradeLog> {
  const { data, error } = await supabase
    .from('trades')
    .insert({
      user_id:          trade.user_id,
      signal_id:        trade.signal_id,
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
    .select()
    .single();

  if (error) throw new Error(`saveTrade failed: ${error.message}`);
  return data as TradeLog;
}

export async function getUserTrades(
  userId: string,
  limit  = 50,
  offset = 0
): Promise<TradeLog[]> {
  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(`getUserTrades failed: ${error.message}`);
  return (data ?? []) as TradeLog[];
}

export async function getTradeStats(userId: string): Promise<{
  total:    number;
  wins:     number;
  losses:   number;
  win_rate: number;
  avg_rr:   number;
}> {
  const { data, error } = await supabase
    .from('trades')
    .select('outcome, risk_reward')
    .eq('user_id', userId)
    .neq('outcome', 'PENDING');

  if (error) throw new Error(`getTradeStats failed: ${error.message}`);

  const trades  = data ?? [];
  const wins    = trades.filter((t) => t.outcome === 'WIN').length;
  const losses  = trades.filter((t) => t.outcome === 'LOSS').length;
  const total   = trades.length;
  const avg_rr  = total > 0
    ? trades.reduce((sum, t) => sum + (t.risk_reward as number), 0) / total
    : 0;

  return {
    total,
    wins,
    losses,
    win_rate: total > 0 ? Math.round((wins / total) * 100) : 0,
    avg_rr:   Math.round(avg_rr * 100) / 100,
  };
}

// ─────────────────────────────────────────────
// USER PREFERENCES
// ─────────────────────────────────────────────

export async function getUserPreferences(
  userId: string
): Promise<UserPreferences | null> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) return null;
  return data as UserPreferences;
}

export async function upsertUserPreferences(
  prefs: Partial<UserPreferences> & { user_id: string }
): Promise<void> {
  const { error } = await supabase
    .from('user_preferences')
    .upsert(prefs, { onConflict: 'user_id' });

  if (error) throw new Error(`upsertUserPreferences failed: ${error.message}`);
}

export async function saveFCMToken(
  userId:   string,
  fcmToken: string
): Promise<void> {
  const { error } = await supabase
    .from('user_preferences')
    .upsert(
      { user_id: userId, fcm_token: fcmToken },
      { onConflict: 'user_id' }
    );

  if (error) throw new Error(`saveFCMToken failed: ${error.message}`);
}

// ─────────────────────────────────────────────
// CHAT HISTORY
// ─────────────────────────────────────────────

export async function saveChatMessage(
  userId:  string,
  message: ChatMessage
): Promise<void> {
  const { error } = await supabase.from('chat_history').insert({
    user_id: userId,
    role:    message.role,
    content: message.content,
  });

  if (error) throw new Error(`saveChatMessage failed: ${error.message}`);
}

export async function getChatHistory(
  userId: string,
  limit   = 20
): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_history')
    .select('role, content, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`getChatHistory failed: ${error.message}`);

  return ((data ?? []) as ChatMessage[]).reverse();
}