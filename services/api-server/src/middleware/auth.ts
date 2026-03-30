// FILE: services/api-server/src/middleware/auth.ts

import { FastifyRequest, FastifyReply } from 'fastify';
import { importJWK, jwtVerify, JWK } from 'jose';

export interface JWTPayload {
  sub:          string;
  email:        string;
  skill_level?: string;
  iat?:         number;
  exp?:         number;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: JWTPayload;
  }
}

const SUPABASE_PUBLIC_JWK: JWK = {
  kty: "EC",
  crv: "P-256",
  x:   "rGiCShHzI3RN389pzJ2cshni7RO3xRctT2qKgbuNN6c",
  y:   "POMhV5RKNUPG2tbN1c7ocOxiUry93oTT3hMBPX8noaM",
  alg: "ES256",
  kid: "35c23d0f-6151-4b11-b9a8-845817d0dadf",
  key_ops: ["verify"],
};

let publicKey: Awaited<ReturnType<typeof importJWK>>;
async function getPublicKey() {
  if (!publicKey) {
    publicKey = await importJWK(SUPABASE_PUBLIC_JWK, 'ES256');
  }
  return publicKey;
}

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
    const key   = await getPublicKey();

    const { payload } = await jwtVerify(token, key, {
      issuer:   `${process.env.SUPABASE_URL}/auth/v1`,
      audience: 'authenticated',
    });

    request.user = {
      sub:         payload.sub as string,
      email:       payload['email'] as string,
      skill_level: (payload as any).user_metadata?.skill_level,
      iat:         payload.iat,
      exp:         payload.exp,
    };

  } catch (err) {
    console.error('[Auth] JWT verification failed:', err);
    reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
  }
}
