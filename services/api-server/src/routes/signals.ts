// FILE: services/api-server/src/routes/signals.ts
// FIXES:
//  - /signals/analyze/:pair registered BEFORE /signals/:id (Fastify matches in order)
//  - buildSuggestedEntry always produces levels — falls back to nearest OB even above price
//  - HTF uses 4H + 1H candles, entry suggestion uses 15m candles for zones
//  - Tighter OB detection thresholds to find more valid zones

import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import { getSignals, getSignalById } from '../db/supabase';

const BINANCE_BASE = 'https://api.binance.com/api/v3';

interface BinanceKline {
  openTime: number; open: number; high: number; low: number;
  close: number; volume: number; closeTime: number;
}

async function fetchKlines(symbol: string, interval: string, limit = 200): Promise<BinanceKline[]> {
  const url = `${BINANCE_BASE}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Binance ${symbol}/${interval} ${res.status}: ${body.slice(0, 120)}`);
  }
  const raw = await res.json() as any[][];
  return raw.map(k => ({
    openTime: k[0], open: parseFloat(k[1]), high: parseFloat(k[2]),
    low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]),
    closeTime: k[6],
  }));
}

async function fetchPrice(symbol: string): Promise<number> {
  const res = await fetch(`${BINANCE_BASE}/ticker/price?symbol=${symbol}`);
  if (!res.ok) throw new Error(`Price fetch failed for ${symbol}: ${res.status}`);
  const d = await res.json() as { price: string };
  return parseFloat(d.price);
}

// ─── SMC helpers ──────────────────────────────────────────────

function determineTrend(candles: BinanceKline[]): 'bullish' | 'bearish' | 'neutral' {
  if (candles.length < 30) return 'neutral';
  const n      = candles.length;
  const recent = candles.slice(-10);
  const older  = candles.slice(-30, -10);

  const recentHigh = Math.max(...recent.map(c => c.high));
  const recentLow  = Math.min(...recent.map(c => c.low));
  const olderHigh  = Math.max(...older.map(c => c.high));
  const olderLow   = Math.min(...older.map(c => c.low));

  // Higher highs + higher lows = bullish
  if (recentHigh > olderHigh && recentLow > olderLow) return 'bullish';
  // Lower highs + lower lows = bearish
  if (recentHigh < olderHigh && recentLow < olderLow) return 'bearish';

  // Tie-break: last close vs midpoint of range
  const mid = (Math.max(...candles.map(c => c.high)) + Math.min(...candles.map(c => c.low))) / 2;
  return candles[n - 1].close > mid ? 'bullish' : 'bearish';
}

function findOrderBlocks(candles: BinanceKline[]) {
  const obs: Array<{ top: number; bottom: number; type: string; timeframe: string; index: number }> = [];

  for (let i = 1; i < candles.length - 1; i++) {
    const prev = candles[i - 1];
    const c    = candles[i];
    const next = candles[i + 1];

    const bodyC    = Math.abs(c.close - c.open);
    const bodyNext = Math.abs(next.close - next.open);

    // Bullish OB: bearish candle (c) followed by bullish displacement (next)
    if (
      c.close < c.open &&
      next.close > next.open &&
      bodyNext > bodyC * 1.2   // next body at least 1.2× the OB body
    ) {
      obs.push({
        top:       Math.max(c.open, c.close),
        bottom:    c.low,
        type:      'bullish_ob',
        timeframe: '1h',
        index:     i,
      });
    }

    // Bearish OB: bullish candle (c) followed by bearish displacement (next)
    if (
      c.close > c.open &&
      next.close < next.open &&
      bodyNext > bodyC * 1.2
    ) {
      obs.push({
        top:       c.high,
        bottom:    Math.min(c.open, c.close),
        type:      'bearish_ob',
        timeframe: '1h',
        index:     i,
      });
    }
  }

  // Keep the 8 most recent OBs
  return obs.slice(-8).map(({ index, ...rest }) => rest);
}

function findFVGs(candles: BinanceKline[]) {
  const fvgs: Array<{ top: number; bottom: number; type: string; fill_pct: number }> = [];
  for (let i = 1; i < candles.length - 1; i++) {
    const prev = candles[i - 1];
    const next = candles[i + 1];
    // Bullish FVG: gap between prev high and next low (price skipped upward)
    if (next.low > prev.high) {
      const gap = next.low - prev.high;
      if (gap / prev.high > 0.001) { // at least 0.1% gap
        fvgs.push({ bottom: prev.high, top: next.low, type: 'bullish_fvg', fill_pct: 0 });
      }
    }
    // Bearish FVG: gap between next high and prev low (price skipped downward)
    if (next.high < prev.low) {
      const gap = prev.low - next.high;
      if (gap / prev.low > 0.001) {
        fvgs.push({ bottom: next.high, top: prev.low, type: 'bearish_fvg', fill_pct: 0 });
      }
    }
  }
  return fvgs.slice(-6);
}

