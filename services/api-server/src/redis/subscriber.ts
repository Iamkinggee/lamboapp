import Redis from 'ioredis';
import { EventEmitter } from 'events';
import { SMCSignal } from '../models/signal';
// saveSignal import removed — persistence is handled by /internal/signal route

class SignalEventBus extends EventEmitter {
  emitSignal(signal: SMCSignal) {
    this.emit('signal:new', signal);
  }
}

export const signalBus = new SignalEventBus();

// Deduplication: suppress identical signals within 5 minutes.
// FIX: previously used Math.round(signal.entry) which collapses all altcoins
// priced below $0.50 to the same hash (rounded to 0 or 1), causing every
// signal from low-price tokens (DOGE, XRP, REEF, CHZ, etc.) to be dropped
// as duplicates. Now uses toFixed(8) to preserve precision across all price ranges.
const recentHashes = new Map<string, number>();
const DEDUP_WINDOW_MS = 5 * 60 * 1000;

function isDuplicate(signal: SMCSignal): boolean {
  // FIX: use toFixed(8) instead of Math.round() so sub-dollar tokens
  // (e.g. REEFUSDT at $0.0034, SHIBUSDT, DOGEUSDT) get distinct hashes.
  const entryFormatted = signal.entry.toFixed(8);
  const hash = `${signal.pair}:${signal.type}:${entryFormatted}:${signal.confidence_score}`;
  const now = Date.now();
  const lastSeen = recentHashes.get(hash);

  if (lastSeen && now - lastSeen < DEDUP_WINDOW_MS) return true;

  recentHashes.set(hash, now);

  // Cleanup stale entries
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

    console.log(
      `[Signal] ${signal.type} ${signal.pair} | Score: ${signal.confidence_score}% | RR: ${signal.risk_reward}`
    );

    // NOTE: saveSignal() is intentionally NOT called here.
    // The Python engine POSTs to /internal/signal which saves to Supabase
    // AND broadcasts via WebSocket in a single atomic step.
    // Calling saveSignal() here would write every signal to the DB twice
    // and could race with the /internal/signal upsert.
    // signalBus is kept for any future internal listeners but WS broadcast
    // is handled entirely by broadcastSignal() in signal_broadcaster.ts.
    signalBus.emitSignal(signal);
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