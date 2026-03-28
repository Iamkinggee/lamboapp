// import { FastifyInstance } from 'fastify';
// import supabase, { upsertUserPreferences } from '../db/supabase';

// // ─────────────────────────────────────────────
// // Auth Routes
// // POST /auth/register
// // POST /auth/login
// // POST /auth/refresh
// // POST /auth/logout
// // ─────────────────────────────────────────────
// export async function authRoutes(fastify: FastifyInstance): Promise<void> {

//   // ── Register ─────────────────────────────────
//   fastify.post<{
//     Body: { email: string; password: string; name: string };
//   }>('/auth/register', {
//     schema: {
//       body: {
//         type: 'object',
//         required: ['email', 'password', 'name'],
//         properties: {
//           email: { type: 'string', format: 'email' },
//           password: { type: 'string', minLength: 8 },
//           name: { type: 'string', minLength: 2 },
//         },
//       },
//     },
//   }, async (request, reply) => {
//     const { email, password, name } = request.body;

//     const { data, error } = await supabase.auth.admin.createUser({
//       email,
//       password,
//       user_metadata: { name },
//       email_confirm: true, // Skip email confirmation for MVP
//     });

//     if (error) {
//       return reply.code(400).send({ error: error.message });
//     }

//     // Create default preferences for new user
//     await upsertUserPreferences({
//       user_id: data.user.id,
//       skill_level: 'BEGINNER',
//       min_confidence_threshold: 65,
//       watched_pairs: ['BTCUSDT', 'ETHUSDT'],
//       default_rr_target: 2,
//       sl_buffer_multiplier: 1.0,
//       notify_high_confidence: true,
//       notify_all_signals: false,
//       notify_bias_change: true,
//     });

//     // Issue JWT
//     const token = fastify.jwt.sign({
//       sub: data.user.id,
//       email: data.user.email,
//       skill_level: 'BEGINNER',
//     });

//     return reply.code(201).send({
//       token,
//       user: {
//         id: data.user.id,
//         email: data.user.email,
//         name,
//         skill_level: 'BEGINNER',
//       },
//     });
//   });

//   // ── Login ─────────────────────────────────────
//   fastify.post<{
//     Body: { email: string; password: string };
//   }>('/auth/login', {
//     schema: {
//       body: {
//         type: 'object',
//         required: ['email', 'password'],
//         properties: {
//           email: { type: 'string', format: 'email' },
//           password: { type: 'string' },
//         },
//       },
//     },
//   }, async (request, reply) => {
//     const { email, password } = request.body;

//     const { data, error } = await supabase.auth.signInWithPassword({
//       email,
//       password,
//     });

//     if (error || !data.user) {
//       return reply.code(401).send({ error: 'Invalid email or password' });
//     }

//     const { data: prefData } = await supabase
//       .from('user_preferences')
//       .select('skill_level')
//       .eq('user_id', data.user.id)
//       .single();

//     const skill_level = (prefData as { skill_level?: string } | null)?.skill_level ?? 'BEGINNER';

//     const token = fastify.jwt.sign({
//       sub: data.user.id,
//       email: data.user.email,
//       skill_level,
//     });

//     return reply.send({
//       token,
//       user: {
//         id: data.user.id,
//         email: data.user.email,
//         name: (data.user.user_metadata as { name?: string })?.name ?? '',
//         skill_level,
//       },
//     });
//   });

//   // ── Token refresh (validate + reissue) ────────
//   fastify.post('/auth/refresh', {
//     preHandler: [async (req, rep) => {
//       try { await req.jwtVerify(); }
//       catch { rep.code(401).send({ error: 'Token expired or invalid' }); }
//     }],
//   }, async (request, reply) => {
//     const payload = request.user;
//     const newToken = fastify.jwt.sign({
//       sub: payload.sub,
//       email: payload.email,
//       skill_level: payload.skill_level,
//     });
//     return reply.send({ token: newToken });
//   });

//   // ── Logout (client-side — just confirm) ───────
//   fastify.post('/auth/logout', async (_request, reply) => {
//     // JWT is stateless — actual logout is done client-side by deleting the token.
//     // This endpoint exists so mobile app can signal the server (e.g. clear FCM token).
//     return reply.send({ message: 'Logged out successfully' });
//   });
// }















import { FastifyInstance } from 'fastify';
import supabase, { upsertUserPreferences } from '../db/supabase';

export async function authRoutes(fastify: FastifyInstance): Promise<void> {

  fastify.post<{
    Body: { email: string; password: string; name: string };
  }>('/auth/register', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password', 'name'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          name: { type: 'string', minLength: 2 },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password, name } = request.body;

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name },
      email_confirm: true,
    });

    if (error) {
      return reply.code(400).send({ error: error.message });
    }

    await upsertUserPreferences({
      user_id: data.user.id,
      skill_level: 'BEGINNER',
      min_confidence_threshold: 65,
      watched_pairs: ['BTCUSDT', 'ETHUSDT'],
      default_rr_target: 2,
      sl_buffer_multiplier: 1.0,
      notify_high_confidence: true,
      notify_all_signals: false,
      notify_bias_change: true,
    });

    const token = fastify.jwt.sign({
      sub: data.user.id,
      email: data.user.email!,
      skill_level: 'BEGINNER',
    });

    return reply.code(201).send({
      token,
      user: {
        id: data.user.id,
        email: data.user.email,
        name,
        skill_level: 'BEGINNER',
      },
    });
  });

  fastify.post<{
    Body: { email: string; password: string };
  }>('/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password } = request.body;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    const { data: prefData } = await supabase
      .from('user_preferences')
      .select('skill_level')
      .eq('user_id', data.user.id)
      .single();

    const skill_level = (prefData as { skill_level?: string } | null)?.skill_level ?? 'BEGINNER';

    const token = fastify.jwt.sign({
      sub: data.user.id,
      email: data.user.email!,
      skill_level,
    });

    return reply.send({
      token,
      user: {
        id: data.user.id,
        email: data.user.email,
        name: (data.user.user_metadata as { name?: string })?.name ?? '',
        skill_level,
      },
    });
  });

  fastify.post('/auth/refresh', {
    preHandler: [async (req, rep) => {
      try { await req.jwtVerify(); }
      catch { rep.code(401).send({ error: 'Token expired or invalid' }); }
    }],
  }, async (request, reply) => {
    const payload = request.user;
    const newToken = fastify.jwt.sign({
      sub: payload.sub,
      email: payload.email,
      skill_level: payload.skill_level,
    });
    return reply.send({ token: newToken });
  });

  fastify.post('/auth/logout', async (_request, reply) => {
    return reply.send({ message: 'Logged out successfully' });
  });
}