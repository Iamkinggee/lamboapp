// FILE: services/api-server/src/middleware/auth.ts

import { FastifyRequest, FastifyReply } from 'fastify';
import { createRemoteJWKSet, jwtVerify, createSecretKey } from 'jose';

export interface JWTPayload {
  sub:          string;
  email:        string;
  skill_level?: string;
  iat?:         number;
  exp?:         number;
}

const SUPABASE_URL        = process.env.SUPABASE_URL!;
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? '';

// ── JWKS (ES256) — used for Supabase projects with asymmetric keys ──────────
const JWKS = createRemoteJWKSet(
  new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
);

// ── HS256 secret key — Supabase standard auth sessions use this ──────────────
// All regular signIn/signUp JWTs from Supabase are HS256, not ES256.
// The JWKS endpoint is for third-party OAuth / PKCE flows only.
// We try JWKS first (for future-proofing), fall back to HS256 if it fails.
function getHs256Key() {
  if (!SUPABASE_JWT_SECRET) return null;
  return createSecretKey(Buffer.from(SUPABASE_JWT_SECRET, 'utf-8'));
}

/**
 * Shared JWT verifier used by both REST routes and WebSocket auth.
 * Tries JWKS (ES256) first, then falls back to HS256 with the JWT secret.
 * Returns null if both fail — caller decides how to respond.
 */
export async function verifySupabaseToken(token: string): Promise<JWTPayload | null> {
  // Strategy 1: JWKS (ES256) — works if Supabase project uses asymmetric signing
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
  } catch (jwksErr: unknown) {
    const msg = jwksErr instanceof Error ? jwksErr.message : String(jwksErr);
    // Only fall through if JWKS verification itself failed (not a network error)
    console.debug('[Auth] JWKS verify failed, trying HS256:', msg);
  }

  // Strategy 2: HS256 with SUPABASE_JWT_SECRET — standard for all Supabase auth sessions
  const hs256Key = getHs256Key();
  if (!hs256Key) {
    console.error('[Auth] SUPABASE_JWT_SECRET not set — cannot fall back to HS256');
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, hs256Key, {
      algorithms: ['HS256'],
    });
    return {
      sub:         payload.sub as string,
      email:       payload['email'] as string,
      skill_level: (payload as Record<string, unknown>)?.['user_metadata'] as string | undefined,
      iat:         payload.iat,
      exp:         payload.exp,
    };
  } catch (hs256Err: unknown) {
    const msg = hs256Err instanceof Error ? hs256Err.message : String(hs256Err);
    console.error('[Auth] HS256 verify also failed:', msg);
    return null;
  }
}

// ── REST route middleware ─────────────────────────────────────────────────────

export async function authenticate(
  request: FastifyRequest,
  reply:   FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Unauthorized', message: 'Missing token' });
  }

  const token = authHeader.slice(7);
  const payload = await verifySupabaseToken(token);

  if (!payload) {
    return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
  }

  request.user = {
    sub:         payload.sub,
    email:       payload.email,
    skill_level: payload.skill_level,
    iat:         payload.iat,
    exp:         payload.exp,
  };
}