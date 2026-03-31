// // FILE: services/api-server/src/routes/internal.ts

// import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
// import { sendSignalPushNotifications } from './notifications';
// import supabase from '../db/supabase';
// import { SMCSignal } from '../models/signal';

// const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? 'changeme';

// export async function internalRoutes(fastify: FastifyInstance) {

//   // ── POST /internal/signal ───────────────────────────────────
//   // Called by Python signal engine when a new signal is generated

//   fastify.post('/internal/signal', async (req: FastifyRequest, reply: FastifyReply) => {
//     // Guard: only Python engine can call this
//     const secret = req.headers['x-internal-secret'];
//     if (secret !== INTERNAL_SECRET) {
//       return reply.status(403).send({ error: 'Forbidden' });
//     }

//     const signal = req.body as Partial<SMCSignal>;

//     // Basic validation
//     if (!signal.pair || !signal.type || !signal.entry) {
//       return reply.status(400).send({ error: 'Missing required signal fields' });
//     }

//     console.log(`[Internal] Signal received: ${signal.pair} ${signal.type} conf=${signal.confidence_score}%`);

//     // 1. Save signal to Supabase
//     const { data: saved, error: dbError } = await supabase
//       .from('signals')
//       .insert({
//         pair:             signal.pair,
//         type:             signal.type,
//         entry:            signal.entry,
//         stop_loss:        signal.stop_loss,
//         take_profit:      signal.take_profit,
//         risk_reward:      signal.risk_reward,
//         confidence_score: signal.confidence_score,
//         confluences:      signal.confluences ?? [],
//         htf_bias:         signal.htf_bias,
//         entry_model:      signal.entry_model,
//         timeframe:        signal.timeframe,
//         htf_timeframe:    signal.htf_timeframe,
//         ai_explanation:   signal.ai_explanation ?? '',
//         timestamp:        Date.now(),
//       })
//       .select()
//       .single();

//     if (dbError) {
//       console.error('[Internal] DB error:', dbError);
//       return reply.status(500).send({ error: 'Failed to save signal' });
//     }

//     const signalId = saved.signal_id ?? saved.id;
//     console.log(`[Internal] Signal saved: ${signalId}`);

//     // 2. Send push notifications via Expo (uses existing notifications.ts)
//     try {
//       await sendSignalPushNotifications(saved as SMCSignal);
//       console.log(`[Internal] Push notifications sent for signal: ${signalId}`);
//     } catch (pushErr) {
//       console.error('[Internal] Push notification error:', pushErr);
//       // Don't fail the request — signal is saved, push is best-effort
//     }

//     return reply.send({ signal: saved, pushed: true });
//   });

//   // ── GET /internal/health ────────────────────────────────────
//   // Python engine calls this on startup to verify backend is reachable

//   fastify.get('/internal/health', async (_req: FastifyRequest, reply: FastifyReply) => {
//     return reply.send({
//       status:    'ok',
//       service:   'smc-api-server',
//       timestamp: Date.now(),
//     });
//   });
// }


















// FILE: services/api-server/src/routes/internal.ts

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sendSignalPushNotifications } from './notifications';
import supabase from '../db/supabase';
import { SMCSignal } from '../models/signal';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? 'changeme';

export async function internalRoutes(fastify: FastifyInstance) {

  // ── POST /internal/signal ───────────────────────────────────
  // Called by Python signal engine when a new signal is generated

  fastify.post('/internal/signal', async (req: FastifyRequest, reply: FastifyReply) => {
    // Guard: only Python engine can call this
    const secret = req.headers['x-internal-secret'];
    if (secret !== INTERNAL_SECRET) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const signal = req.body as Partial<SMCSignal>;

    // Basic validation
    if (!signal.pair || !signal.type || !signal.entry) {
      return reply.status(400).send({ error: 'Missing required signal fields' });
    }

    console.log(`[Internal] Signal received: ${signal.pair} ${signal.type} conf=${signal.confidence_score}%`);

    // 1. Save signal to Supabase
    const { data: saved, error: dbError } = await supabase
      .from('signals')
      .insert({
        pair:             signal.pair,
        signal_type:      signal.type,           // DB uses signal_type, not type
        entry:            signal.entry,
        stop_loss:        signal.stop_loss,
        take_profit:      signal.take_profit,
        risk_reward:      signal.risk_reward,
        confidence_score: signal.confidence_score,
        confluences:      signal.confluences ?? [],
        htf_bias:         signal.htf_bias,
        entry_model:      signal.entry_model,
        signal_tf:        signal.timeframe,      // DB uses signal_tf, not timeframe
        htf_tf:           signal.htf_timeframe,  // DB uses htf_tf, not htf_timeframe
        ai_explanation:   signal.ai_explanation ?? '',
        signal_time:      new Date().toISOString(), // DB uses signal_time (timestamptz), not timestamp
      })
      .select()
      .single();

    if (dbError) {
      console.error('[Internal] DB error:', dbError);
      return reply.status(500).send({ error: 'Failed to save signal' });
    }

    const signalId = saved.id;
    console.log(`[Internal] Signal saved: ${signalId}`);

    // 2. Send push notifications via Expo (uses existing notifications.ts)
    try {
      await sendSignalPushNotifications(saved as SMCSignal);
      console.log(`[Internal] Push notifications sent for signal: ${signalId}`);
    } catch (pushErr) {
      console.error('[Internal] Push notification error:', pushErr);
      // Don't fail the request — signal is saved, push is best-effort
    }

    return reply.send({ signal: saved, pushed: true });
  });

  // ── GET /internal/health ────────────────────────────────────
  // Python engine calls this on startup to verify backend is reachable

  fastify.get('/internal/health', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      status:    'ok',
      service:   'smc-api-server',
      timestamp: Date.now(),
    });
  });
}