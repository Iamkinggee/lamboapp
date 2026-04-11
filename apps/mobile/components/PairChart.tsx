// LOCATION: apps/mobile/components/PairChart.tsx
// FIXES:
//  - Trendlines now drawn via TradingView Charting Library price scales API
//    using createOrderLine() — the only reliable way to draw labelled horizontal
//    lines on a TradingView widget embed.
//  - TP1/TP2/TP3 + SL + Entry all visible as named horizontal lines on chart
//  - Fullscreen modal works independently
//  - Levels tab shows full TP1/TP2/TP3 ladder with position-sizing guide

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator,
  TouchableOpacity, Platform, Modal, StatusBar, SafeAreaView,
} from 'react-native';
import { Colors } from '../utils/theme';

let WebView: React.ComponentType<any> | null = null;
try { WebView = require('react-native-webview').WebView; } catch { WebView = null; }

interface PairChartProps {
  pair:            string;
  entry:           number;
  stopLoss:        number;
  takeProfit?:     number;
  takeProfit1?:    number;
  takeProfit2?:    number;
  takeProfit3?:    number;
  rr1?:            number;
  rr2?:            number;
  rr3?:            number;
  signalType:      'BUY' | 'SELL';
  timeframe?:      string;
  isAnticipatory?: boolean;
}

type Tab = 'chart' | 'levels';

const TF_TO_TV: Record<string, string> = {
  '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30',
  '1h': '60', '2h': '120', '4h': '240', '6h': '360', '12h': '720',
  '1d': 'D', '1w': 'W',
};

function toTVInterval(tf: string): string { return TF_TO_TV[tf.toLowerCase()] ?? '15'; }
function toTVSymbol(pair: string): string  { return `BINANCE:${pair.toUpperCase()}`; }

function fp(p: number): string {
  if (!p) return '';
  if (p >= 10000) return p.toFixed(0);
  if (p >= 100)   return p.toFixed(2);
  if (p >= 1)     return p.toFixed(3);
  return p.toFixed(5);
}

