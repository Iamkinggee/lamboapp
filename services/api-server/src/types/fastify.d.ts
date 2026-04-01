// FILE: services/api-server/src/types/fastify.d.ts
// ─────────────────────────────────────────────────────────────
// Type augmentation for @fastify/jwt
//
// @fastify/jwt exposes the FastifyJWT interface specifically for
// this purpose. Augmenting FastifyJWT['user'] automatically types
// request.user everywhere without conflicting with @fastify/jwt's
// own FastifyRequest.user declaration.
// ─────────────────────────────────────────────────────────────

import '@fastify/jwt';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    // payload shape (what gets signed into the JWT)
    payload: {
      sub:          string;
      email:        string;
      skill_level?: string;
      iat?:         number;
      exp?:         number;
    };
    // user shape — this is what request.user resolves to after verify
    user: {
      sub:          string;
      email:        string;
      skill_level?: string;
      iat?:         number;
      exp?:         number;
    };
  }
}