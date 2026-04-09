// LOCATION: apps/mobile/hooks/usePriceMonitor.ts
// FIXES:
//  3. Notifications only fired for signals that arrived AFTER app launch (addedAt > bootTime)
//  4. resolvedSignals set is seeded from store on mount so old hits never re-fire
//  NEW: Non-Binance symbols (e.g. XAUUSD) filtered out BEFORE fetchPrices is called,
//       eliminating the repeated warn spam and wasted network calls

import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useWatchlistStore } from '../store/useWatchlistStore';
import { useSignalStore } from '../store/useSignalStore';

const PRICE_POLL_INTERVAL_MS = 30_000;
const BINANCE_TICKER_URL     = 'https://api.binance.com/api/v3/ticker/price';

// Module-level: survives React re-renders and hot-reload
const resolvedSignals   = new Set<string>();
const processingSignals = new Set<string>();

// FIX #3: record when the price monitor first mounted.
// Only fire notifications for signals added AFTER this time.
let bootTime = 0;

const BINANCE_QUOTE_CURRENCIES = ['USDT', 'BUSD', 'BTC', 'ETH', 'BNB', 'USDC'];

function isBinanceSymbol(symbol: string): boolean {
  const upper = symbol.toUpperCase();
  return BINANCE_QUOTE_CURRENCIES.some((q) => upper.endsWith(q));
}

