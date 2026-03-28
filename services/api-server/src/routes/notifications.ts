// ============================================================
// FILE: services/api-server/src/routes/notifications.ts
// PURPOSE: FCM push notification sender — triggered when
//          Redis receives a qualifying signal above a user's
//          configured confidence threshold.
// ============================================================

import Expo, { ExpoPushMessage } from 'expo-server-sdk';
import supabase from '../db/supabase';
import { SMCSignal } from '../models/signal';

// Expo SDK handles both iOS (APNs) and Android (FCM) via Expo's push service
// Free tier: unlimited pushes — no Firebase SDK needed on the server
const expo = new Expo();

// ── Types ─────────────────────────────────────

interface PushTarget {
  user_id:   string;
  fcm_token: string;
  min_confidence: number;
  notify_high_confidence: boolean;
  notify_all_signals:     boolean;
  notify_bias_change:     boolean;
  watched_pairs:          string[];
}

// ── Main export: send signal push to all eligible users ──

export async function sendSignalPushNotifications(signal: SMCSignal): Promise<void> {
  // 1. Fetch all users who have a push token registered
  const { data, error } = await supabase
    .from('user_preferences')
    .select(
      'user_id, fcm_token, min_confidence, notify_high_confidence, notify_all_signals, watched_pairs'
    )
    .not('fcm_token', 'is', null);

  if (error || !data?.length) return;

  const targets = data as PushTarget[];

  // 2. Build messages for eligible users
  const messages: ExpoPushMessage[] = [];

  for (const target of targets) {
    if (!Expo.isExpoPushToken(target.fcm_token)) continue;

    // Check if user watches this pair (empty array = watch all)
    const watchesPair =
      target.watched_pairs.length === 0 ||
      target.watched_pairs.includes(signal.pair.toUpperCase());

    if (!watchesPair) continue;

    // Check notification preference + confidence threshold
    const isHighConfidence = signal.confidence_score >= 80;
    const meetsThreshold   = signal.confidence_score >= target.min_confidence;

    const shouldSend =
      (target.notify_high_confidence && isHighConfidence) ||
      (target.notify_all_signals     && meetsThreshold);

    if (!shouldSend) continue;

    messages.push({
      to:    target.fcm_token,
      sound: 'default',
      title: `${signal.type} ${signal.pair} — ${signal.confidence_score}% Confidence`,
      body:  `${signal.confluences.slice(0, 2).join(' + ')} · RR 1:${signal.risk_reward}`,
      data: {
        signalId:  signal.signal_id,
        pair:      signal.pair,
        type:      signal.type,
        screen:    'signal-detail',   // deep link target for the mobile app
      },
      channelId: 'signals',           // Android channel defined in notifications.ts
    });
  }

  if (messages.length === 0) return;

  // 3. Send in chunks (Expo max 100 per request)
  const chunks = expo.chunkPushNotifications(messages);

  for (const chunk of chunks) {
    try {
      const receipts = await expo.sendPushNotificationsAsync(chunk);
      // receipts.forEach((receipt) => {
       receipts.forEach((receipt: import('expo-server-sdk').ExpoPushTicket) => {


        if (receipt.status === 'error') {
          console.error('[Push] Delivery error:', receipt.message, receipt.details);
        }
      });
    } catch (err) {
      console.error('[Push] Chunk send failed:', err);
    }
  }

  console.log(`[Push] Sent signal alert to ${messages.length} users — ${signal.pair} ${signal.type}`);
}

// ── HTF Bias change alert ─────────────────────

export async function sendBiasChangePushNotification(
  pair: string,
  newBias: string
): Promise<void> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('fcm_token, notify_bias_change, watched_pairs')
    .not('fcm_token', 'is', null)
    .eq('notify_bias_change', true);

  if (error || !data?.length) return;

  const messages: ExpoPushMessage[] = [];

  for (const target of data as PushTarget[]) {
    if (!Expo.isExpoPushToken(target.fcm_token)) continue;

    const watchesPair =
      target.watched_pairs.length === 0 ||
      target.watched_pairs.includes(pair.toUpperCase());

    if (!watchesPair) continue;

    messages.push({
      to:    target.fcm_token,
      sound: 'default',
      title: `HTF Bias Flipped — ${pair}`,
      body:  `Market structure now ${newBias} on the higher timeframe.`,
      data:  { pair, bias: newBias, screen: 'signals' },
      channelId: 'signals',
    });
  }

  if (!messages.length) return;

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    await expo.sendPushNotificationsAsync(chunk).catch(console.error);
  }

  console.log(`[Push] Bias change alert sent — ${pair} now ${newBias}`);
}