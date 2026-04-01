// apps/mobile/hooks/usePriceMonitor.ts
//
// Polls Binance public API every 30s to check live prices against
// SL/TP levels of active watchlist entries and live signals.
//
// When a level is hit:
//  - Signals page: the signal is marked resolved and disappears
//  - Watchlist: the entry auto-moves to History with WIN/LOSS
//  - A local notification is fired for the user

import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useWatchlistStore } from '../store/useWatchlistStore';
import { useSignalStore } from '../store/useSignalStore';

const PRICE_POLL_INTERVAL_MS = 30_000; // 30 seconds
const BINANCE_TICKER_URL = 'https://api.binance.com/api/v3/ticker/price';

// Fetch current prices for a list of symbols from Binance
async function fetchPrices(symbols: string[]): Promise<Record<string, number>> {
  if (symbols.length === 0) return {};
  try {
    const symbolsParam = JSON.stringify(symbols.map((s) => s.toUpperCase()));
    const res = await fetch(`${BINANCE_TICKER_URL}?symbols=${encodeURIComponent(symbolsParam)}`);
    if (!res.ok) throw new Error(`Binance API ${res.status}`);
    const data = (await res.json()) as { symbol: string; price: string }[];
    const map: Record<string, number> = {};
    for (const { symbol, price } of data) {
      map[symbol] = parseFloat(price);
    }
    return map;
  } catch (err) {
    console.warn('[PriceMonitor] fetch error:', err);
    return {};
  }
}

async function sendLocalNotification(title: string, body: string, data?: object) {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: 'default', data: data ?? {} },
      trigger: null,
    });
  } catch {
    // ignore notification errors — not critical
  }
}

export function usePriceMonitor() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const check = async () => {
      const watchlist       = useWatchlistStore.getState().watchlist;
      const signalEntries   = useSignalStore.getState().signals.filter((s) => s.status === 'ACTIVE');

      // Collect all unique pairs to price-check
      const watchedPairs  = watchlist.map((w) => w.signal.pair);
      const signalPairs   = signalEntries.map((s) => s.signal.pair);
      const allPairs      = Array.from(new Set([...watchedPairs, ...signalPairs]));

      if (allPairs.length === 0) return;

      const prices = await fetchPrices(allPairs);
      if (Object.keys(prices).length === 0) return;

      // ── 1. Check watchlist entries ──────────────────────────────────────
      for (const entry of watchlist) {
        const { signal } = entry;
        const price = prices[signal.pair.toUpperCase()];
        if (price == null) continue;

        const isBuy = signal.type === 'BUY';
        let hitTP = false;
        let hitSL = false;

        if (isBuy) {
          hitTP = price >= signal.take_profit;
          hitSL = price <= signal.stop_loss;
        } else {
          // SELL/SHORT: TP is below entry, SL is above entry
          hitTP = price <= signal.take_profit;
          hitSL = price >= signal.stop_loss;
        }

        if (hitTP || hitSL) {
          const outcome: 'WIN' | 'LOSS' = hitTP ? 'WIN' : 'LOSS';
          const label   = hitTP ? 'Take Profit' : 'Stop Loss';
          const emoji   = hitTP ? '🎯' : '🛑';
          const pair    = signal.pair.replace('USDT', '') + '/USDT';

          console.log(`[PriceMonitor] Watchlist ${label} hit: ${signal.pair} @ ${price}`);

          // Auto-move to History
          await useWatchlistStore.getState().autoResolveTrade(signal.signal_id, outcome);

          // Also remove from active signals page if it's there
          useSignalStore.getState().markSignalResolved(
            signal.signal_id,
            hitTP ? 'TP_HIT' : 'SL_HIT'
          );

          // Fire notification
          await sendLocalNotification(
            `${emoji} ${label} Hit — ${pair}`,
            `${signal.type} trade ${outcome === 'WIN' ? 'won' : 'lost'} · Entry ${signal.entry} → ${hitTP ? signal.take_profit : signal.stop_loss}`,
            { screen: 'history', signalId: signal.signal_id }
          );
        }
      }

      // ── 2. Check live signals for SL/TP hit (removes from signals page) ──
      for (const entry of signalEntries) {
        const { signal } = entry;
        // Skip if already in watchlist (handled above)
        if (useWatchlistStore.getState().isWatched(signal.signal_id)) continue;

        const price = prices[signal.pair.toUpperCase()];
        if (price == null) continue;

        const isBuy = signal.type === 'BUY';
        let hitTP = false;
        let hitSL = false;

        if (isBuy) {
          hitTP = price >= signal.take_profit;
          hitSL = price <= signal.stop_loss;
        } else {
          hitTP = price <= signal.take_profit;
          hitSL = price >= signal.stop_loss;
        }

        if (hitTP || hitSL) {
          const label = hitTP ? 'Take Profit' : 'Stop Loss';
          const emoji = hitTP ? '🎯' : '🛑';
          const pair  = signal.pair.replace('USDT', '') + '/USDT';

          console.log(`[PriceMonitor] Signal ${label} hit: ${signal.pair} @ ${price}`);

          // Remove from live signals page
          useSignalStore.getState().markSignalResolved(
            signal.signal_id,
            hitTP ? 'TP_HIT' : 'SL_HIT'
          );

          // Notify user even for non-watchlisted signals
          await sendLocalNotification(
            `${emoji} Signal ${label} Hit — ${pair}`,
            `${signal.type} signal closed · Entry ${signal.entry} · ${label} @ ${hitTP ? signal.take_profit : signal.stop_loss}`,
            { screen: 'signals' }
          );
        }
      }
    };

    // Run immediately, then on interval
    check();
    intervalRef.current = setInterval(check, PRICE_POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);
}