// FILE: services/api-server/src/middleware/auth.ts

import { FastifyRequest, FastifyReply } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface JWTPayload {
  sub:          string;
  email:        string;
  skill_level?: string;
  iat?:         number;
  exp?:         number;
}

const SUPABASE_URL = process.env.SUPABASE_URL!;

// ES256 — fetch the public key from Supabase's JWKS endpoint.
// Cached after first fetch, reused for all subsequent verifications.
const JWKS = createRemoteJWKSet(
  new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`)  // ← .json is required
);

export async function authenticate(
  request: FastifyRequest,
  reply:   FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Unauthorized', message: 'Missing token' });
  }

  const token = authHeader.slice(7);

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer:   `${SUPABASE_URL}/auth/v1`,
      audience: 'authenticated',
    });

    request.user = {
      sub:         payload.sub as string,
      email:       payload['email'] as string,
      skill_level: (payload as any).user_metadata?.skill_level,
      iat:         payload.iat,
      exp:         payload.exp,
    };

  } catch (err: any) {
    console.error('[Auth] JWT verification failed:', err?.code, err?.message);
    return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
  }
}