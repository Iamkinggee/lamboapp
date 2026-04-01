// FILE: services/api-server/src/routes/signals.ts

import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import { getSignals, getSignalById } from '../db/supabase';

// ─────────────────────────────────────────────
// Signal Routes
// GET /signals         — paginated history
// GET /signals/:id     — single signal detail
// ─────────────────────────────────────────────
export async function signalRoutes(fastify: FastifyInstance): Promise<void> {

  // ── GET /signals ──────────────────────────────
  fastify.get<{
    Querystring: {
      limit?:  string;
      offset?: string;
      pair?:   string;
      type?:   'BUY' | 'SELL';
    };
  }>('/signals', {
    preHandler: [authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit:  { type: 'string' },
          offset: { type: 'string' },
          pair:   { type: 'string' },
          type:   { type: 'string', enum: ['BUY', 'SELL'] },
        },
      },
    },
  }, async (request, reply) => {
    const { limit = '50', offset = '0', pair, type } = request.query;

    const limitNum  = Math.min(parseInt(limit,  10) || 50,  200);
    const offsetNum =          parseInt(offset, 10) || 0;

    const signals = await getSignals(limitNum, offsetNum, pair, type);
    return reply.send({ signals, count: signals.length });
  });

  // ── GET /signals/:id ──────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/signals/:id',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const signal = await getSignalById(request.params.id);

      if (!signal) {
        return reply.code(404).send({ error: 'Signal not found' });
      }

      return reply.send({ signal });
    }
  );
}