async function fetchPrices(symbols: string[]): Promise<Record<string, number>> {
  if (symbols.length === 0) return {};
  const upper   = Array.from(new Set(symbols.map((s) => s.toUpperCase())));
  // FIX: filter before the warn log so we only warn once per unique invalid symbol
  // rather than spamming every 30s poll cycle
  const valid   = upper.filter(isBinanceSymbol);
  if (valid.length === 0) return {};

  try {
    const param = encodeURIComponent(JSON.stringify(valid));
    const res   = await fetch(`${BINANCE_TICKER_URL}?symbols=${param}`);
    if (res.ok) {
      const data = (await res.json()) as { symbol: string; price: string }[];
      const map: Record<string, number> = {};
      for (const { symbol, price } of data) map[symbol] = parseFloat(price);
      return map;
    }
  } catch { /* fall through to individual */ }

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
  const isRunningRef = useRef(false);

  // FIX: log non-Binance symbols once on mount rather than every poll cycle
  useEffect(() => {
    const allSignals = useSignalStore.getState().signals;
    const allPairs   = allSignals.map((s) => s.signal.pair.toUpperCase());
    const invalid    = allPairs.filter((p) => !isBinanceSymbol(p));
    if (invalid.length > 0) {
      console.warn('[PriceMonitor] Non-Binance symbols in store (will be skipped):', [...new Set(invalid)].join(', '));
    }
  }, []);

  useEffect(() => {
    // FIX #3: stamp boot time once on mount
    if (bootTime === 0) bootTime = Date.now();

    // FIX #4: seed resolvedSignals from store so already-resolved signals
    // don't fire notifications again after app restart / hot-reload
    const allSignals = useSignalStore.getState().signals;
    for (const s of allSignals) {
      if (s.status !== 'ACTIVE') {
        resolvedSignals.add(s.signal.signal_id);
      }
    }

    const check = async () => {
      const watchlist     = useWatchlistStore.getState().watchlist;
      const signalEntries = useSignalStore.getState().signals.filter((s) => s.status === 'ACTIVE');

      const watchedPairs = watchlist.map((w) => w.signal.pair);
      const signalPairs  = signalEntries.map((s) => s.signal.pair);
      const allPairs     = Array.from(new Set([...watchedPairs, ...signalPairs]));

      // FIX: filter out non-Binance symbols here, before fetchPrices,
      // so isBinanceSymbol is the single gate and no warnings fire in the loop
      const binancePairs = allPairs.filter(isBinanceSymbol);

      if (binancePairs.length === 0) return;

      const prices = await fetchPrices(binancePairs);
      if (Object.keys(prices).length === 0) return;

      // ── 1. Check watchlist entries ─────────────────────────────────────
      for (const entry of watchlist) {
        const { signal } = entry;
        if (!isBinanceSymbol(signal.pair))             continue; // skip non-Binance silently
        if (resolvedSignals.has(signal.signal_id))     continue;
        if (processingSignals.has(signal.signal_id))   continue;

        const price = prices[signal.pair.toUpperCase()];
        if (price == null) continue;

        const isBuy = signal.type === 'BUY';
        const hitTP = isBuy ? price >= signal.take_profit : price <= signal.take_profit;
        const hitSL = isBuy ? price <= signal.stop_loss   : price >= signal.stop_loss;

        if (hitTP || hitSL) {
          processingSignals.add(signal.signal_id);
          const outcome: 'WIN' | 'LOSS' = hitTP ? 'WIN' : 'LOSS';
          const label   = hitTP ? 'Take Profit' : 'Stop Loss';
          const emoji   = hitTP ? '🎯' : '🛑';
          const pair    = signal.pair.replace('USDT', '') + '/USDT';

          console.log(`[PriceMonitor] Watchlist ${label} hit: ${signal.pair} @ ${price}`);

          try {
            await useWatchlistStore.getState().autoResolveTrade(signal.signal_id, outcome);
            useSignalStore.getState().markSignalResolved(signal.signal_id, hitTP ? 'TP_HIT' : 'SL_HIT');

            // FIX #4: only notify if the watchlist entry was added after boot
            // (i.e. the user actively added it this session, not a leftover)
            const watchEntry = useWatchlistStore.getState().watchlist.find(
              (w) => w.signal.signal_id === signal.signal_id
            );
            const addedAt = (watchEntry as any)?.addedAt ?? 0;
            if (addedAt >= bootTime || addedAt === 0) {
              await sendLocalNotification(
                `${emoji} ${label} Hit — ${pair}`,
                `${signal.type} trade ${outcome === 'WIN' ? 'won' : 'lost'} · Entry ${signal.entry} → ${hitTP ? signal.take_profit : signal.stop_loss}`,
                { screen: 'history', signalId: signal.signal_id }
              );
            }
          } finally {
            processingSignals.delete(signal.signal_id);
            resolvedSignals.add(signal.signal_id);
          }
        }
      }

      // ── 2. Check live signals ──────────────────────────────────────────
      for (const entry of signalEntries) {
        const { signal } = entry;
        if (!isBinanceSymbol(signal.pair))                             continue; // skip non-Binance silently
        if (resolvedSignals.has(signal.signal_id))                     continue;
        if (processingSignals.has(signal.signal_id))                   continue;
        if (useWatchlistStore.getState().isWatched(signal.signal_id))  continue;

        const price = prices[signal.pair.toUpperCase()];
        if (price == null) continue;

        const isBuy = signal.type === 'BUY';
        const hitTP = isBuy ? price >= signal.take_profit : price <= signal.take_profit;
        const hitSL = isBuy ? price <= signal.stop_loss   : price >= signal.stop_loss;

        if (hitTP || hitSL) {
          processingSignals.add(signal.signal_id);
          const label = hitTP ? 'Take Profit' : 'Stop Loss';
          const emoji = hitTP ? '🎯' : '🛑';
          const pair  = signal.pair.replace('USDT', '') + '/USDT';

          console.log(`[PriceMonitor] Signal ${label} hit: ${signal.pair} @ ${price}`);

          try {
            useSignalStore.getState().markSignalResolved(signal.signal_id, hitTP ? 'TP_HIT' : 'SL_HIT');

            // FIX #4: only notify for signals that arrived after boot
            if (entry.addedAt >= bootTime) {
              await sendLocalNotification(
                `${emoji} Signal ${label} Hit — ${pair}`,
                `${signal.type} signal closed · Entry ${signal.entry} · ${label} @ ${hitTP ? signal.take_profit : signal.stop_loss}`,
                { screen: 'signals' }
              );
            }
          } finally {
            processingSignals.delete(signal.signal_id);
            resolvedSignals.add(signal.signal_id);
          }
        }
      }
    };

    const safeCheck = async () => {
      if (isRunningRef.current) return;
      isRunningRef.current = true;
      try { await check(); } finally { isRunningRef.current = false; }
    };

    safeCheck();
    intervalRef.current = setInterval(safeCheck, PRICE_POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);
}