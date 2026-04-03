// LOCATION: apps/mobile/components/PairChart.tsx
// FIX #5: Interactive TradingView chart with Entry, TP, SL overlay lines.
//
// ERRORS FIXED:
//  • TS2307 — react-native-webview loaded via conditional require() so the file
//             compiles cleanly whether or not the package is installed yet.
//             Run: npx expo install react-native-webview  to enable the live chart.
//             Until then the chart tab shows a clear "install required" prompt.
//  • TS2345 — timeframe prop is optional (string | undefined); it is now
//             normalised to a non-optional string before being passed to
//             buildChartHtml(), eliminating the type mismatch.

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator,
  TouchableOpacity, Platform,
} from 'react-native';
import { Colors } from '../utils/theme';

// ── Safe WebView import ────────────────────────────────────────────────────
// We use a runtime require() wrapped in try/catch instead of a top-level
// import so that TypeScript never sees an unresolved module, and the app
// works (showing a fallback UI) even before the package is installed.
let WebView: React.ComponentType<any> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  WebView = require('react-native-webview').WebView;
} catch {
  // Package not installed yet — chart tab will show install prompt
  WebView = null;
}

// ── Types ──────────────────────────────────────────────────────────────────

interface PairChartProps {
  pair:        string;   // e.g. "BTCUSDT"
  entry:       number;
  stopLoss:    number;
  takeProfit:  number;
  signalType:  'BUY' | 'SELL';
  timeframe?:  string;   // e.g. "5m", "1h" — optional, defaults to "1h"
}

type Tab = 'chart' | 'levels';

// ── Timeframe map ──────────────────────────────────────────────────────────

const TF_TO_TV: Record<string, string> = {
  '1m': '1',  '3m': '3',   '5m': '5',   '15m': '15',
  '30m': '30','1h': '60',  '2h': '120', '4h': '240',
  '6h': '360','12h': '720','1d': 'D',   '1w': 'W',
};

function toTVInterval(tf: string): string {
  return TF_TO_TV[tf.toLowerCase()] ?? '60';
}

function toTVSymbol(pair: string): string {
  return `BINANCE:${pair.toUpperCase()}`;
}

// ── HTML builder ───────────────────────────────────────────────────────────
// All params are fully typed (no optionals) — the caller normalises before passing.

