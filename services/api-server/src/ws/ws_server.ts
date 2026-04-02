// ──────────────────────────────────────────────
// src/ws/ws_server.ts
// ──────────────────────────────────────────────
import { FastifyInstance } from 'fastify';
import { SocketStream } from '@fastify/websocket';
import { randomUUID } from 'crypto';
import { registerClient } from './signal_broadcaster';

// FIX: Import the shared verifySupabaseToken from auth.ts.
// This is the SAME function used by all REST routes — guaranteed to use
// the same key/algorithm strategy (JWKS → HS256 fallback).
// Previously ws_server.ts had its own JWKS instance which could silently
// fail if SUPABASE_URL wasn't available at module load time.
import { verifySupabaseToken } from '../middleware/auth';

export async function wsServer(fastify: FastifyInstance): Promise<void> {

  fastify.get(
    '/ws',
    { websocket: true },
    (connection: SocketStream, request) => {
      const socket       = connection.socket;
      const connectionId = randomUUID();
      let authenticated  = false;

      const authTimeout = setTimeout(() => {
        if (!authenticated) {
          console.warn(`[WS] Auth timeout: ${connectionId}`);
          socket.send(JSON.stringify({
            event: 'error',
            data:  { message: 'Authentication timeout — send { type:"auth", token:"JWT" }' },
          }));
          socket.terminate();
        }
      }, 10_000);

      socket.on('message', async (rawData: Buffer) => {
        if (authenticated) return;

        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(rawData.toString()) as Record<string, unknown>;
        } catch {
          return;
        }

        if (msg.type !== 'auth' || typeof msg.token !== 'string') {
          socket.send(JSON.stringify({
            event: 'error',
            data:  { message: 'Send { type:"auth", token:"<JWT>" } first' },
          }));
          return;
        }

        // Use the shared verifier — same JWKS+HS256 fallback as REST routes
        const payload = await verifySupabaseToken(msg.token);
        if (!payload) {
          socket.send(JSON.stringify({
            event: 'error',
            data:  { message: 'Invalid or expired token' },
          }));
          socket.terminate();
          return;
        }

        clearTimeout(authTimeout);
        authenticated = true;

        registerClient(connectionId, socket, payload.sub);

        socket.send(JSON.stringify({
          event: 'ping',
          data:  { ts: Date.now(), message: 'Authenticated — signals streaming' },
        }));

        console.log(`[WS] Authenticated: ${payload.sub} (${connectionId})`);
      });

      socket.on('error', (err: Error) => {
        console.error(`[WS] Socket error [${connectionId}]:`, err.message);
        clearTimeout(authTimeout);
      });

      socket.on('close', () => {
        clearTimeout(authTimeout);
      });

      console.log(`[WS] New connection: ${connectionId} from ${request.ip}`);
    }
  );

  fastify.get('/ws/health', async (_req, reply) => {
    const { getClientCount } = await import('./signal_broadcaster');
    return reply.send({
      status:            'ok',
      connected_clients: getClientCount(),
      timestamp:         Date.now(),
    });
  });
}