import { FastifyRequest, FastifyReply } from 'fastify';

export interface JWTPayload {
  sub: string;
  email: string;
  skill_level?: string;
  iat?: number;
  exp?: number;
}

// Extend @fastify/jwt's interface — must match its expected type exactly
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JWTPayload;
    user: JWTPayload;
  }
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
  }
}