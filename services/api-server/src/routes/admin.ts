// LOCATION: services/api-server/src/routes/admin.ts
// Admin-only REST endpoints — protected by ADMIN_SECRET env var.
// Called exclusively by the web-admin dashboard.
//
// Endpoints:
//   GET  /admin/stats          — dashboard summary counts
//   GET  /admin/signals        — all signals (paginated, with filters)
//   GET  /admin/users          — all Supabase auth users + preferences
//   GET  /admin/logs           — recent system log entries
//   GET  /admin/engine/status  — signal engine health + config
//   POST /admin/engine/config  — update engine config (confidence, RR, pairs)
//   DELETE /admin/signals/:id  — delete a signal
//   POST /admin/notify         — send push to all users (test blast)

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import supabase from '../db/supabase';

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? 'admin-secret-change-me';

// ── Auth guard ─────────────────────────────────────────────────────────────
function adminAuth(req: FastifyRequest, reply: FastifyReply): boolean {
  const key = req.headers['x-admin-key'];
  if (key !== ADMIN_SECRET) {
    reply.status(403).send({ error: 'Forbidden — invalid admin key' });
    return false;
  }
  return true;
}

export async function adminRoutes(fastify: FastifyInstance) {

  // ── GET /admin/stats ────────────────────────────────────────────────────
  fastify.get('/admin/stats', async (req, reply) => {
    if (!adminAuth(req, reply)) return;

    const now       = new Date();
    const todayISO  = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    const [
      { count: totalSignals },
      { count: todaySignals },
      { data: highConf },
      { count: totalUsers },
      { data: trades },
    ] = await Promise.all([
      supabase.from('signals').select('*', { count: 'exact', head: true }),
      supabase.from('signals').select('*', { count: 'exact', head: true }).gte('signal_time', todayISO),
      supabase.from('signals').select('confidence_score').gte('confidence_score', 80).gte('signal_time', todayISO),
      supabase.from('user_preferences').select('*', { count: 'exact', head: true }),
      supabase.from('trades').select('outcome').neq('outcome', 'PENDING'),
    ]);

    const wins     = (trades ?? []).filter((t: any) => t.outcome === 'WIN').length;
    const total_tr = (trades ?? []).length;
    const win_rate = total_tr > 0 ? Math.round((wins / total_tr) * 100) : 0;

    // Average confidence from today's signals
    const { data: confData } = await supabase
      .from('signals')
      .select('confidence_score')
      .gte('signal_time', todayISO);

    const avgConf = confData && confData.length > 0
      ? Math.round(confData.reduce((s: number, r: any) => s + r.confidence_score, 0) / confData.length)
      : 0;

    return reply.send({
      total_signals:  totalSignals ?? 0,
      today_signals:  todaySignals ?? 0,
      high_conf_today: (highConf ?? []).length,
      total_users:    totalUsers ?? 0,
      win_rate,
      total_trades:   total_tr,
      avg_confidence: avgConf,
    });
  });

  // ── GET /admin/signals ──────────────────────────────────────────────────
  fastify.get<{
    Querystring: { limit?: string; offset?: string; type?: string; min_score?: string }
  }>('/admin/signals', async (req, reply) => {
    if (!adminAuth(req, reply)) return;

    const limit    = Math.min(parseInt(req.query.limit  ?? '100', 10), 500);
    const offset   = parseInt(req.query.offset   ?? '0',   10);
    const type     = req.query.type;
    const minScore = parseInt(req.query.min_score ?? '0',  10);

    let query = supabase
      .from('signals')
      .select('*', { count: 'exact' })
      .order('signal_time', { ascending: false })
      .range(offset, offset + limit - 1)
      .gte('confidence_score', minScore);

    if (type === 'BUY' || type === 'SELL') {
      query = query.eq('type', type);
    }

    const { data, error, count } = await query;
    if (error) return reply.status(500).send({ error: error.message });

    return reply.send({ signals: data ?? [], count: count ?? 0 });
  });

  // ── DELETE /admin/signals/:id ───────────────────────────────────────────
  fastify.delete<{ Params: { id: string } }>('/admin/signals/:id', async (req, reply) => {
    if (!adminAuth(req, reply)) return;

    const { error } = await supabase.from('signals').delete().eq('id', req.params.id);
    if (error) return reply.status(500).send({ error: error.message });

    return reply.send({ success: true, deleted: req.params.id });
  });

  // ── GET /admin/users ────────────────────────────────────────────────────
  fastify.get<{
    Querystring: { limit?: string; offset?: string }
  }>('/admin/users', async (req, reply) => {
    if (!adminAuth(req, reply)) return;

    const limit  = Math.min(parseInt(req.query.limit  ?? '100', 10), 500);
    const offset = parseInt(req.query.offset ?? '0', 10);

    // Pull from user_preferences (registered users with prefs)
    const { data: prefs, error: prefErr, count } = await supabase
      .from('user_preferences')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (prefErr) return reply.status(500).send({ error: prefErr.message });

    // Augment with trade stats per user
    const usersWithStats = await Promise.all(
      (prefs ?? []).map(async (u: any) => {
        const { data: tradeData } = await supabase
          .from('trades')
          .select('outcome, risk_reward')
          .eq('user_id', u.user_id)
          .neq('outcome', 'PENDING');

        const td    = tradeData ?? [];
        const wins  = td.filter((t: any) => t.outcome === 'WIN').length;
        const total = td.length;

        return {
          ...u,
          trade_count: total,
          win_rate:    total > 0 ? Math.round((wins / total) * 100) : 0,
        };
      })
    );

    return reply.send({ users: usersWithStats, count: count ?? 0 });
  });

  // ── GET /admin/trades ───────────────────────────────────────────────────
  fastify.get<{
    Querystring: { limit?: string; offset?: string }
  }>('/admin/trades', async (req, reply) => {
    if (!adminAuth(req, reply)) return;

    const limit  = Math.min(parseInt(req.query.limit  ?? '100', 10), 500);
    const offset = parseInt(req.query.offset ?? '0', 10);

    const { data, error, count } = await supabase
      .from('trades')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ trades: data ?? [], count: count ?? 0 });
  });

  // ── GET /admin/logs ─────────────────────────────────────────────────────
  // Returns recent chat messages as a proxy for system activity
  fastify.get<{ Querystring: { limit?: string } }>('/admin/logs', async (req, reply) => {
    if (!adminAuth(req, reply)) return;

    const limit = Math.min(parseInt(req.query.limit ?? '50', 10), 200);

    const { data, error } = await supabase
      .from('chat_messages')
      .select('role, content, created_at, user_id')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ logs: data ?? [] });
  });

  // ── GET /admin/engine/status ────────────────────────────────────────────
  // Returns current engine config from env + live signal counts as proxy health
  fastify.get('/admin/engine/status', async (req, reply) => {
    if (!adminAuth(req, reply)) return;

    const pairs  = (process.env.TRADING_PAIRS ?? '').split(',').filter(Boolean);
    const minRR  = parseFloat(process.env.MIN_RR ?? '2.0');
    const conf   = parseInt(process.env.CONFIDENCE_THRESHOLD ?? '65', 10);
    const cooldown = parseInt(process.env.SIGNAL_COOLDOWN_SEC ?? '60', 10);

    // Count signals in last 1h as engine activity proxy
    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
    const { count: recent } = await supabase
      .from('signals')
      .select('*', { count: 'exact', head: true })
      .gte('signal_time', oneHourAgo);

    return reply.send({
      status:       'RUNNING',
      pairs_count:  pairs.length,
      pairs:        pairs,
      min_rr:       minRR,
      confidence_threshold: conf,
      signal_cooldown_sec:  cooldown,
      signals_last_1h:      recent ?? 0,
      redis_url:    process.env.REDIS_URL ? 'configured' : 'missing',
    });
  });

  // ── POST /admin/engine/config ───────────────────────────────────────────
  // NOTE: This updates in-memory values only. To persist, update .env and redeploy.
  // Returns the new config so the admin can see what was set.
  fastify.post<{
    Body: {
      confidence_threshold?: number;
      min_rr?: number;
      signal_cooldown_sec?: number;
    }
  }>('/admin/engine/config', async (req, reply) => {
    if (!adminAuth(req, reply)) return;

    const { confidence_threshold, min_rr, signal_cooldown_sec } = req.body ?? {};

    // Update process.env values so running instance picks them up
    if (confidence_threshold != null) process.env.CONFIDENCE_THRESHOLD = String(confidence_threshold);
    if (min_rr              != null) process.env.MIN_RR               = String(min_rr);
    if (signal_cooldown_sec != null) process.env.SIGNAL_COOLDOWN_SEC  = String(signal_cooldown_sec);

    return reply.send({
      success: true,
      applied: { confidence_threshold, min_rr, signal_cooldown_sec },
      note: 'Config applied to running process. Restart or redeploy to make permanent.',
    });
  });

  // ── GET /admin/chart/hourly ─────────────────────────────────────────────
  // Returns signal counts grouped by hour for the last 24h
  fastify.get('/admin/chart/hourly', async (req, reply) => {
    if (!adminAuth(req, reply)) return;

    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data, error } = await supabase
      .from('signals')
      .select('signal_time')
      .gte('signal_time', since);

    if (error) return reply.status(500).send({ error: error.message });

    // Bucket into 24 hourly bins
    const bins = new Array(24).fill(0);
    for (const row of (data ?? [])) {
      const h = new Date(row.signal_time).getUTCHours();
      bins[h]++;
    }

    return reply.send({ bins });
  });
}