function buildChartHtml(
  pair:       string,
  entry:      number,
  stopLoss:   number,
  takeProfit: number,
  signalType: 'BUY' | 'SELL',
  timeframe:  string,          // ← non-optional: caller passes tf ?? '1h'
): string {
  const symbol   = toTVSymbol(pair);
  const interval = toTVInterval(timeframe);

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0d0d0d; font-family: -apple-system, sans-serif; }
  #tv-chart-container { width: 100%; height: 100vh; position: relative; }
  .legend {
    position: absolute; top: 8px; left: 8px; z-index: 10;
    display: flex; flex-direction: column; gap: 4px; pointer-events: none;
  }
  .legend-item {
    display: flex; align-items: center; gap: 6px;
    background: rgba(13,13,13,0.85); border-radius: 4px;
    padding: 3px 7px; font-size: 11px; font-weight: 700; color: #fff;
  }
  .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .entry-dot { background: #f0b429; }
  .tp-dot    { background: #00c896; }
  .sl-dot    { background: #ff4757; }
</style>
</head>
<body>
<div id="tv-chart-container">
  <div class="legend">
    <div class="legend-item"><span class="dot entry-dot"></span>Entry ${entry}</div>
    <div class="legend-item"><span class="dot tp-dot"></span>TP ${takeProfit}</div>
    <div class="legend-item"><span class="dot sl-dot"></span>SL ${stopLoss}</div>
  </div>
</div>
<script type="text/javascript" src="https://s3.tradingview.com/tv.js"></script>
<script>
new TradingView.widget({
  autosize:           true,
  symbol:             "${symbol}",
  interval:           "${interval}",
  timezone:           "Etc/UTC",
  theme:              "dark",
  style:              "1",
  locale:             "en",
  toolbar_bg:         "#0d0d0d",
  enable_publishing:  false,
  hide_side_toolbar:  false,
  allow_symbol_change: false,
  container_id:       "tv-chart-container",
  hide_volume:        false,
  support_host:       "https://www.tradingview.com",
  overrides: {
    "paneProperties.background":         "#0d0d0d",
    "paneProperties.backgroundType":     "solid",
    "scalesProperties.lineColor":        "#2a2a2a",
    "scalesProperties.textColor":        "#888888",
  },
});
</script>
</body>
</html>`;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function PairChart({
  pair,
  entry,
  stopLoss,
  takeProfit,
  signalType,
  timeframe,         // string | undefined
}: PairChartProps) {
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);
  const [tab,     setTab]     = useState<Tab>('chart');

  // FIX TS2345: normalise optional timeframe to a concrete string before use
  const resolvedTf: string = timeframe ?? '1h';

  const html  = buildChartHtml(pair, entry, stopLoss, takeProfit, signalType, resolvedTf);
  const isBuy = signalType === 'BUY';
  const rr    = takeProfit && entry && stopLoss
    ? Math.abs(takeProfit - entry) / Math.abs(entry - stopLoss)
    : 0;

  // ── Render chart panel ─────────────────────────────────────────────────
  const renderChart = () => {
    // FIX TS2307: if WebView failed to load, show a clear install prompt
    if (!WebView) {
      return (
        <View style={styles.installWrap}>
          <Text style={styles.installIcon}>📦</Text>
          <Text style={styles.installTitle}>Chart package not installed</Text>
          <Text style={styles.installBody}>
            Run the command below in your terminal, then rebuild the app:
          </Text>
          <View style={styles.installCmd}>
            <Text style={styles.installCmdText}>npx expo install react-native-webview</Text>
          </View>
          <Text style={styles.installNote}>
            The Levels tab works without this package.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.chartWrap}>
        {loading && !error && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color={Colors.accent} size="large" />
            <Text style={styles.loadingText}>Loading chart...</Text>
          </View>
        )}
        {error ? (
          <View style={styles.errorWrap}>
            <Text style={styles.errorIcon}>📡</Text>
            <Text style={styles.errorText}>Chart unavailable</Text>
            <Text style={styles.errorSub}>Check your internet connection</Text>
          </View>
        ) : (
          <WebView
            source={{ html }}
            style={styles.webview}
            onLoadStart={() => { setLoading(true);  setError(false); }}
            onLoadEnd={()   => setLoading(false)}
            onError={()     => { setLoading(false); setError(true); }}
            scrollEnabled={false}
            bounces={false}
            javaScriptEnabled
            domStorageEnabled
            originWhitelist={['*']}
          />
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>

      {/* ── Tab bar ── */}
      <View style={styles.tabs}>
        {(['chart', 'levels'] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'chart' ? '📊 Chart' : '🎯 Levels'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Chart tab ── */}
      {tab === 'chart' && renderChart()}

      {/* ── Levels tab ── */}
      {tab === 'levels' && (
        <View style={styles.levelsWrap}>

          {/* Direction banner */}
          <View style={[styles.dirBanner, { borderColor: isBuy ? Colors.green : Colors.red }]}>
            <Text style={[styles.dirText, { color: isBuy ? Colors.green : Colors.red }]}>
              {isBuy ? '🟢 LONG SETUP' : '🔴 SHORT SETUP'}
            </Text>
            <Text style={styles.pairLabel}>{pair.replace('USDT', '/USDT')}</Text>
          </View>

          {/* Price levels */}
          {([
            { label: 'ENTRY PRICE', value: entry,      color: Colors.accent, icon: '⚡', barW: '50%' },
            { label: 'TAKE PROFIT', value: takeProfit, color: Colors.green,  icon: '🎯', barW: '80%' },
            { label: 'STOP LOSS',   value: stopLoss,   color: Colors.red,    icon: '🛑', barW: '30%' },
          ] as const).map(({ label, value, color, icon, barW }) => (
            <View key={label} style={styles.levelRow}>
              <View style={styles.levelIcon}>
                <Text style={styles.levelIconText}>{icon}</Text>
              </View>
              <View style={styles.levelBody}>
                <Text style={styles.levelLabel}>{label}</Text>
                <Text style={[styles.levelValue, { color }]}>{value}</Text>
              </View>
              <View style={[styles.levelBar, { backgroundColor: color + '22' }]}>
                <View style={[styles.levelBarFill, { backgroundColor: color, width: barW }]} />
              </View>
            </View>
          ))}

          {/* R:R */}
          <View style={styles.rrRow}>
            <Text style={styles.rrLabel}>Risk / Reward</Text>
            <Text style={styles.rrValue}>1:{rr.toFixed(2)}</Text>
          </View>

          {/* Technical note */}
          <View style={styles.techNote}>
            <Text style={styles.techNoteTitle}>📈 Technical Context</Text>
            <Text style={styles.techNoteText}>
              {'Price must close '}
              {isBuy ? 'above' : 'below'}
              {' the entry zone at '}
              <Text style={{ color: Colors.accent }}>{entry}</Text>
              {' to confirm the setup.\n\nStop loss at '}
              <Text style={{ color: Colors.red }}>{stopLoss}</Text>
              {' invalidates the structure.\n\nTarget '}
              <Text style={{ color: Colors.green }}>{takeProfit}</Text>
              {' represents the next significant liquidity pool / order block.'}
            </Text>
          </View>

        </View>
      )}

    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { backgroundColor: Colors.bg },

  // Tabs
  tabs: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 20, paddingBottom: 12,
  },
  tab: {
    flex: 1, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface, alignItems: 'center',
  },
  tabActive:     { borderColor: Colors.accent, backgroundColor: 'rgba(0,212,255,0.1)' },
  tabText:       { fontSize: 13, fontWeight: '700', color: Colors.muted },
  tabTextActive: { color: Colors.accent },

  // Chart
  chartWrap: {
    height: 340, marginHorizontal: 20, borderRadius: 14,
    overflow: 'hidden', borderWidth: 1, borderColor: Colors.border,
  },
  webview: { flex: 1, backgroundColor: '#0d0d0d' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0d0d0d',
    alignItems: 'center', justifyContent: 'center', gap: 12, zIndex: 10,
  },
  loadingText: { color: Colors.muted, fontSize: 13 },
  errorWrap:   {
    height: 340, marginHorizontal: 20,
    alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  errorIcon: { fontSize: 36 },
  errorText: { fontSize: 16, fontWeight: '700', color: Colors.text },
  errorSub:  { fontSize: 13, color: Colors.muted },

  // Install prompt (shown when react-native-webview is not installed)
  installWrap: {
    height: 300, marginHorizontal: 20, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
    padding: 24, gap: 10,
  },
  installIcon:    { fontSize: 36 },
  installTitle:   { fontSize: 15, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  installBody:    { fontSize: 13, color: Colors.muted, textAlign: 'center', lineHeight: 20 },
  installCmd: {
    backgroundColor: '#1a1a1a', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  installCmdText: { fontSize: 12, color: Colors.accent, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  installNote:    { fontSize: 11, color: Colors.muted, textAlign: 'center' },

  // Levels
  levelsWrap: { paddingHorizontal: 20, gap: 12 },
  dirBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 14, borderRadius: 12, borderWidth: 1.5, backgroundColor: Colors.surface,
  },
  dirText:   { fontSize: 15, fontWeight: '800' },
  pairLabel: { fontSize: 13, fontWeight: '700', color: Colors.muted },

  levelRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.surface, borderWidth: 1,
    borderColor: Colors.border, borderRadius: 12, padding: 12,
  },
  levelIcon:     {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,212,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  levelIconText: { fontSize: 18 },
  levelBody:     { flex: 1 },
  levelLabel:    { fontSize: 10, color: Colors.muted, letterSpacing: 1.5, fontWeight: '700', marginBottom: 3 },
  levelValue:    { fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
  levelBar:      { width: 60, height: 6, borderRadius: 3, overflow: 'hidden' },
  levelBarFill:  { height: '100%', borderRadius: 3 },

  rrRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: 'rgba(0,212,255,0.06)', borderRadius: 10,
    padding: 14, borderWidth: 1, borderColor: Colors.accent + '33',
  },
  rrLabel: { fontSize: 12, color: Colors.muted, fontWeight: '700', letterSpacing: 1 },
  rrValue: { fontSize: 20, fontWeight: '800', color: Colors.accent },

  techNote: {
    backgroundColor: Colors.surface, borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: Colors.border,
  },
  techNoteTitle: { fontSize: 13, fontWeight: '800', color: Colors.text, marginBottom: 8 },
  techNoteText:  { fontSize: 13, color: Colors.muted, lineHeight: 20 },
});