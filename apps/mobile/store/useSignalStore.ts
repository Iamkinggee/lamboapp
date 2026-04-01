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

  // Add a single incoming WS signal (deduped)
  addSignal:    (signal: SMCSignal) => void;
  // Merge a batch of signals from REST without overwriting WS-only signals
  addSignals:   (signals: SMCSignal[]) => void;
  // Full replace — only for first load
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

export const useSignalStore = create<SignalState>((set, get) => ({
  signals:      [],
  activeFilter: 'all',
  isConnected:  false,
  unreadCount:  0,

  // Single WS signal — prepend if not already present
  addSignal: (signal) => {
    set((state) => {
      const exists = state.signals.some((s) => s.signal.signal_id === signal.signal_id);
      if (exists) return state;
      const entry: SignalWithStatus = { signal, status: 'ACTIVE' };
      const updated = [entry, ...state.signals].slice(0, MAX_SIGNALS);
      return { signals: updated, unreadCount: state.unreadCount + 1 };
    });
  },

  // Merge REST batch — add any signals not already in store, preserving WS signals
  addSignals: (signals) => {
    set((state) => {
      const existingIds = new Set(state.signals.map((s) => s.signal.signal_id));
      const newEntries: SignalWithStatus[] = signals
        .filter((sig) => !existingIds.has(sig.signal_id))
        .map((sig) => ({ signal: sig, status: 'ACTIVE' as SignalStatus }));
      if (newEntries.length === 0) return state;
      // REST signals go after any WS-only signals (which are newest)
      const merged = [...state.signals, ...newEntries].slice(0, MAX_SIGNALS);
      return { signals: merged };
    });
  },

  // Full replace — first load only. Preserves ACTIVE status only.
  setSignals: (signals) =>
    set((state) => {
      // Keep any WS-only signals that aren't in the REST response
      const restIds = new Set(signals.map((s) => s.signal_id));
      const wsOnly  = state.signals.filter(
        (s) => !restIds.has(s.signal.signal_id) && s.status === 'ACTIVE'
      );
      const fromRest: SignalWithStatus[] = signals.map((signal) => {
        const existing = state.signals.find((s) => s.signal.signal_id === signal.signal_id);
        return existing ?? { signal, status: 'ACTIVE' as SignalStatus };
      });
      return { signals: [...wsOnly, ...fromRest].slice(0, MAX_SIGNALS) };
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
      signals: state.signals.map((s) =>
        s.signal.signal_id === signalId
          ? { ...s, status, resolvedAt: Date.now() }
          : s
      ),
    }));
  },

  filtered: () => {
    const { signals, activeFilter } = get();
    const active = signals.filter((s) => s.status === 'ACTIVE');
    switch (activeFilter) {
      case 'BUY':  return active.filter((s) => s.signal.type === 'BUY');
      case 'SELL': return active.filter((s) => s.signal.type === 'SELL');
      case 'high': return active.filter((s) => s.signal.confidence_score >= 80);
      default:     return active;
    }
  },

  resolvedSignals: () => get().signals.filter((s) => s.status !== 'ACTIVE'),
}));