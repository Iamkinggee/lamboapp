// apps/mobile/store/useWatchlistStore.ts
// Persists watchlist + completed trades locally via AsyncStorage

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SMCSignal } from '../services/api';

export interface WatchlistEntry {
  id:         string;   // signal_id
  signal:     SMCSignal;
  addedAt:    number;
  notes?:     string;
}

export interface CompletedTrade {
  id:         string;
  signal:     SMCSignal;
  outcome:    'WIN' | 'LOSS' | 'BREAKEVEN';
  closedAt:   number;
  notes?:     string;
}

interface WatchlistState {
  watchlist:      WatchlistEntry[];
  completedTrades: CompletedTrade[];

  // Watchlist actions
  addToWatchlist:      (signal: SMCSignal, notes?: string) => Promise<void>;
  removeFromWatchlist: (id: string) => Promise<void>;
  isWatched:           (id: string) => boolean;

  // Trade actions
  completeTrade: (id: string, outcome: CompletedTrade['outcome'], notes?: string) => Promise<void>;
  deleteCompletedTrade: (id: string) => Promise<void>;

  // Persistence
  hydrate: () => Promise<void>;
}

const WATCHLIST_KEY = 'smc_watchlist';
const TRADES_KEY    = 'smc_completed_trades';

export const useWatchlistStore = create<WatchlistState>((set, get) => ({
  watchlist:       [],
  completedTrades: [],

  addToWatchlist: async (signal, notes) => {
    const entry: WatchlistEntry = {
      id:      signal.signal_id,
      signal,
      addedAt: Date.now(),
      notes,
    };
    set((s) => {
      // Prevent duplicates
      if (s.watchlist.some((w) => w.id === signal.signal_id)) return s;
      return { watchlist: [entry, ...s.watchlist] };
    });
    await AsyncStorage.setItem(WATCHLIST_KEY, JSON.stringify(get().watchlist));
  },

  removeFromWatchlist: async (id) => {
    set((s) => ({ watchlist: s.watchlist.filter((w) => w.id !== id) }));
    await AsyncStorage.setItem(WATCHLIST_KEY, JSON.stringify(get().watchlist));
  },

  isWatched: (id) => get().watchlist.some((w) => w.id === id),

  completeTrade: async (id, outcome, notes) => {
    const entry = get().watchlist.find((w) => w.id === id);
    if (!entry) return;

    const completed: CompletedTrade = {
      id,
      signal:   entry.signal,
      outcome,
      closedAt: Date.now(),
      notes:    notes ?? entry.notes,
    };

    set((s) => ({
      watchlist:       s.watchlist.filter((w) => w.id !== id),
      completedTrades: [completed, ...s.completedTrades],
    }));

    await AsyncStorage.setItem(WATCHLIST_KEY, JSON.stringify(get().watchlist));
    await AsyncStorage.setItem(TRADES_KEY,    JSON.stringify(get().completedTrades));
  },

  deleteCompletedTrade: async (id) => {
    set((s) => ({ completedTrades: s.completedTrades.filter((t) => t.id !== id) }));
    await AsyncStorage.setItem(TRADES_KEY, JSON.stringify(get().completedTrades));
  },

  hydrate: async () => {
    try {
      const [wlRaw, trRaw] = await Promise.all([
        AsyncStorage.getItem(WATCHLIST_KEY),
        AsyncStorage.getItem(TRADES_KEY),
      ]);
      set({
        watchlist:       wlRaw ? JSON.parse(wlRaw) : [],
        completedTrades: trRaw ? JSON.parse(trRaw) : [],
      });
    } catch {
      // ignore storage errors
    }
  },
}));