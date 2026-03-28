import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import { getChatHistory, saveChatMessage, getSignalById } from '../db/supabase';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL ?? 'http://localhost:8001';

export async function aiRoutes(fastify: FastifyInstance): Promise<void> {

  fastify.post<{ Body: { message: string } }>(
    '/ai/chat',
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: 'object',
          required: ['message'],
          properties: { message: { type: 'string', maxLength: 500 } },
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.sub;
      const { message } = request.body;

      await saveChatMessage(userId, { role: 'user', content: message });

      let aiResponse: string;
      try {
        const res = await fetch(`${AI_SERVICE_URL}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId, message }),
          signal: AbortSignal.timeout(30_000),
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
      const userId = request.user.sub;
      const signal = await getSignalById(request.params.id);

      if (!signal) return reply.code(404).send({ error: 'Signal not found' });
      if (signal.ai_explanation) return reply.send({ explanation: signal.ai_explanation });

      try {
        const res = await fetch(`${AI_SERVICE_URL}/explain`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId, signal }),
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) throw new Error(`AI service error: ${res.status}`);
        const data = (await res.json()) as { explanation: string };
        return reply.send({ explanation: data.explanation });
      } catch (err) {
        console.error('[AI] Explain call failed:', err);
        return reply.code(503).send({ error: 'AI service unavailable' });
      }
    }
  );

  fastify.get<{ Querystring: { limit?: string } }>(
    '/ai/history',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const userId = request.user.sub;
      const limit = parseInt(request.query.limit ?? '20', 10);
      const history = await getChatHistory(userId, limit);
      return reply.send({ history });
    }
  );
}