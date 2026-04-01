// ──────────────────────────────────────────────
// src/ws/ws_server.ts
// ──────────────────────────────────────────────
import { FastifyInstance } from 'fastify';
import { SocketStream } from '@fastify/websocket';
import { randomUUID } from 'crypto';
import { registerClient } from './signal_broadcaster';

// FIX: Use the same JWKS-based jose verifier as the REST authenticate middleware.
// The previous implementation used fastify.jwt.verify() which validates with HS256
// (SUPABASE_JWT_SECRET), but Supabase actually issues ES256 tokens.
// The mismatch meant every WS auth attempt failed with "Invalid or expired token"
// even for valid sessions — causing the infinite reconnect loop seen in the logs.
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { JWTPayload } from '../middleware/auth';

const SUPABASE_URL = process.env.SUPABASE_URL!;

// Reuse the same JWKS instance as the REST middleware (module-level singleton).
// If this module is loaded after auth.ts the JWK cache is already warm.
const JWKS = createRemoteJWKSet(
  new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
);

async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer:   `${SUPABASE_URL}/auth/v1`,
      audience: 'authenticated',
    });
    return {
      sub:         payload.sub as string,
      email:       payload['email'] as string,
      skill_level: (payload as Record<string, unknown>)?.['user_metadata'] as string | undefined,
      iat:         payload.iat,
      exp:         payload.exp,
    };
  } catch {
    return null;
  }
}

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

        // FIX: Verify with the same ES256 JWKS path used by REST routes.
        const payload = await verifyToken(msg.token);
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
      });

      socket.on('error', (err: Error) => {
        console.error(`[WS] Socket error [${connectionId}]:`, err.message);
        clearTimeout(authTimeout);
      });

      socket.on('close', () => clearTimeout(authTimeout));

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