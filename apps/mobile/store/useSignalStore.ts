// ──────────────────────────────────────────────
// apps/mobile/store/useSignalStore.ts
// ──────────────────────────────────────────────
import { create } from 'zustand';
import { SMCSignal } from '../services/api';

// type Filter = 'ALL' | 'BUY' | 'SELL' | 'HIGH';
type Filter = 'all' | 'BUY' | 'SELL' | 'high';

export interface SignalState {
  signals:      SMCSignal[];
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

  // Derived
  filtered:     () => SMCSignal[];
}

const MAX_SIGNALS = 50;

export const useSignalStore = create<SignalState>((set, get) => ({
  signals:      [],
  activeFilter: 'all',
  isConnected:  false,
  unreadCount:  0,

  addSignal: (signal) => {
    set((state) => {
      // Prepend new signal, avoid duplicates, cap at MAX_SIGNALS
      const exists = state.signals.some((s) => s.signal_id === signal.signal_id);
      if (exists) return state;
      const updated = [signal, ...state.signals].slice(0, MAX_SIGNALS);
      return { signals: updated, unreadCount: state.unreadCount + 1 };
    });
  },

  setSignals: (signals) => set({ signals }),

  setFilter: (activeFilter) => set({ activeFilter }),

  setConnected: (isConnected) => set({ isConnected }),

  markAllRead: () => set({ unreadCount: 0 }),

  clearOld: () => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours
    set((state) => ({
      signals: state.signals.filter((s) => s.timestamp > cutoff),
    }));
  },

  filtered: () => {
    const { signals, activeFilter } = get();
    switch (activeFilter) {
      case 'BUY':  return signals.filter((s) => s.type === 'BUY');
      case 'SELL': return signals.filter((s) => s.type === 'SELL');
      case 'high': return signals.filter((s) => s.confidence_score >= 80);
      default:     return signals;
    }
  },
}));



