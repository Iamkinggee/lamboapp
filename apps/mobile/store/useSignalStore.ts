// ──────────────────────────────────────────────
// apps/mobile/store/useSignalStore.ts
// ──────────────────────────────────────────────
import { create } from 'zustand';
import { SMCSignal } from '../services/api';

type Filter = 'all' | 'BUY' | 'SELL' | 'high';

// Status of a signal — ACTIVE means still in play on the signals page
export type SignalStatus = 'ACTIVE' | 'TP_HIT' | 'SL_HIT';

export interface SignalWithStatus {
  signal: SMCSignal;
  status: SignalStatus;
  resolvedAt?: number; // timestamp when SL/TP was hit
}

export interface SignalState {
  signals:      SignalWithStatus[];
  activeFilter: Filter;
  isConnected:  boolean;
  unreadCount:  number;

  // Actions
  addSignal:    (signal: SMCSignal) => void;
  setSignals:   (signals: SMCSignal[]) => void;
  setFilter:    (filter: Filter) => void;
  setConnected: (connected: boolean) => void;
  markAllRead:  () => void;
  clearOld:     () => void;

  // Mark a signal as resolved (SL or TP hit) — removes it from live signals page
  markSignalResolved: (signalId: string, status: 'TP_HIT' | 'SL_HIT') => void;

  // Derived — ONLY returns ACTIVE signals for the signals page
  filtered:     () => SignalWithStatus[];

  // All resolved signals (for potential use elsewhere)
  resolvedSignals: () => SignalWithStatus[];
}

const MAX_SIGNALS = 100;

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

  setSignals: (signals) =>
    set({
      signals: signals.map((signal) => ({ signal, status: 'ACTIVE' as SignalStatus })),
    }),

  setFilter: (activeFilter) => set({ activeFilter }),

  setConnected: (isConnected) => set({ isConnected }),

  markAllRead: () => set({ unreadCount: 0 }),

  clearOld: () => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    set((state) => ({
      signals: state.signals.filter(
        (s) => s.signal.timestamp > cutoff || s.status !== 'ACTIVE'
      ),
    }));
  },

  // ── Key fix: marks signal resolved, removes it from the live signals page ──
  markSignalResolved: (signalId, status) => {
    set((state) => ({
      signals: state.signals.map((s) =>
        s.signal.signal_id === signalId
          ? { ...s, status, resolvedAt: Date.now() }
          : s
      ),
    }));
  },

  // Only ACTIVE signals appear on the signals page
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