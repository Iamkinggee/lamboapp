


// FILE: services/api-server/src/index.ts

import 'dotenv/config';
import Fastify from 'fastify';

import fastifyCors from '@fastify/cors';
import fastifyWebSocket from '@fastify/websocket';
import fastifyRateLimit from '@fastify/rate-limit';

import { authRoutes } from './routes/auth';
import { signalRoutes } from './routes/signals';
import { tradeRoutes } from './routes/trades';
import { aiRoutes } from './routes/ai';
import { userRoutes } from './routes/users';
import { internalRoutes } from './routes/internal';      // ← ADD THIS
import { wsServer } from './ws/ws_server';
import { initBroadcaster } from './ws/signal_broadcaster';
import { startRedisSubscriber, stopRedisSubscriber } from './redis/subscriber';

const fastify = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
    transport:
      process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
});

async function buildServer() {
  await fastify.register(fastifyCors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  });


  await fastify.register(fastifyWebSocket);

  await fastify.register(fastifyRateLimit, {
    max: parseInt(process.env.RATE_LIMIT_MAX ?? '100', 10),
    timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10),
    errorResponseBuilder: () => ({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Try again in a moment.',
    }),
  });

  await fastify.register(authRoutes);
  await fastify.register(signalRoutes);
  await fastify.register(tradeRoutes);
  await fastify.register(userRoutes);
  await fastify.register(aiRoutes);
  await fastify.register(internalRoutes);               // ← ADD THIS
  await fastify.register(wsServer);

  fastify.get('/health', async (_req, reply) => {
    return reply.send({
      status:    'ok',
      service:   'smc-api-server',
      version:   '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
  for (const sig of signals) {
    process.on(sig, async () => {
      console.log(`[Server] ${sig} received — shutting down`);
      await fastify.close();
      await stopRedisSubscriber();
      process.exit(0);
    });
  }

  return fastify;
}

async function start() {
  try {
    const server = await buildServer();
    const port = parseInt(process.env.PORT ?? '3001', 10);
    const host = '0.0.0.0';
    await server.listen({ port, host });

    startRedisSubscriber();
    initBroadcaster();

    console.log(`
╔══════════════════════════════════════════════╗
║         SMC Trading API Server               ║
║  REST   →  http://${host}:${port}           ║
║  WS     →  ws://${host}:${port}/ws          ║
║  Health →  http://${host}:${port}/health    ║
╚══════════════════════════════════════════════╝`);
  } catch (err) {
    console.error('[Server] Failed to start:', err);
    process.exit(1);
  }
}

start();