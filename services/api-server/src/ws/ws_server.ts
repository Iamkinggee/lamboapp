// FILE: services/api-server/src/ws/ws_server.ts
import { FastifyInstance } from 'fastify';
import { SocketStream } from '@fastify/websocket';
import { randomUUID } from 'crypto';
import { registerClient } from './signal_broadcaster';
import { JWTPayload } from '../middleware/auth';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const SUPABASE_URL = process.env.SUPABASE_URL!;

const JWKS = createRemoteJWKSet(
  new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
);

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
            data:  { message: 'Authentication timeout' },
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

        let payload: JWTPayload;
        try {
          const result = await jwtVerify(msg.token, JWKS, {
            issuer:   `${SUPABASE_URL}/auth/v1`,
            audience: 'authenticated',
          });
          payload = {
            sub:   result.payload.sub as string,
            email: result.payload['email'] as string,
            iat:   result.payload.iat,
            exp:   result.payload.exp,
          };
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`[WS] JWT verify failed: ${errMsg}`);
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