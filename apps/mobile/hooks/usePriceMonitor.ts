// LOCATION: apps/mobile/hooks/usePriceMonitor.ts
//
// Polls Binance every 30s to check live prices against SL/TP.
// Only monitors Binance-listed crypto pairs (USDT, BTC, ETH, BNB quote pairs).
// Tracks resolved signals in a local Set to prevent duplicate notifications.

import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useWatchlistStore } from '../store/useWatchlistStore';
import { useSignalStore } from '../store/useSignalStore';

const PRICE_POLL_INTERVAL_MS = 30_000;
const BINANCE_TICKER_URL     = 'https://api.binance.com/api/v3/ticker/price';

// Only these quote currencies are supported on Binance spot
const BINANCE_QUOTE_CURRENCIES = ['USDT', 'BUSD', 'BTC', 'ETH', 'BNB', 'USDC'];

function isBinanceSymbol(symbol: string): boolean {
  const upper = symbol.toUpperCase();
  return BINANCE_QUOTE_CURRENCIES.some((q) => upper.endsWith(q));
}

async function fetchPrices(symbols: string[]): Promise<Record<string, number>> {
  if (symbols.length === 0) return {};

  const upper   = Array.from(new Set(symbols.map((s) => s.toUpperCase())));
  const valid   = upper.filter(isBinanceSymbol);
  const invalid = upper.filter((s) => !isBinanceSymbol(s));

  if (invalid.length > 0) {
    console.warn('[PriceMonitor] Skipping non-Binance symbols:', invalid.join(', '));
  }
  if (valid.length === 0) return {};

  // Try batch first
  try {
    const param = encodeURIComponent(JSON.stringify(valid));
    const res   = await fetch(`${BINANCE_TICKER_URL}?symbols=${param}`);
    if (res.ok) {
      const data = (await res.json()) as { symbol: string; price: string }[];
      const map: Record<string, number> = {};
      for (const { symbol, price } of data) map[symbol] = parseFloat(price);
      return map;
    }
  } catch {
    // fall through to individual
  }

  // Fallback: individual requests
  const map: Record<string, number> = {};
  await Promise.all(
    valid.map(async (symbol) => {
      try {
        const res = await fetch(`${BINANCE_TICKER_URL}?symbol=${symbol}`);
        if (!res.ok) return;
        const data = (await res.json()) as { symbol: string; price: string };
        map[data.symbol] = parseFloat(data.price);
      } catch { /* skip */ }
    })
  );
  return map;
}

async function sendLocalNotification(title: string, body: string, data?: object) {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: 'default', data: data ?? {} },
      trigger: null,
    });
  } catch { /* ignore */ }
}

export function usePriceMonitor() {
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  // Track signal IDs we've already resolved this session to prevent re-firing
  const resolvedRef  = useRef<Set<string>>(new Set());

  useEffect(() => {
    const check = async () => {
      const watchlist     = useWatchlistStore.getState().watchlist;
      const signalEntries = useSignalStore.getState().signals.filter((s) => s.status === 'ACTIVE');

      const watchedPairs = watchlist.map((w) => w.signal.pair);
      const signalPairs  = signalEntries.map((s) => s.signal.pair);
      const allPairs     = Array.from(new Set([...watchedPairs, ...signalPairs]));

      if (allPairs.length === 0) return;

      const prices = await fetchPrices(allPairs);
      if (Object.keys(prices).length === 0) return;

      // ── 1. Check watchlist entries ─────────────────────────────────────
      for (const entry of watchlist) {
        const { signal } = entry;
        if (resolvedRef.current.has(signal.signal_id)) continue;

        const price = prices[signal.pair.toUpperCase()];
        if (price == null) continue;

        const isBuy = signal.type === 'BUY';
        const hitTP = isBuy ? price >= signal.take_profit : price <= signal.take_profit;
        const hitSL = isBuy ? price <= signal.stop_loss   : price >= signal.stop_loss;

        if (hitTP || hitSL) {
          // Mark resolved immediately to prevent re-entry on next tick
          resolvedRef.current.add(signal.signal_id);

          const outcome: 'WIN' | 'LOSS' = hitTP ? 'WIN' : 'LOSS';
          const label   = hitTP ? 'Take Profit' : 'Stop Loss';
          const emoji   = hitTP ? '🎯' : '🛑';
          const pair    = signal.pair.replace('USDT', '') + '/USDT';

          console.log(`[PriceMonitor] Watchlist ${label} hit: ${signal.pair} @ ${price}`);

          await useWatchlistStore.getState().autoResolveTrade(signal.signal_id, outcome);
          useSignalStore.getState().markSignalResolved(signal.signal_id, hitTP ? 'TP_HIT' : 'SL_HIT');

          await sendLocalNotification(
            `${emoji} ${label} Hit — ${pair}`,
            `${signal.type} trade ${outcome === 'WIN' ? 'won' : 'lost'} · Entry ${signal.entry} → ${hitTP ? signal.take_profit : signal.stop_loss}`,
            { screen: 'history', signalId: signal.signal_id }
          );
        }
      }

      // ── 2. Check live signals ──────────────────────────────────────────
      for (const entry of signalEntries) {
        const { signal } = entry;
        if (resolvedRef.current.has(signal.signal_id)) continue;
        if (useWatchlistStore.getState().isWatched(signal.signal_id)) continue;

        const price = prices[signal.pair.toUpperCase()];
        if (price == null) continue;

        const isBuy = signal.type === 'BUY';
        const hitTP = isBuy ? price >= signal.take_profit : price <= signal.take_profit;
        const hitSL = isBuy ? price <= signal.stop_loss   : price >= signal.stop_loss;

        if (hitTP || hitSL) {
          // Mark resolved immediately
          resolvedRef.current.add(signal.signal_id);

          const label = hitTP ? 'Take Profit' : 'Stop Loss';
          const emoji = hitTP ? '🎯' : '🛑';
          const pair  = signal.pair.replace('USDT', '') + '/USDT';

          console.log(`[PriceMonitor] Signal ${label} hit: ${signal.pair} @ ${price}`);

          useSignalStore.getState().markSignalResolved(signal.signal_id, hitTP ? 'TP_HIT' : 'SL_HIT');

          await sendLocalNotification(
            `${emoji} Signal ${label} Hit — ${pair}`,
            `${signal.type} signal closed · Entry ${signal.entry} · ${label} @ ${hitTP ? signal.take_profit : signal.stop_loss}`,
            { screen: 'signals' }
          );
        }
      }
    };

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