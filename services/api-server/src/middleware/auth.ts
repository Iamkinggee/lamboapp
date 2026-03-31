// // FILE: services/api-server/src/middleware/auth.ts

// import { FastifyRequest, FastifyReply } from 'fastify';
// import { createRemoteJWKSet, jwtVerify } from 'jose';

// export interface JWTPayload {
//   sub:          string;
//   email:        string;
//   skill_level?: string;
//   iat?:         number;
//   exp?:         number;
// }

// declare module 'fastify' {
//   interface FastifyRequest {
//     user: JWTPayload;
//   }
// }

// // Cache JWKS — fetched once, reused across all requests
// const JWKS = createRemoteJWKSet(
//   new URL(`${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks`)
// );

// export async function authenticate(
//   request: FastifyRequest,
//   reply:   FastifyReply
// ): Promise<void> {
//   try {
//     const authHeader = request.headers.authorization;
//     if (!authHeader?.startsWith('Bearer ')) {
//       return reply.code(401).send({ error: 'Unauthorized', message: 'Missing token' });
//     }

//     const token = authHeader.slice(7);

//     const { payload } = await jwtVerify(token, JWKS, {
//       issuer:   `${process.env.SUPABASE_URL}/auth/v1`,
//       audience: 'authenticated',
//     });

//     request.user = {
//       sub:         payload.sub as string,
//       email:       payload['email'] as string,
//       skill_level: (payload as any).user_metadata?.skill_level,
//       iat:         payload.iat,
//       exp:         payload.exp,
//     };

//   } catch (err) {
//     console.error('[Auth] JWT verification failed:', err);
//     reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
//   }
// }










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

// Cache JWKS — fetched once, reused across all requests
const JWKS = createRemoteJWKSet(
  new URL(`${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks`)
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