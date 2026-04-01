// FILE: services/api-server/src/routes/users.ts

import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import { getUserPreferences, upsertUserPreferences, saveFCMToken } from '../db/supabase';
import { SkillLevel } from '../models/signal';

// ─────────────────────────────────────────────
// User Routes
// GET  /user/preferences    — fetch current prefs
// PUT  /user/preferences    — update settings
// PUT  /user/skill-level    — update skill level
// POST /user/fcm-token      — register FCM push token
// ─────────────────────────────────────────────
export async function userRoutes(fastify: FastifyInstance): Promise<void> {

  // ── GET /user/preferences ─────────────────────
  fastify.get('/user/preferences', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const prefs  = await getUserPreferences(userId);

    if (!prefs) {
      return reply.code(404).send({ error: 'Preferences not found' });
    }

    return reply.send({ preferences: prefs });
  });

  // ── PUT /user/preferences ─────────────────────
  fastify.put<{
    Body: {
      min_confidence_threshold?: number;
      watched_pairs?:            string[];
      default_rr_target?:        number;
      sl_buffer_multiplier?:     number;
      notify_high_confidence?:   boolean;
      notify_all_signals?:       boolean;
      notify_bias_change?:       boolean;
    };
  }>('/user/preferences', {
    preHandler: [authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          min_confidence_threshold: { type: 'number', minimum: 0, maximum: 100 },
          watched_pairs:            { type: 'array', items: { type: 'string' } },
          default_rr_target:        { type: 'number', minimum: 1 },
          sl_buffer_multiplier:     { type: 'number', minimum: 0.5, maximum: 3 },
          notify_high_confidence:   { type: 'boolean' },
          notify_all_signals:       { type: 'boolean' },
          notify_bias_change:       { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;

    await upsertUserPreferences({
      user_id: userId,
      ...request.body,
    });

    return reply.send({ message: 'Preferences updated' });
  });

  // ── PUT /user/skill-level ─────────────────────
  fastify.put<{
    Body: { skill_level: SkillLevel };
  }>('/user/skill-level', {
    preHandler: [authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['skill_level'],
        properties: {
          skill_level: { type: 'string', enum: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] },
        },
      },
    },
  }, async (request, reply) => {
    const userId      = (request.user as { sub: string }).sub;
    const { skill_level } = request.body;

    await upsertUserPreferences({ user_id: userId, skill_level });

    return reply.send({ message: 'Skill level updated', skill_level });
  });

  // ── POST /user/fcm-token ──────────────────────
  fastify.post<{
    Body: { fcm_token: string };
  }>('/user/fcm-token', {
    preHandler: [authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['fcm_token'],
        properties: {
          fcm_token: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    await saveFCMToken(userId, request.body.fcm_token);
    return reply.send({ message: 'FCM token registered' });
  });
}