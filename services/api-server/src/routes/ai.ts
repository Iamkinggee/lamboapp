// FILE: services/api-server/src/routes/ai.ts

import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import { getChatHistory, saveChatMessage, getSignalById } from '../db/supabase';

// FIX: was defaulting to http://localhost:8001 (the api-server itself),
// causing /ai/chat to call itself in a loop. Correct port is 8002.
const AI_SERVICE_URL = process.env.AI_SERVICE_URL ?? 'http://localhost:8002';

// ── HTF Bias Analysis ─────────────────────────────────────────────────────
// Derives a structured AI bias assessment from the signal's SMC attributes.
// This is injected directly into the explanation so even if the AI service
// is unavailable, the signal detail screen always shows an HTF bias block.

interface SMCSignalLike {
  pair:             string;
  type:             'BUY' | 'SELL';
  htf_bias:         'BULLISH' | 'BEARISH' | 'NEUTRAL';
  htf_timeframe:    string;
  timeframe:        string;
  entry:            number;
  stop_loss:        number;
  take_profit:      number;
  risk_reward:      number;
  confidence_score: number;
  confluences:      string[];
  entry_model:      string;
}

function buildHtfBiasBlock(signal: SMCSignalLike): string {
  const direction   = signal.type === 'BUY' ? 'bullish (long)' : 'bearish (short)';
  const biasEmoji   = signal.htf_bias === 'BULLISH' ? '📈' : signal.htf_bias === 'BEARISH' ? '📉' : '➡️';
  const aligned     = signal.htf_bias === 'BULLISH' && signal.type === 'BUY'
                   || signal.htf_bias === 'BEARISH' && signal.type === 'SELL';
  const alignedNote = aligned
    ? '✅ Trade direction is aligned with the HTF bias — this is a WITH-TREND entry and carries higher probability.'
    : '⚠️  Trade direction is COUNTER-TREND relative to the HTF bias. Require extra confluence and tighter risk management.';

  const riskNote = signal.risk_reward >= 3
    ? `The 1:${signal.risk_reward} R:R ratio is excellent — reward significantly outweighs the risk.`
    : signal.risk_reward >= 2
    ? `The 1:${signal.risk_reward} R:R ratio is solid for this setup.`
    : `The 1:${signal.risk_reward} R:R ratio is acceptable but on the lower end — consider if the setup justifies the risk.`;

  return [
    `${biasEmoji} HTF BIAS: ${signal.htf_bias} (${signal.htf_timeframe})`,
    `The higher timeframe structure on the ${signal.htf_timeframe} is ${signal.htf_bias.toLowerCase()}, providing the macro context for this ${direction} entry on the ${signal.timeframe}.`,
    alignedNote,
    '',
    `📊 RISK ASSESSMENT: ${riskNote}`,
    `Entry at ${signal.entry} with stop loss at ${signal.stop_loss} and take profit at ${signal.take_profit}.`,
    '',
    `🎯 CONFIDENCE: ${signal.confidence_score}% — based on ${signal.confluences.length} confluence factor${signal.confluences.length !== 1 ? 's' : ''}: ${signal.confluences.join(', ')}.`,
    `Entry model: ${signal.entry_model}.`,
  ].join('\n');
}

export async function aiRoutes(fastify: FastifyInstance): Promise<void> {

  fastify.post<{ Body: { message: string } }>(
    '/ai/chat',
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: 'object',
          required: ['message'],
          properties: { message: { type: 'string', maxLength: 4000 } },
        },
      },
    },
    async (request, reply) => {
      const userId = (request.user as { sub: string }).sub;
      const { message } = request.body;

      await saveChatMessage(userId, { role: 'user', content: message });

      let aiResponse: string;
      try {
        const res = await fetch(`${AI_SERVICE_URL}/chat`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ user_id: userId, message }),
          signal:  AbortSignal.timeout(30_000),
        });
        if (!res.ok) throw new Error(`AI service error: ${res.status}`);
        const data = (await res.json()) as { response: string };
        aiResponse = data.response;
      } catch (err) {
        console.error('[AI] Chat call failed:', err);
        return reply.code(503).send({ error: 'AI service temporarily unavailable.' });
      }

      await saveChatMessage(userId, { role: 'assistant', content: aiResponse });
      return reply.send({ response: aiResponse });
    }
  );

  fastify.post<{ Params: { id: string } }>(
    '/ai/explain/:id',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const userId = (request.user as { sub: string }).sub;
      const signal = await getSignalById(request.params.id) as SMCSignalLike | null;

      if (!signal) return reply.code(404).send({ error: 'Signal not found' });

      // Always build the HTF bias block first — this is deterministic and
      // doesn't depend on the AI service being available.
      const biasPreamble = buildHtfBiasBlock(signal);

      try {
        const res = await fetch(`${AI_SERVICE_URL}/explain`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ user_id: userId, signal, htf_bias_context: biasPreamble }),
          signal:  AbortSignal.timeout(20_000),
        });
        if (!res.ok) throw new Error(`AI service error: ${res.status}`);
        const data = (await res.json()) as { explanation: string };

        // Prepend the deterministic bias block above the AI narrative
        const fullExplanation = `${biasPreamble}\n\n---\n\n${data.explanation}`;
        return reply.send({ explanation: fullExplanation });
      } catch (err) {
        console.error('[AI] Explain call failed:', err);
        // Fall back to the bias block alone rather than a bare 503.
        return reply.send({
          explanation: `${biasPreamble}\n\n---\n\n⚠️ Extended AI narrative unavailable right now. The HTF bias and risk analysis above is generated from the signal's SMC attributes.`,
        });
      }
    }
  );

  fastify.get<{ Querystring: { limit?: string } }>(
    '/ai/history',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const userId = (request.user as { sub: string }).sub;
      const limit  = parseInt(request.query.limit ?? '20', 10);
      const history = await getChatHistory(userId, limit);
      return reply.send({ history });
    }
  );
}