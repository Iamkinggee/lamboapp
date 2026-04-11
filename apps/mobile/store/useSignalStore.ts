// LOCATION: apps/mobile/store/useSignalStore.ts
// FIXES:
//  2. Signals never duplicate — strict dedup by signal_id
//  3. New WS signal always carries a fresh timestamp (Date.now())
//  6. Signals with status TP_HIT / SL_HIT are hidden from the signals page
//     automatically; they only reappear if a brand-new signal_id arrives
//  7. On initial load, only signals from the last 24h are shown; stale signals
//     from previous sessions are purged immediately

import { create } from 'zustand';
import { SMCSignal } from '../services/api';

type Filter = 'all' | 'BUY' | 'SELL' | 'high' | 'anticipatory';

export type SignalStatus = 'ACTIVE' | 'TP_HIT' | 'SL_HIT';

export interface SignalWithStatus {
  signal:      SMCSignal;
  status:      SignalStatus;
  resolvedAt?: number;
  // addedAt tracks when this entry entered the store (for freshness checks)
  addedAt:     number;
}

export interface SignalState {
  signals:      SignalWithStatus[];
  activeFilter: Filter;
  isConnected:  boolean;
  unreadCount:  number;

  addSignal:  (signal: SMCSignal) => void;
  addSignals: (signals: SMCSignal[]) => void;
  setSignals: (signals: SMCSignal[]) => void;

  setFilter:    (filter: Filter) => void;
  setConnected: (connected: boolean) => void;
  markAllRead:  () => void;
  clearOld:     () => void;
  markSignalResolved: (signalId: string, status: 'TP_HIT' | 'SL_HIT') => void;

  filtered:        () => SignalWithStatus[];
  resolvedSignals: () => SignalWithStatus[];
}

// How many signals to keep in memory across all pairs
const MAX_SIGNALS = 500;

// Signals older than this are considered stale and purged on initial REST load
const STALE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Dedup: keep one entry per signal_id. If a conflict, prefer resolved over ACTIVE. ──
function dedup(entries: SignalWithStatus[]): SignalWithStatus[] {
  const seen = new Map<string, SignalWithStatus>();
  for (const entry of entries) {
    const existing = seen.get(entry.signal.signal_id);
    if (!existing) {
      seen.set(entry.signal.signal_id, entry);
    } else {
      // Prefer resolved status; on equal status prefer newer addedAt
      const incomingResolved = entry.status !== 'ACTIVE';
      const existingResolved = existing.status !== 'ACTIVE';
      if (incomingResolved && !existingResolved) {
        seen.set(entry.signal.signal_id, entry);
      } else if (!incomingResolved && !existingResolved && entry.addedAt > existing.addedAt) {
        seen.set(entry.signal.signal_id, entry);
      }
    }
  }
  return Array.from(seen.values());
}

// Returns true if a signal_id has ever been resolved (TP or SL hit)
function isAlreadyResolved(state: SignalWithStatus[], signalId: string): boolean {
  return state.some((s) => s.signal.signal_id === signalId && s.status !== 'ACTIVE');
}

