// FILE: services/api-server/src/routes/internal.ts

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sendSignalPushNotifications } from './notifications';
import supabase from '../db/supabase';
import { SMCSignal } from '../models/signal';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? 'changeme';

export async function internalRoutes(fastify: FastifyInstance) {

  // ── POST /internal/signal ───────────────────────────────────
  // Called by the Python signal engine when a new signal is generated.
  // Saves signal to Supabase and triggers Expo push notifications.

  fastify.post('/internal/signal', async (req: FastifyRequest, reply: FastifyReply) => {
    // Guard: only the Python engine can call this
    const secret = req.headers['x-internal-secret'];
    if (secret !== INTERNAL_SECRET) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const signal = req.body as Partial<SMCSignal>;

    // Basic validation
    if (!signal.pair || !signal.type || signal.entry == null) {
      return reply.status(400).send({ error: 'Missing required signal fields (pair, type, entry)' });
    }

    console.log(`[Internal] Signal received: ${signal.pair} ${signal.type} conf=${signal.confidence_score}%`);

    // 1. Save signal to Supabase
    // ✅ FIX: Column names match the signals table schema exactly.
    //         type, timeframe, htf_timeframe — NOT signal_type, signal_tf, htf_tf
    const { data: saved, error: dbError } = await supabase
      .from('signals')
      .insert({
        pair:             signal.pair,
        type:             signal.type,             // ✅ matches schema column: type
        entry:            signal.entry,
        stop_loss:        signal.stop_loss,
        take_profit:      signal.take_profit,
        risk_reward:      signal.risk_reward,
        confidence_score: signal.confidence_score,
        confluences:      signal.confluences ?? [],
        htf_bias:         signal.htf_bias,
        entry_model:      signal.entry_model,
        timeframe:        signal.timeframe,        // ✅ matches schema column: timeframe
        htf_timeframe:    signal.htf_timeframe,    // ✅ matches schema column: htf_timeframe
        ai_explanation:   signal.ai_explanation ?? '',
        signal_time:      new Date().toISOString(),
      })
      .select()
      .single();

    if (dbError) {
      console.error('[Internal] DB error:', dbError);
      return reply.status(500).send({ error: 'Failed to save signal', detail: dbError.message });
    }

    const signalId = saved.id;
    console.log(`[Internal] Signal saved: ${signalId}`);

    // 2. Map DB row back to SMCSignal shape for push notification
    const signalForPush: SMCSignal = {
      signal_id:        saved.id,
      pair:             saved.pair,
      type:             saved.type,
      entry:            saved.entry,
      stop_loss:        saved.stop_loss,
      take_profit:      saved.take_profit,
      risk_reward:      saved.risk_reward,
      confidence_score: saved.confidence_score,
      confluences:      saved.confluences ?? [],
      htf_bias:         saved.htf_bias,
      entry_model:      saved.entry_model,
      ai_explanation:   saved.ai_explanation ?? '',
      timeframe:        saved.timeframe,
      htf_timeframe:    saved.htf_timeframe,
      timestamp:        new Date(saved.signal_time).getTime(),
    };

    // 3. Send Expo push notifications (best-effort — don't fail if push fails)
    let pushed = false;
    try {
      await sendSignalPushNotifications(signalForPush);
      pushed = true;
      console.log(`[Internal] Push notifications sent for signal: ${signalId}`);
    } catch (pushErr) {
      console.error('[Internal] Push notification error:', pushErr);
    }

    return reply.send({ signal: signalForPush, pushed });
  });

  // ── GET /internal/health ────────────────────────────────────
  // Python engine calls this on startup to verify backend is reachable.

  fastify.get('/internal/health', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      status:    'ok',
      service:   'smc-api-server',
      timestamp: Date.now(),
    });
  });
}