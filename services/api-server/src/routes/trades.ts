import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import { saveTrade, getUserTrades, getTradeStats } from '../db/supabase';
import { TradeOutcome, SignalType } from '../models/signal';

// ─────────────────────────────────────────────
// Trade Routes
// POST /trades         — log a trade outcome
// GET  /trades         — user trade history + stats
// ─────────────────────────────────────────────
export async function tradeRoutes(fastify: FastifyInstance): Promise<void> {

  // ── POST /trades ──────────────────────────────
  fastify.post<{
    Body: {
      signal_id: string;
      pair: string;
      type: SignalType;
      entry: number;
      stop_loss: number;
      take_profit: number;
      risk_reward: number;
      confidence_score: number;
      outcome: TradeOutcome;
      notes?: string;
    };
  }>('/trades', {
    preHandler: [authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['signal_id', 'pair', 'type', 'entry', 'stop_loss', 'take_profit', 'risk_reward', 'confidence_score', 'outcome'],
        properties: {
          signal_id: { type: 'string' },
          pair: { type: 'string' },
          type: { type: 'string', enum: ['BUY', 'SELL'] },
          entry: { type: 'number' },
          stop_loss: { type: 'number' },
          take_profit: { type: 'number' },
          risk_reward: { type: 'number' },
          confidence_score: { type: 'number' },
          outcome: { type: 'string', enum: ['WIN', 'LOSS', 'PENDING', 'BREAKEVEN'] },
          notes: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const userId = request.user.sub;

    const trade = await saveTrade({
      user_id: userId,
      ...request.body,
    });

    return reply.code(201).send({ trade });
  });

  // ── GET /trades ───────────────────────────────
  fastify.get<{
    Querystring: { limit?: string; offset?: string };
  }>('/trades', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const userId = request.user.sub;
    const { limit = '50', offset = '0' } = request.query;

    const [trades, stats] = await Promise.all([
      getUserTrades(userId, parseInt(limit, 10), parseInt(offset, 10)),
      getTradeStats(userId),
    ]);

    return reply.send({ trades, stats });
  });
}