function findLiquidityZones(candles: BinanceKline[]) {
  const zones: Array<{ level: number; type: string; touch_count: number }> = [];
  const TOLERANCE = 0.003; // 0.3%
  const highs = candles.map(c => c.high);
  const lows  = candles.map(c => c.low);

  const addZone = (level: number, type: string) => {
    const touches = type === 'equal_highs'
      ? highs.filter(h => Math.abs(h - level) / level < TOLERANCE).length
      : lows.filter(l  => Math.abs(l - level) / level < TOLERANCE).length;
    if (touches >= 2) zones.push({ level, type, touch_count: touches });
  };

  // Sample every 5th candle to avoid O(n²) with 200 candles
  for (let i = 0; i < highs.length; i += 5) addZone(highs[i], 'equal_highs');
  for (let i = 0; i < lows.length;  i += 5) addZone(lows[i],  'equal_lows');

  const unique: typeof zones = [];
  for (const z of zones) {
    if (!unique.find(u => Math.abs(u.level - z.level) / z.level < TOLERANCE)) {
      unique.push(z);
    }
  }
  return unique.sort((a, b) => b.touch_count - a.touch_count).slice(0, 8);
}

function buildSuggestedEntry(
  price:    number,
  trend:    string,
  obs:      ReturnType<typeof findOrderBlocks>,
  fvgs:     ReturnType<typeof findFVGs>,
  liq:      ReturnType<typeof findLiquidityZones>,
  ltfObs:   ReturnType<typeof findOrderBlocks>,   // 15m OBs for tighter entry
) {
  const SL_BUFFER = 0.0012; // 0.12%
  const TP1_MULT  = 2.0;
  const TP2_MULT  = 3.5;
  const TP3_MULT  = 5.5;

  if (trend === 'neutral') return null;
  const isBull = trend === 'bullish';

  // Try 15m OBs first (tighter entry), fall back to HTF OBs
  const allObs = [...ltfObs, ...obs];

  const relevantOBs = allObs.filter(ob =>
    isBull ? ob.type === 'bullish_ob' : ob.type === 'bearish_ob'
  );

  if (relevantOBs.length === 0) return null;

  // Find nearest OB to current price (above or below)
  const nearestOB = relevantOBs.reduce((best, ob) => {
    const midOb   = (ob.top + ob.bottom) / 2;
    const midBest = (best.top + best.bottom) / 2;
    return Math.abs(midOb - price) < Math.abs(midBest - price) ? ob : best;
  });

  // Entry: top of bullish OB, bottom of bearish OB
  const entry   = isBull ? nearestOB.top    : nearestOB.bottom;
  const slLevel = isBull ? nearestOB.bottom : nearestOB.top;
  const sl      = isBull
    ? slLevel * (1 - SL_BUFFER)
    : slLevel * (1 + SL_BUFFER);

  const slDist = Math.abs(entry - sl);
  if (slDist < 1e-10) return null;

  const tp1 = isBull ? entry + slDist * TP1_MULT : entry - slDist * TP1_MULT;
  const tp2 = isBull ? entry + slDist * TP2_MULT : entry - slDist * TP2_MULT;

  // TP3: nearest opposing liquidity zone beyond TP2, else default multiplier
  const oppLiq = liq.filter(z =>
    isBull ? z.type === 'equal_highs' && z.level > tp2
           : z.type === 'equal_lows'  && z.level < tp2
  );
  const tp3 = oppLiq.length > 0
    ? (isBull ? Math.min(...oppLiq.map(z => z.level)) : Math.max(...oppLiq.map(z => z.level)))
    : (isBull ? entry + slDist * TP3_MULT : entry - slDist * TP3_MULT);

  const fmt = (n: number) => parseFloat(n.toPrecision(8));

  return {
    entry: fmt(entry),
    sl:    fmt(sl),
    tp1:   fmt(tp1),
    tp2:   fmt(tp2),
    tp3:   fmt(tp3),
    rr1:   parseFloat((Math.abs(tp1 - entry) / slDist).toFixed(2)),
    rr2:   parseFloat((Math.abs(tp2 - entry) / slDist).toFixed(2)),
    rr3:   parseFloat((Math.abs(tp3 - entry) / slDist).toFixed(2)),
  };
}

// ─────────────────────────────────────────────────────────────
// Routes
// CRITICAL: /signals/analyze/:pair MUST be registered before /signals/:id
// because Fastify matches routes in registration order and :id would swallow "analyze"
// ─────────────────────────────────────────────────────────────

