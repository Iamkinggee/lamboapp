


// LOCATION: services/api-server/src/index.ts

import 'dotenv/config';
import Fastify from 'fastify';

import fastifyCors      from '@fastify/cors';
import fastifyWebSocket from '@fastify/websocket';
import fastifyRateLimit  from '@fastify/rate-limit';
import fastifyJwt       from '@fastify/jwt';   // ✅ ADDED — required for ws_server.ts JWT verify

import { authRoutes }     from './routes/auth';
import { signalRoutes }   from './routes/signals';
import { tradeRoutes }    from './routes/trades';
import { aiRoutes }       from './routes/ai';
import { userRoutes }     from './routes/users';
import { internalRoutes } from './routes/internal';
import { adminRoutes }    from './routes/admin';
import { wsServer }       from './ws/ws_server';
import { initBroadcaster } from './ws/signal_broadcaster';
import { startRedisSubscriber, stopRedisSubscriber } from './redis/subscriber';

// ✅ Guard: fail fast if critical env vars are missing
const REQUIRED_ENV = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_JWT_SECRET',
  'REDIS_URL',
];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[Server] ❌ Missing required env var: ${key}`);
    process.exit(1);
  }
}

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
  // ── CORS ────────────────────────────────────────────────────────────────────
  await fastify.register(fastifyCors, {
    origin:         true,
    methods:        ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'x-internal-secret'],
  });

  // ── JWT ─────────────────────────────────────────────────────────────────────
  // ✅ CRITICAL: ws_server.ts calls fastify.jwt.verify() — must be registered
  // before wsServer. Uses Supabase JWT secret (HS256).
  // Find it: Supabase Dashboard → Project Settings → API → JWT Secret
  await fastify.register(fastifyJwt, {
    secret: process.env.SUPABASE_JWT_SECRET!,
    sign:   { algorithm: 'HS256' },
  });

  // ── WebSocket ────────────────────────────────────────────────────────────────
  await fastify.register(fastifyWebSocket);

  // ── Rate limiting ────────────────────────────────────────────────────────────
  await fastify.register(fastifyRateLimit, {
    max:        parseInt(process.env.RATE_LIMIT_MAX        ?? '100',   10),
    timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS  ?? '60000', 10),
    errorResponseBuilder: () => ({
      error:   'Too Many Requests',
      message: 'Rate limit exceeded. Try again in a moment.',
    }),
  });

  // ── Routes ───────────────────────────────────────────────────────────────────
  await fastify.register(authRoutes);
  await fastify.register(signalRoutes);
  await fastify.register(tradeRoutes);
  await fastify.register(userRoutes);
  await fastify.register(aiRoutes);
  await fastify.register(internalRoutes);
  await fastify.register(adminRoutes);     // ← web-admin dashboard endpoints
  await fastify.register(wsServer);   // ← must come AFTER JWT registration

  // ── Health check ─────────────────────────────────────────────────────────────
  fastify.get('/health', async (_req, reply) => {
    return reply.send({
      status:    'ok',
      service:   'smc-api-server',
      version:   '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  // ── Graceful shutdown ─────────────────────────────────────────────────────────
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
    const port   = parseInt(process.env.PORT ?? '3001', 10);
    const host   = '0.0.0.0';
    await server.listen({ port, host });

    startRedisSubscriber();
    initBroadcaster();

    console.log(`
╔══════════════════════════════════════════════╗
║         SMC Trading API Server  ✅           ║
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