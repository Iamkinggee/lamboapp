// ──────────────────────────────────────────────
// src/ws/ws_server.ts
// ──────────────────────────────────────────────
import { FastifyInstance } from 'fastify';
import { SocketStream } from '@fastify/websocket';
import { randomUUID } from 'crypto';
import { registerClient } from './signal_broadcaster';
import { JWTPayload } from '../middleware/auth';

// Pull in @fastify/jwt type augmentation so fastify.jwt is typed
import '@fastify/jwt';

export async function wsServer(fastify: FastifyInstance): Promise<void> {

  fastify.get(
    '/ws',
    { websocket: true },
    (connection: SocketStream, request) => {
      const socket     = connection.socket;   // raw ws.WebSocket
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

      socket.on('message', (rawData: Buffer) => {
        if (authenticated) return; // post-auth messages handled in registerClient

        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(rawData.toString()) as Record<string, unknown>;
        } catch {
          return; // ignore malformed JSON
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
          // fastify.jwt.verify is available because @fastify/jwt was registered in index.ts
          payload = fastify.jwt.verify<JWTPayload>(msg.token);
        } catch {
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

  // Health check for the WS layer
  fastify.get('/ws/health', async (_req, reply) => {
    const { getClientCount } = await import('./signal_broadcaster');
    return reply.send({
      status:            'ok',
      connected_clients: getClientCount(),
      timestamp:         Date.now(),
    });
  });
}