// ── HTML builder ──────────────────────────────────────────────
// Uses createOrderLine() — the correct TradingView widget API for
// persistent labelled horizontal lines with price + text on chart.
function buildChartHtml(
  pair:      string,
  entry:     number,
  sl:        number,
  tp1:       number,
  tp2:       number,
  tp3:       number,
  rr1:       number,
  rr2:       number,
  rr3:       number,
  sigType:   'BUY' | 'SELL',
  timeframe: string,
): string {
  const symbol   = toTVSymbol(pair);
  const interval = toTVInterval(timeframe);

  // Build the JS that draws each line once the chart is ready
  const lines: string[] = [];

  if (sl > 0) lines.push(`
    widget.chart().createOrderLine()
      .setLineColor('#FF4757')
      .setBodyBorderColor('#FF4757')
      .setBodyBackgroundColor('rgba(255,71,87,0.15)')
      .setBodyTextColor('#FF4757')
      .setQuantityBorderColor('#FF4757')
      .setQuantityBackgroundColor('rgba(255,71,87,0.2)')
      .setQuantityTextColor('#FF4757')
      .setLineWidth(2)
      .setLineStyle(2)
      .setText('SL')
      .setQuantity('${fp(sl)}')
      .setPrice(${sl});
  `);

  if (entry > 0) lines.push(`
    widget.chart().createOrderLine()
      .setLineColor('#F0B429')
      .setBodyBorderColor('#F0B429')
      .setBodyBackgroundColor('rgba(240,180,41,0.15)')
      .setBodyTextColor('#F0B429')
      .setQuantityBorderColor('#F0B429')
      .setQuantityBackgroundColor('rgba(240,180,41,0.2)')
      .setQuantityTextColor('#F0B429')
      .setLineWidth(2)
      .setLineStyle(0)
      .setText('ENTRY')
      .setQuantity('${fp(entry)}')
      .setPrice(${entry});
  `);

  if (tp1 > 0) lines.push(`
    widget.chart().createOrderLine()
      .setLineColor('#00C896')
      .setBodyBorderColor('#00C896')
      .setBodyBackgroundColor('rgba(0,200,150,0.12)')
      .setBodyTextColor('#00C896')
      .setQuantityBorderColor('#00C896')
      .setQuantityBackgroundColor('rgba(0,200,150,0.15)')
      .setQuantityTextColor('#00C896')
      .setLineWidth(1)
      .setLineStyle(1)
      .setText('TP1  1:${rr1.toFixed(1)}')
      .setQuantity('${fp(tp1)}')
      .setPrice(${tp1});
  `);

  if (tp2 > 0) lines.push(`
    widget.chart().createOrderLine()
      .setLineColor('#00E5A0')
      .setBodyBorderColor('#00E5A0')
      .setBodyBackgroundColor('rgba(0,229,160,0.15)')
      .setBodyTextColor('#00E5A0')
      .setQuantityBorderColor('#00E5A0')
      .setQuantityBackgroundColor('rgba(0,229,160,0.2)')
      .setQuantityTextColor('#00E5A0')
      .setLineWidth(2)
      .setLineStyle(1)
      .setText('TP2 ★  1:${rr2.toFixed(1)}')
      .setQuantity('${fp(tp2)}')
      .setPrice(${tp2});
  `);

  if (tp3 > 0) lines.push(`
    widget.chart().createOrderLine()
      .setLineColor('#7FFFAA')
      .setBodyBorderColor('#7FFFAA')
      .setBodyBackgroundColor('rgba(127,255,170,0.1)')
      .setBodyTextColor('#7FFFAA')
      .setQuantityBorderColor('#7FFFAA')
      .setQuantityBackgroundColor('rgba(127,255,170,0.15)')
      .setQuantityTextColor('#7FFFAA')
      .setLineWidth(1)
      .setLineStyle(1)
      .setText('TP3  1:${rr3.toFixed(1)}')
      .setQuantity('${fp(tp3)}')
      .setPrice(${tp3});
  `);

  const linesJS = lines.join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:100%;height:100%;background:#0d0d0d;overflow:hidden}
  #chart{width:100%;height:100%}
</style>
</head>
<body>
<div id="chart"></div>
<script src="https://s3.tradingview.com/tv.js"></script>
<script>
var widget = new TradingView.widget({
  autosize:           true,
  symbol:             "${symbol}",
  interval:           "${interval}",
  container_id:       "chart",
  timezone:           "Etc/UTC",
  theme:              "dark",
  style:              "1",
  locale:             "en",
  toolbar_bg:         "#0d0d0d",
  enable_publishing:  false,
  hide_side_toolbar:  false,
  allow_symbol_change: false,
  hide_volume:        false,
  support_host:       "https://www.tradingview.com",
  overrides:{
    "paneProperties.background":     "#0d0d0d",
    "paneProperties.backgroundType": "solid",
    "scalesProperties.lineColor":    "#1a1a2e",
    "scalesProperties.textColor":    "#556677",
    "paneProperties.vertGridProperties.color": "#1a1a2e",
    "paneProperties.horzGridProperties.color": "#1a1a2e",
  },
});

widget.onChartReady(function(){
  try {
    ${linesJS}
  } catch(e){
    console.warn('Level lines error:', e.message);
  }
});
</script>
</body>
</html>`;
}

// ── Fullscreen modal ───────────────────────────────────────────
function FullscreenChart({ visible, onClose, html, pair }: {
  visible: boolean; onClose: () => void; html: string; pair: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);
  if (!WebView) return null;
  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <StatusBar barStyle="light-content" backgroundColor="#0d0d0d" />
      <SafeAreaView style={fs.container}>
        <View style={fs.header}>
          <Text style={fs.title}>{pair.replace('USDT', '/USDT')} · Entry / TP1 / TP2 / TP3 / SL</Text>
          <TouchableOpacity onPress={onClose} style={fs.closeBtn} activeOpacity={0.7}>
            <Text style={fs.closeTxt}>✕</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1 }}>
          {loading && !error && (
            <View style={fs.overlay}>
              <ActivityIndicator color={Colors.accent} size="large" />
              <Text style={fs.loadTxt}>Loading chart with levels…</Text>
            </View>
          )}
          {!error && (
            <WebView
              source={{ html }}
              style={{ flex: 1, backgroundColor: '#0d0d0d' }}
              onLoadStart={() => { setLoading(true); setError(false); }}
              onLoadEnd={() => setLoading(false)}
              onError={() => { setLoading(false); setError(true); }}
              scrollEnabled={false} bounces={false}
              javaScriptEnabled domStorageEnabled originWhitelist={['*']}
            />
          )}
          {error && (
            <View style={fs.overlay}>
              <Text style={{ fontSize: 32 }}>📡</Text>
              <Text style={fs.loadTxt}>Chart unavailable</Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const fs = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a2e' },
  title:     { fontSize: 12, fontWeight: '700', color: '#aaa', flex: 1 },
  closeBtn:  { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: '#1a1a2e' },
  closeTxt:  { color: '#888', fontWeight: '700', fontSize: 14 },
  overlay:   { ...StyleSheet.absoluteFillObject, backgroundColor: '#0d0d0d', alignItems: 'center', justifyContent: 'center', gap: 12, zIndex: 10 },
  loadTxt:   { color: '#666', fontSize: 13 },
});

// ── Main component ────────────────────────────────────────────
export default function PairChart({
  pair, entry, stopLoss,
  takeProfit, takeProfit1, takeProfit2, takeProfit3,
  rr1 = 0, rr2 = 0, rr3 = 0,
  signalType, timeframe, isAnticipatory,
}: PairChartProps) {
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(false);
  const [tab,        setTab]        = useState<Tab>('chart');
  const [fullscreen, setFullscreen] = useState(false);

  const resolvedTf = timeframe ?? '15m';
  const tp1        = takeProfit1 || 0;
  const tp2        = takeProfit2 || takeProfit || 0;
  const tp3        = takeProfit3 || 0;
  const isBuy      = signalType === 'BUY';

  const html = buildChartHtml(pair, entry, stopLoss, tp1, tp2, tp3, rr1, rr2, rr3, signalType, resolvedTf);

  const renderChart = () => {
    if (!WebView) return (
      <View style={s.installWrap}>
        <Text style={s.installIcon}>📦</Text>
        <Text style={s.installTitle}>WebView not installed</Text>
        <View style={s.installCmd}>
          <Text style={s.installCmdTxt}>npx expo install react-native-webview</Text>
        </View>
      </View>
    );

    return (
      <>
        <FullscreenChart visible={fullscreen} onClose={() => setFullscreen(false)} html={html} pair={pair} />
        <View style={s.chartWrap}>
          {loading && !error && (
            <View style={s.overlay}>
              <ActivityIndicator color={Colors.accent} size="large" />
              <Text style={s.overlayTxt}>Loading chart…</Text>
            </View>
          )}
          {error ? (
            <View style={s.overlay}>
              <Text style={{ fontSize: 32 }}>📡</Text>
              <Text style={s.overlayTxt}>Chart unavailable</Text>
              <Text style={{ color: Colors.muted, fontSize: 11 }}>Check internet connection</Text>
            </View>
          ) : (
            <>
              <WebView
                source={{ html }}
                style={s.webview}
                onLoadStart={() => { setLoading(true); setError(false); }}
                onLoadEnd={() => setLoading(false)}
                onError={() => { setLoading(false); setError(true); }}
                scrollEnabled={false} bounces={false}
                javaScriptEnabled domStorageEnabled originWhitelist={['*']}
              />
              {!loading && (
                <TouchableOpacity style={s.expandBtn} onPress={() => setFullscreen(true)} activeOpacity={0.8}>
                  <Text style={s.expandTxt}>⛶</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </>
    );
  };

  return (
    <View style={s.container}>
      {isAnticipatory && (
        <View style={s.antBanner}>
          <Text style={s.antTxt}>⚠️ ANTICIPATORY — BOS not confirmed. Use limit order at entry or wait for confirmation signal.</Text>
        </View>
      )}

      {/* Tabs */}
      <View style={s.tabs}>
        {(['chart', 'levels'] as Tab[]).map(t => (
          <TouchableOpacity key={t} style={[s.tab, tab === t && s.tabActive]} onPress={() => setTab(t)} activeOpacity={0.8}>
            <Text style={[s.tabTxt, tab === t && s.tabTxtActive]}>
              {t === 'chart' ? '📊 Chart' : '🎯 Levels'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'chart' && renderChart()}

      {tab === 'levels' && (
        <View style={s.levels}>
          {/* Direction banner */}
          <View style={[s.dirBanner, { borderColor: isBuy ? Colors.green : Colors.red }]}>
            <Text style={[s.dirTxt, { color: isBuy ? Colors.green : Colors.red }]}>
              {isBuy ? '🟢 LONG' : '🔴 SHORT'} — {pair.replace('USDT', '/USDT')}
            </Text>
            <Text style={s.tfBadge}>{resolvedTf.toUpperCase()} entry</Text>
          </View>

          {/* SL */}
          <LevelRow icon="🛑" label="STOP LOSS" sublabel="Invalidation level" value={stopLoss} color={Colors.red} note="Close position" />

          {/* Entry */}
          <LevelRow icon="⚡" label="ENTRY" sublabel={isAnticipatory ? 'Limit order — pre-BOS' : 'Market or limit order'} value={entry} color={Colors.accent} note="" />

          {/* TP1 */}
          {tp1 > 0 && <LevelRow icon="🎯" label="TP1 — SCALP" sublabel="Exit 50% of position here" value={tp1} color={Colors.green} note={`1:${rr1.toFixed(1)}`} highlight={false} />}

          {/* TP2 */}
          {tp2 > 0 && <LevelRow icon="🎯" label="TP2 ★ MAIN" sublabel="Exit 30% — move SL to breakeven" value={tp2} color="#00E5A0" note={`1:${rr2.toFixed(1)}`} highlight />}

          {/* TP3 */}
          {tp3 > 0 && <LevelRow icon="🚀" label="TP3 — RUNNER" sublabel="Trail SL, exit final 20%" value={tp3} color="#7FFFAA" note={`1:${rr3.toFixed(1)}`} highlight={false} />}

          {/* Position guide */}
          <View style={s.posGuide}>
            <Text style={s.posGuideTitle}>📐 Position Management</Text>
            <Text style={s.posGuideTxt}>
              {'1. Enter at OB zone with full position\n'}
              {'2. TP1 hit → close 50%, move SL to breakeven\n'}
              {'3. TP2 hit → close 30%, trail SL behind last swing\n'}
              {'4. TP3 → close remaining 20% at liquidity pool\n\n'}
              {isAnticipatory
                ? '⚠️ Early signal: reduce position size by 50% until BOS confirms.'
                : '✅ Confirmed signal: full position sizing allowed.'}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

function LevelRow({ icon, label, sublabel, value, color, note, highlight = false }: {
  icon: string; label: string; sublabel: string; value: number;
  color: string; note: string; highlight?: boolean;
}) {
  return (
    <View style={[s.levelRow, highlight && { borderColor: color + '55', borderWidth: 1.5 }]}>
      <View style={[s.levelIcon, { backgroundColor: color + '15' }]}>
        <Text style={{ fontSize: 16 }}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.levelLabel, highlight && { color }]}>{label}</Text>
        <Text style={s.levelSub}>{sublabel}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[s.levelValue, { color }]}>{fp(value)}</Text>
        {note ? <Text style={[s.levelRR, highlight && { color }]}>{note}</Text> : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { backgroundColor: Colors.bg },

  antBanner: { marginHorizontal: 20, marginBottom: 8, padding: 10, borderRadius: 8, backgroundColor: 'rgba(255,180,0,0.08)', borderWidth: 1, borderColor: 'rgba(255,180,0,0.3)' },
  antTxt:    { fontSize: 11, color: '#FFB400', lineHeight: 16, fontWeight: '600' },

  tabs:       { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 12 },
  tab:        { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, alignItems: 'center' },
  tabActive:  { borderColor: Colors.accent, backgroundColor: 'rgba(0,212,255,0.1)' },
  tabTxt:     { fontSize: 13, fontWeight: '700', color: Colors.muted },
  tabTxtActive:{ color: Colors.accent },

  chartWrap:  { height: 340, marginHorizontal: 20, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  webview:    { flex: 1, backgroundColor: '#0d0d0d' },
  overlay:    { ...StyleSheet.absoluteFillObject, backgroundColor: '#0d0d0d', alignItems: 'center', justifyContent: 'center', gap: 10, zIndex: 10 },
  overlayTxt: { color: Colors.muted, fontSize: 13 },
  expandBtn:  { position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', zIndex: 20 },
  expandTxt:  { fontSize: 16, color: '#fff' },

  installWrap: { height: 280, marginHorizontal: 20, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  installIcon: { fontSize: 36 },
  installTitle:{ fontSize: 14, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  installCmd:  { backgroundColor: '#111', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border },
  installCmdTxt:{ fontSize: 11, color: Colors.accent, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  levels:    { paddingHorizontal: 20, gap: 8 },
  dirBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 12, borderWidth: 1.5, backgroundColor: Colors.surface, marginBottom: 4 },
  dirTxt:    { fontSize: 15, fontWeight: '800' },
  tfBadge:   { fontSize: 10, color: Colors.muted, fontWeight: '700', letterSpacing: 1 },

  levelRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 12 },
  levelIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  levelLabel:{ fontSize: 11, color: Colors.text, fontWeight: '700', marginBottom: 2 },
  levelSub:  { fontSize: 10, color: Colors.muted },
  levelValue:{ fontSize: 16, fontWeight: '800' },
  levelRR:   { fontSize: 11, color: Colors.muted, fontWeight: '600', marginTop: 2 },

  posGuide:     { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border, marginTop: 4 },
  posGuideTitle:{ fontSize: 12, fontWeight: '800', color: Colors.text, marginBottom: 8 },
  posGuideTxt:  { fontSize: 12, color: Colors.muted, lineHeight: 20 },
});