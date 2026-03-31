

import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    user: {
      sub:          string;
      email:        string;
      skill_level?: string;
      iat?:         number;
      exp?:         number;
    };
  }
}