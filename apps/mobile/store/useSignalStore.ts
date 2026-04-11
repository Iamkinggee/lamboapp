// LOCATION: apps/mobile/store/useSignalStore.ts
// FIXES:
//  - Primary dedup by signal_id (existing)
//  - Secondary dedup by (pair + type + rounded_entry) prevents engine re-fires
//    with different signal_ids from appearing as separate cards
//  - 1m/3m/5m signals rejected at store entry — only 15m entries accepted
//  - Resolved signals (TP_HIT/SL_HIT) hidden from filtered() automatically
//  - Stale signals >24h purged on initial load
//  - unreadCount only increments for signals that actually pass all gates

import { create } from 'zustand';
import { SMCSignal } from '../services/api';

type Filter = 'all' | 'BUY' | 'SELL' | 'high' | 'anticipatory';

export type SignalStatus = 'ACTIVE' | 'TP_HIT' | 'SL_HIT';

export interface SignalWithStatus {
  signal:      SMCSignal;
  status:      SignalStatus;
  resolvedAt?: number;
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

  setFilter:          (filter: Filter) => void;
  setConnected:       (connected: boolean) => void;
  markAllRead:        () => void;
  clearOld:           () => void;
  markSignalResolved: (signalId: string, status: 'TP_HIT' | 'SL_HIT') => void;

  filtered:        () => SignalWithStatus[];
  resolvedSignals: () => SignalWithStatus[];
}

const MAX_SIGNALS  = 500;
const STALE_AGE_MS = 24 * 60 * 60 * 1000;

// Accepted entry timeframes — 1m/3m/5m are too noisy
const VALID_ENTRY_TFS = new Set(['15m', '15', '1h', '']);

function isAcceptedTf(tf?: string): boolean {
  if (!tf) return true;
  return VALID_ENTRY_TFS.has(tf.toLowerCase());
}