export const useSignalStore = create<SignalState>((set, get) => ({
  signals:      [],
  activeFilter: 'all',
  isConnected:  false,
  unreadCount:  0,

  // FIX #2+3: addSignal — called by WS handler for each new incoming signal.
  // - Ignores duplicates (same signal_id already in store)
  // - Ignores signals whose pair+entry already resolved (prevents re-display after TP/SL)
  // - Stamps addedAt = Date.now() so the timestamp is always "now" for WS signals
  addSignal: (signal) => {
    set((state) => {
      // Skip if this exact signal_id already exists
      if (state.signals.some((s) => s.signal.signal_id === signal.signal_id)) return state;

      // Skip if this pair already has a resolved entry with the same entry price
      // (i.e. don't re-surface a signal that was just TP/SL'd)
      const alreadyHit = state.signals.some(
        (s) =>
          s.signal.pair === signal.pair &&
          s.signal.entry === signal.entry &&
          s.status !== 'ACTIVE'
      );
      if (alreadyHit) return state;

      const entry: SignalWithStatus = {
        signal,
        status:  'ACTIVE',
        addedAt: Date.now(), // FIX #3: always fresh timestamp
      };
      const updated = dedup([entry, ...state.signals]).slice(0, MAX_SIGNALS);
      return { signals: updated, unreadCount: state.unreadCount + 1 };
    });
  },

  // addSignals — used for REST merges (non-WS).
  // Preserves already-resolved statuses; only adds truly new signal_ids.
  addSignals: (signals) => {
    set((state) => {
      const newEntries: SignalWithStatus[] = signals
        .filter((sig) => !state.signals.some((s) => s.signal.signal_id === sig.signal_id))
        .map((sig) => ({
          signal:  sig,
          status:  'ACTIVE' as SignalStatus,
          addedAt: sig.timestamp ?? Date.now(),
        }));
      if (newEntries.length === 0) return state;
      const merged = dedup([...state.signals, ...newEntries]).slice(0, MAX_SIGNALS);
      return { signals: merged };
    });
  },

  // setSignals — called on initial REST load.
  // FIX #7: immediately purges stale signals (older than 24h) so stale data
  // never shows on the signal page when the app first loads.
  setSignals: (signals) => {
    const now = Date.now();
    set((state) => {
      // Build a map of what we already have (preserving resolved statuses from price monitor)
      const existingMap = new Map<string, SignalWithStatus>(
        state.signals.map((s) => [s.signal.signal_id, s])
      );

      // WS-only entries (arrived via WS before REST completed): keep if ACTIVE and not stale
      const wsOnly = state.signals.filter(
        (s) =>
          !signals.some((r) => r.signal_id === s.signal.signal_id) &&
          s.status === 'ACTIVE' &&
          now - s.addedAt < STALE_AGE_MS
      );

      // From REST: merge, preserving existing resolved status, discard stale
      const fromRest: SignalWithStatus[] = signals
        .filter((sig) => now - (sig.timestamp ?? 0) < STALE_AGE_MS)
        .map((sig) => {
          const existing = existingMap.get(sig.signal_id);
          if (existing) return existing; // preserve resolved status
          return { signal: sig, status: 'ACTIVE' as SignalStatus, addedAt: sig.timestamp ?? now };
        });

      const merged = dedup([...wsOnly, ...fromRest]).slice(0, MAX_SIGNALS);
      return { signals: merged };
    });
  },

  setFilter:    (activeFilter) => set({ activeFilter }),
  setConnected: (isConnected)  => set({ isConnected }),
  markAllRead:  ()             => set({ unreadCount: 0 }),

  // Purge signals older than 24h that are still ACTIVE (shouldn't be shown)
  clearOld: () => {
    const cutoff = Date.now() - STALE_AGE_MS;
    set((state) => ({
      signals: state.signals.filter(
        (s) => s.addedAt > cutoff || s.status !== 'ACTIVE'
      ),
    }));
  },

  // FIX #6: markSignalResolved — marks ALL entries with this signal_id as resolved.
  // The filtered() function already hides TP_HIT/SL_HIT from the signals page,
  // so the coin disappears automatically.
  markSignalResolved: (signalId, status) => {
    set((state) => ({
      signals: state.signals.map((s) =>
        s.signal.signal_id === signalId
          ? { ...s, status, resolvedAt: Date.now() }
          : s
      ),
    }));
  },

  // filtered() — what the signals page shows.
  // FIX #6: only ACTIVE signals shown; TP_HIT and SL_HIT are automatically excluded.
  // FIX #7: also excludes signals older than 24h.
  filtered: () => {
    const { signals, activeFilter } = get();
    const now    = Date.now();
    const active = dedup(signals).filter(
      (s) => s.status === 'ACTIVE' && now - s.addedAt < STALE_AGE_MS
    );
    switch (activeFilter) {
      case 'BUY':          return active.filter((s) => s.signal.type === 'BUY');
      case 'SELL':         return active.filter((s) => s.signal.type === 'SELL');
      case 'high':         return active.filter((s) => s.signal.confidence_score >= 80);
      case 'anticipatory': return active.filter((s) => (s.signal as any).is_anticipatory === true);
      default:             return active;
    }
  },

  resolvedSignals: () => dedup(get().signals).filter((s) => s.status !== 'ACTIVE'),
}));