export async function signalRoutes(fastify: FastifyInstance): Promise<void> {

  // ── GET /signals/analyze/:pair  (must be first!) ──────────
  fastify.get<{ Params: { pair: string } }>(
    '/signals/analyze/:pair',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const raw  = request.params.pair.trim().toUpperCase();
      const pair = raw.endsWith('USDT') ? raw : `${raw}USDT`;

      try {
        // HTF: 4H + 1H for bias and major zones
        // LTF: 15m for refined entry zone
        const [htf4h, htf1h, ltf15m, price] = await Promise.all([
          fetchKlines(pair, '4h', 200),
          fetchKlines(pair, '1h', 200),
          fetchKlines(pair, '15m', 100),
          fetchPrice(pair),
        ]);

        // Bias: 4H is primary, 1H confirms
        const trend4h = determineTrend(htf4h);
        const trend1h = determineTrend(htf1h);
        const htfBias = trend4h !== 'neutral' ? trend4h
                      : trend1h !== 'neutral' ? trend1h
                      : 'neutral';

        // Zones from HTF (structural) + LTF (entry precision)
        const htfObs  = findOrderBlocks(htf1h);
        const ltfObs  = findOrderBlocks(ltf15m);
        const fvgs    = findFVGs(ltf15m);          // FVGs from 15m for entry
        const liq     = findLiquidityZones(htf1h); // Liquidity from 1H structure

        const entryData = buildSuggestedEntry(price, htfBias, htfObs, fvgs, liq, ltfObs);

        let conf = 35;
        if (htfBias !== 'neutral')          conf += 20;
        if (trend4h === trend1h)            conf += 10; // both TFs agree
        if (htfObs.length >= 2)             conf += 10;
        if (fvgs.length >= 1)               conf += 10;
        if (liq.length >= 2)               conf += 5;
        if (entryData && entryData.rr2 >= 3) conf += 10;
        conf = Math.min(conf, 92);

        const biasLabel = htfBias === 'bullish' ? 'BULLISH'
                        : htfBias === 'bearish' ? 'BEARISH'
                        : 'NEUTRAL';

        const dir    = htfBias === 'bullish' ? 'LONG' : 'SHORT';
        const priceAboveEntry = entryData ? price > entryData.entry : false;
        const entryNote = entryData
          ? (htfBias === 'bullish' && priceAboveEntry
              ? 'Price is above entry zone — wait for pullback to the OB.'
              : htfBias === 'bearish' && !priceAboveEntry
              ? 'Price is below entry zone — wait for relief rally to the OB.'
              : 'Price is near the entry zone. Set a limit order at entry.')
          : 'No clean OB entry zone found. Wait for a structural OB to form.';

        const summary = entryData
          ? `${pair} is in a ${biasLabel} structure (4H confirms ${trend4h.toUpperCase()}, 1H shows ${trend1h.toUpperCase()}). ` +
            `Suggested ${dir} entry at ${entryData.entry} via 15m OB, SL at ${entryData.sl}. ` +
            `TP1: ${entryData.tp1} (1:${entryData.rr1}) | TP2: ${entryData.tp2} (1:${entryData.rr2}) | TP3: ${entryData.tp3} (1:${entryData.rr3}). ` +
            entryNote
          : `${pair} is ${biasLabel} on 4H but no valid OB entry zone found near current price of ${price}. Watch for a pullback into HTF order blocks.`;

        return reply.send({
          analysis: {
            pair,
            htf_bias:        biasLabel,
            htf_timeframe:   '4H / 1H',
            ltf_trend:       trend1h.toUpperCase(),
            active_obs:      htfObs,
            active_fvgs:     fvgs,
            liq_zones:       liq,
            suggested_entry: entryData?.entry ?? null,
            suggested_sl:    entryData?.sl    ?? null,
            suggested_tp1:   entryData?.tp1   ?? null,
            suggested_tp2:   entryData?.tp2   ?? null,
            suggested_tp3:   entryData?.tp3   ?? null,
            rr_1:            entryData?.rr1   ?? null,
            rr_2:            entryData?.rr2   ?? null,
            rr_3:            entryData?.rr3   ?? null,
            confidence:      conf,
            summary,
            last_price:      price,
            timestamp:       Date.now(),
          },
        });
      } catch (err: any) {
        fastify.log.error(`[analyze] ${pair}: ${err.message}`);
        const is404 = err.message?.includes('400') || err.message?.includes('-1121') || err.message?.includes('Invalid symbol');
        return reply.code(is404 ? 404 : 500).send({
          error: is404
            ? `"${pair}" not found on Binance. Check the symbol (e.g. BTCUSDT, ETHUSDT).`
            : `Analysis failed: ${err.message}`,
        });
      }
    }
  );

  // ── GET /signals ──────────────────────────────
  fastify.get<{
    Querystring: { limit?: string; offset?: string; pair?: string; type?: 'BUY' | 'SELL' };
  }>('/signals', {
    preHandler: [authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit:  { type: 'string' },
          offset: { type: 'string' },
          pair:   { type: 'string' },
          type:   { type: 'string', enum: ['BUY', 'SELL'] },
        },
      },
    },
  }, async (request, reply) => {
    const { limit = '50', offset = '0', pair, type } = request.query;
    const limitNum  = Math.min(parseInt(limit,  10) || 50, 200);
    const offsetNum =          parseInt(offset, 10) || 0;
    const signals   = await getSignals(limitNum, offsetNum, pair, type);
    return reply.send({ signals, count: signals.length });
  });

  // ── GET /signals/:id  (must be AFTER /signals/analyze/:pair) ──
  fastify.get<{ Params: { id: string } }>(
    '/signals/:id',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const signal = await getSignalById(request.params.id);
      if (!signal) return reply.code(404).send({ error: 'Signal not found' });
      return reply.send({ signal });
    }
  );
}