// Primary dedup: by signal_id
function primaryDedup(entries: SignalWithStatus[]): SignalWithStatus[] {
  const seen = new Map<string, SignalWithStatus>();
  for (const entry of entries) {
    const existing = seen.get(entry.signal.signal_id);
    if (!existing) {
      seen.set(entry.signal.signal_id, entry);
    } else {
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

// Secondary dedup: same (pair + type + ~entry price) = same trade setup
// Keeps the one with the highest confidence score
function secondaryDedup(entries: SignalWithStatus[]): SignalWithStatus[] {
  const seen = new Map<string, SignalWithStatus>();
  for (const entry of entries) {
    const key = `${entry.signal.pair}:${entry.signal.type}:${Math.round(entry.signal.entry * 10000)}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, entry);
    } else {
      // Prefer resolved; on equal status prefer higher confidence then newer
      const inResolved = entry.status !== 'ACTIVE';
      const exResolved = existing.status !== 'ACTIVE';
      if (inResolved && !exResolved) {
        seen.set(key, entry);
      } else if (!inResolved && !exResolved) {
        if (
          entry.signal.confidence_score > existing.signal.confidence_score ||
          (entry.signal.confidence_score === existing.signal.confidence_score &&
            entry.signal.timestamp > existing.signal.timestamp)
        ) {
          seen.set(key, entry);
        }
      }
    }
  }
  return Array.from(seen.values());
}

function fullDedup(entries: SignalWithStatus[]): SignalWithStatus[] {
  return secondaryDedup(primaryDedup(entries));
}

export const useSignalStore = create<SignalState>((set, get) => ({
  signals:      [],
  activeFilter: 'all',
  isConnected:  false,
  unreadCount:  0,

  addSignal: (signal) => {
    // Reject noisy timeframes at the door
    if (!isAcceptedTf(signal.timeframe)) return;

    set((state) => {
      // Skip exact signal_id duplicate
      if (state.signals.some((s) => s.signal.signal_id === signal.signal_id)) return state;

      // Skip if this pair+type+entry already has a resolved entry
      const alreadyHit = state.signals.some(
        (s) =>
          s.signal.pair === signal.pair &&
          s.signal.type === signal.type &&
          Math.abs(s.signal.entry - signal.entry) < signal.entry * 0.0001 &&
          s.status !== 'ACTIVE'
      );
      if (alreadyHit) return state;

      const entry: SignalWithStatus = {
        signal,
        status:  'ACTIVE',
        addedAt: Date.now(),
      };
      const updated = fullDedup([entry, ...state.signals]).slice(0, MAX_SIGNALS);
      return { signals: updated, unreadCount: state.unreadCount + 1 };
    });
  },

  addSignals: (signals) => {
    const accepted = signals.filter((s) => isAcceptedTf(s.timeframe));
    if (!accepted.length) return;
    set((state) => {
      const newEntries: SignalWithStatus[] = accepted
        .filter((sig) => !state.signals.some((s) => s.signal.signal_id === sig.signal_id))
        .map((sig) => ({
          signal:  sig,
          status:  'ACTIVE' as SignalStatus,
          addedAt: sig.timestamp ?? Date.now(),
        }));
      if (newEntries.length === 0) return state;
      const merged = fullDedup([...state.signals, ...newEntries]).slice(0, MAX_SIGNALS);
      return { signals: merged };
    });
  },

  setSignals: (signals) => {
    const now      = Date.now();
    const accepted = signals.filter((s) => isAcceptedTf(s.timeframe));
    set((state) => {
      const existingMap = new Map<string, SignalWithStatus>(
        state.signals.map((s) => [s.signal.signal_id, s])
      );
      const wsOnly = state.signals.filter(
        (s) =>
          !accepted.some((r) => r.signal_id === s.signal.signal_id) &&
          s.status === 'ACTIVE' &&
          now - s.addedAt < STALE_AGE_MS
      );
      const fromRest: SignalWithStatus[] = accepted
        .filter((sig) => now - (sig.timestamp ?? 0) < STALE_AGE_MS)
        .map((sig) => {
          const existing = existingMap.get(sig.signal_id);
          if (existing) return existing;
          return { signal: sig, status: 'ACTIVE' as SignalStatus, addedAt: sig.timestamp ?? now };
        });
      const merged = fullDedup([...wsOnly, ...fromRest]).slice(0, MAX_SIGNALS);
      return { signals: merged };
    });
  },

  setFilter:    (activeFilter) => set({ activeFilter }),
  setConnected: (isConnected)  => set({ isConnected }),
  markAllRead:  ()             => set({ unreadCount: 0 }),

  clearOld: () => {
    const cutoff = Date.now() - STALE_AGE_MS;
    set((state) => ({
      signals: state.signals.filter(
        (s) => s.addedAt > cutoff || s.status !== 'ACTIVE'
      ),
    }));
  },

  markSignalResolved: (signalId, status) => {
    set((state) => ({
      signals: state.signals.map((s) =>
        s.signal.signal_id === signalId
          ? { ...s, status, resolvedAt: Date.now() }
          : s
      ),
    }));
  },

  filtered: () => {
    const { signals, activeFilter } = get();
    const now    = Date.now();
    // Apply both dedup passes before filtering
    const active = fullDedup(signals).filter(
      (s) =>
        s.status === 'ACTIVE' &&
        now - s.addedAt < STALE_AGE_MS &&
        isAcceptedTf(s.signal.timeframe)
    );
    switch (activeFilter) {
      case 'BUY':          return active.filter((s) => s.signal.type === 'BUY');
      case 'SELL':         return active.filter((s) => s.signal.type === 'SELL');
      case 'high':         return active.filter((s) => s.signal.confidence_score >= 80);
      case 'anticipatory': return active.filter((s) => (s.signal as any).is_anticipatory === true);
      default:             return active;
    }
  },

  resolvedSignals: () => fullDedup(get().signals).filter((s) => s.status !== 'ACTIVE'),
}));