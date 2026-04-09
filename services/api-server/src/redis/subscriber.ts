// FILE: services/api-server/src/redis/subscriber.ts
//
// ARCHITECTURE NOTE:
//   This subscriber is intentionally passive — it no longer calls
//   signalBus.emitSignal() on incoming Redis messages.
//
//   Previously, the flow was:
//     Redis PUBLISH → signalBus.emitSignal() → broadcastSignal()   ← duplicate ❌
//     POST /internal/signal               → broadcastSignal()   ← correct ✅
//
//   Since the Python engine does BOTH (publishes to Redis AND POSTs to
//   /internal/signal), every signal was broadcast twice. The fix is to
//   let /internal/signal be the single source of truth for broadcast,
//   and keep this subscriber only for logging/monitoring purposes.
//
//   If you ever want to decouple the Python engine so it only publishes
//   to Redis (no HTTP POST), you can re-enable signalBus.emitSignal()
//   here and remove the broadcastSignal() call from internal.ts.

import Redis from 'ioredis';
import { EventEmitter } from 'events';
import { SMCSignal } from '../models/signal';

class SignalEventBus extends EventEmitter {
  emitSignal(signal: SMCSignal) {
    this.emit('signal:new', signal);
  }
}

export const signalBus = new SignalEventBus();

// Deduplication: suppress identical signals within 5 minutes.
const recentHashes = new Map<string, number>();
const DEDUP_WINDOW_MS = 5 * 60 * 1000;

function isDuplicate(signal: SMCSignal): boolean {
  const entryFormatted = signal.entry.toFixed(8);
  const hash = `${signal.pair}:${signal.type}:${entryFormatted}:${signal.confidence_score}`;
  const now = Date.now();
  const lastSeen = recentHashes.get(hash);

  if (lastSeen && now - lastSeen < DEDUP_WINDOW_MS) return true;

  recentHashes.set(hash, now);

  for (const [key, ts] of Array.from(recentHashes.entries())) {
    if (now - ts > DEDUP_WINDOW_MS) recentHashes.delete(key);
  }

  return false;
}

let subscriber: Redis | null = null;

export function startRedisSubscriber(): void {
  subscriber = new Redis(process.env.REDIS_URL!, {
    tls: process.env.REDIS_URL?.startsWith('rediss') ? {} : undefined,
    retryStrategy: (times) => Math.min(times * 500, 10_000),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  subscriber.on('connect', () => console.log('[Redis] Subscriber connected'));
  subscriber.on('error',   (err) => console.error('[Redis] Error:', err.message));

  const channel = process.env.REDIS_SIGNAL_CHANNEL ?? 'signals:live';

  subscriber.subscribe(channel, (err, count) => {
    if (err) {
      console.error('[Redis] Subscribe failed:', err.message);
      return;
    }
    console.log(`[Redis] Subscribed to "${channel}" (${count} active)`);
  });

  subscriber.on('message', async (_ch: string, rawMessage: string) => {
    let signal: SMCSignal;
    try {
      signal = JSON.parse(rawMessage) as SMCSignal;
    } catch {
      console.warn('[Redis] Failed to parse signal — skipping');
      return;
    }

    if (!signal.signal_id || !signal.pair || !signal.type) {
      console.warn('[Redis] Malformed signal — missing required fields:', {
        signal_id: signal.signal_id,
        pair:      signal.pair,
        type:      signal.type,
      });
      return;
    }

    if (isDuplicate(signal)) {
      console.debug(`[Redis] Dedup drop: ${signal.pair} ${signal.type} @ ${signal.entry}`);
      return;
    }

    // ✅ Passive log only — broadcast is handled by /internal/signal route.
    // Do NOT call signalBus.emitSignal() here unless you remove the
    // broadcastSignal() call from internal.ts first.
    console.log(
      `[Redis] Signal observed (handled by HTTP route): ${signal.type} ${signal.pair} | Score: ${signal.confidence_score}% | RR: ${signal.risk_reward}`
    );
  });
}

export function stopRedisSubscriber(): Promise<void> {
  return new Promise((resolve) => {
    if (!subscriber) return resolve();
    subscriber.quit().then(() => {
      console.log('[Redis] Disconnected');
      resolve();
    });
  });
}