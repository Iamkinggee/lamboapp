// FILE: apps/backend/src/middleware/auth.ts

import { FastifyRequest, FastifyReply } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface JWTPayload {
  sub:          string;
  email:        string;
  skill_level?: string;
  iat?:         number;
  exp?:         number;
}

// Cache JWKS — fetched once, reused across all requests
const JWKS = createRemoteJWKSet(
  new URL(`${process.env.SUPABASE_URL}/auth/v1/keys`)
);

export async function authenticate(
  request: FastifyRequest,
  reply:   FastifyReply
): Promise<void> {
  try {
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Missing token' });
    }

    const token = authHeader.slice(7);

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `${process.env.SUPABASE_URL}/auth/v1`,
    });

    // Attach parsed user to request for use in route handlers
    (request as any).user = {
      sub:         payload.sub,
      email:       payload['email'],
      skill_level: (payload as any).user_metadata?.skill_level,
      iat:         payload.iat,
      exp:         payload.exp,
    };

  } catch (err) {
    console.error('[Auth] JWT verification failed:', err);
    reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
  }
}