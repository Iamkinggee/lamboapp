// LOCATION: apps/mobile/store/useSignalStore.ts

import { create } from 'zustand';
import { SMCSignal } from '../services/api';

type Filter = 'all' | 'BUY' | 'SELL' | 'high';

export type SignalStatus = 'ACTIVE' | 'TP_HIT' | 'SL_HIT';

export interface SignalWithStatus {
  signal:      SMCSignal;
  status:      SignalStatus;
  resolvedAt?: number;
}

export interface SignalState {
  signals:      SignalWithStatus[];
  activeFilter: Filter;
  isConnected:  boolean;
  unreadCount:  number;

  addSignal:    (signal: SMCSignal) => void;
  addSignals:   (signals: SMCSignal[]) => void;
  setSignals:   (signals: SMCSignal[]) => void;

  setFilter:    (filter: Filter) => void;
  setConnected: (connected: boolean) => void;
  markAllRead:  () => void;
  clearOld:     () => void;
  markSignalResolved: (signalId: string, status: 'TP_HIT' | 'SL_HIT') => void;

  filtered:        () => SignalWithStatus[];
  resolvedSignals: () => SignalWithStatus[];
}

const MAX_SIGNALS = 100;

/** Deduplicate an array of SignalWithStatus by signal_id, keeping resolved over active. */
function dedup(entries: SignalWithStatus[]): SignalWithStatus[] {
  const seen = new Map<string, SignalWithStatus>();
  for (const entry of entries) {
    const existing = seen.get(entry.signal.signal_id);
    if (!existing) {
      seen.set(entry.signal.signal_id, entry);
    } else {
      // Prefer resolved status over ACTIVE if there's a conflict
      if (existing.status === 'ACTIVE' && entry.status !== 'ACTIVE') {
        seen.set(entry.signal.signal_id, entry);
      }
    }
  }
  return Array.from(seen.values());
}

export const useSignalStore = create<SignalState>((set, get) => ({
  signals:      [],
  activeFilter: 'all',
  isConnected:  false,
  unreadCount:  0,

  addSignal: (signal) => {
    set((state) => {
      const exists = state.signals.some((s) => s.signal.signal_id === signal.signal_id);
      if (exists) return state;
      const entry: SignalWithStatus = { signal, status: 'ACTIVE' };
      const updated = [entry, ...state.signals].slice(0, MAX_SIGNALS);
      return { signals: updated, unreadCount: state.unreadCount + 1 };
    });
  },

  addSignals: (signals) => {
    set((state) => {
      const existingIds = new Set(state.signals.map((s) => s.signal.signal_id));
      const newEntries: SignalWithStatus[] = signals
        .filter((sig) => !existingIds.has(sig.signal_id))
        .map((sig) => ({ signal: sig, status: 'ACTIVE' as SignalStatus }));
      if (newEntries.length === 0) return state;
      // FIX: dedup after merge to eliminate any pre-existing duplicates
      const merged = dedup([...state.signals, ...newEntries]).slice(0, MAX_SIGNALS);
      return { signals: merged };
    });
  },

  setSignals: (signals) =>
    set((state) => {
      const restIds = new Set(signals.map((s) => s.signal_id));
      const wsOnly  = state.signals.filter(
        (s) => !restIds.has(s.signal.signal_id) && s.status === 'ACTIVE'
      );
      const fromRest: SignalWithStatus[] = signals.map((signal) => {
        const existing = state.signals.find((s) => s.signal.signal_id === signal.signal_id);
        return existing ?? { signal, status: 'ACTIVE' as SignalStatus };
      });
      // FIX: dedup the merged result — prevents the same signal appearing
      // twice when it arrives via both WS and the REST initial load
      const merged = dedup([...wsOnly, ...fromRest]).slice(0, MAX_SIGNALS);
      return { signals: merged };
    }),

  setFilter:    (activeFilter) => set({ activeFilter }),
  setConnected: (isConnected)  => set({ isConnected }),
  markAllRead:  ()             => set({ unreadCount: 0 }),

  clearOld: () => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    set((state) => ({
      signals: state.signals.filter(
        (s) => s.signal.timestamp > cutoff || s.status !== 'ACTIVE'
      ),
    }));
  },

  markSignalResolved: (signalId, status) => {
    set((state) => ({
      // FIX: Map ALL entries with this signal_id, not just the first one.
      // If duplicates exist, ALL must be resolved — otherwise the duplicate
      // ACTIVE entry re-triggers the price monitor on the next tick.
      signals: state.signals.map((s) =>
        s.signal.signal_id === signalId
          ? { ...s, status, resolvedAt: Date.now() }
          : s
      ),
    }));
  },

  filtered: () => {
    const { signals, activeFilter } = get();
    // FIX: dedup before filtering so duplicates never reach the UI
    const active = dedup(signals).filter((s) => s.status === 'ACTIVE');
    switch (activeFilter) {
      case 'BUY':  return active.filter((s) => s.signal.type === 'BUY');
      case 'SELL': return active.filter((s) => s.signal.type === 'SELL');
      case 'high': return active.filter((s) => s.signal.confidence_score >= 80);
      default:     return active;
    }
  },

  resolvedSignals: () => dedup(get().signals).filter((s) => s.status !== 'ACTIVE'),
}));