// FILE: services/api-server/src/routes/auth.ts

import { FastifyInstance } from 'fastify';
import supabase, { upsertUserPreferences } from '../db/supabase';

export async function authRoutes(fastify: FastifyInstance): Promise<void> {

  // ── Register ─────────────────────────────────
  fastify.post<{
    Body: { email: string; password: string; name: string; skill_level?: string };
  }>('/auth/register', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password', 'name'],
        properties: {
          email:       { type: 'string', format: 'email' },
          password:    { type: 'string', minLength: 6 },
          name:        { type: 'string', minLength: 2 },
          skill_level: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password, name, skill_level = 'BEGINNER' } = request.body;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, skill_level } },
    });

    if (error || !data.user) {
      return reply.code(400).send({ error: error?.message ?? 'Registration failed' });
    }

    await upsertUserPreferences({
      user_id:                  data.user.id,
      skill_level:              skill_level.toUpperCase() as any,
      min_confidence_threshold: 65,
      watched_pairs:            ['BTCUSDT', 'ETHUSDT'],
      default_rr_target:        2,
      sl_buffer_multiplier:     1.0,
      notify_high_confidence:   true,
      notify_all_signals:       false,
      notify_bias_change:       true,
    });

    // Return Supabase session token directly
    const token = data.session?.access_token ?? '';

    return reply.code(201).send({
      token,
      user: {
        id:          data.user.id,
        email:       data.user.email,
        name,
        skill_level: skill_level.toUpperCase() as any,
      },
    });
  });

  // ── Login ─────────────────────────────────────
  fastify.post<{
    Body: { email: string; password: string };
  }>('/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email:    { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password } = request.body;

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.user || !data.session) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    const { data: prefData } = await supabase
      .from('user_preferences')
      .select('skill_level')
      .eq('user_id', data.user.id)
      .single();

    const skill_level = (prefData as { skill_level?: string } | null)?.skill_level ?? 'BEGINNER';

    // Return Supabase session token directly — verified by ES256 public key
    return reply.send({
      token: data.session.access_token,
      user: {
        id:          data.user.id,
        email:       data.user.email,
        name:        (data.user.user_metadata as { name?: string })?.name ?? '',
        skill_level,
      },
    });
  });

  // ── Refresh ───────────────────────────────────
  fastify.post('/auth/refresh', async (_request, reply) => {
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session) {
      return reply.code(401).send({ error: 'Could not refresh session' });
    }
    return reply.send({ token: data.session.access_token });
  });

  // ── Logout ────────────────────────────────────
  fastify.post('/auth/logout', async (_request, reply) => {
    return reply.send({ message: 'Logged out successfully' });
  });
}
