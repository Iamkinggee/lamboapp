// LOCATION: apps/mobile/app/(tabs)/search.tsx
// Token Search & On-Demand SMC Analysis
// Search any Binance USDT pair and get full SMC analysis:
// HTF bias, OBs, FVGs, liquidity zones, entry/SL/TP1/TP2/TP3 suggestions

import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, FlatList,
} from "react-native";
import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchTokenAnalysis, type TokenAnalysis } from "../../services/api";
import { Colors } from "../../utils/theme";
import PairChart from "../../components/PairChart";

const QUICK_PAIRS = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT",
  "ADAUSDT", "AVAXUSDT", "DOTUSDT", "LINKUSDT", "ARBUSDT",
  "OPUSDT",  "INJUSDT",  "SUIUSDT", "NEARUSDT", "APTUSDT",
];

function BiasChip({ bias }: { bias: string }) {
  const color = bias === "BULLISH" ? Colors.green : bias === "BEARISH" ? Colors.red : Colors.muted;
  const bg    = bias === "BULLISH" ? "rgba(0,200,100,0.1)" : bias === "BEARISH" ? "rgba(255,71,87,0.1)" : "rgba(255,255,255,0.05)";
  return (
    <View style={[s.biasChip, { backgroundColor: bg, borderColor: color }]}>
      <Text style={[s.biasChipText, { color }]}>{bias}</Text>
    </View>
  );
}

function ConfBar({ value }: { value: number }) {
  const color = value >= 75 ? Colors.green : value >= 55 ? Colors.caution : Colors.red;
  return (
    <View style={s.confBarWrap}>
      <View style={s.confBarTrack}>
        <View style={[s.confBarFill, { width: `${value}%`, backgroundColor: color }]} />
      </View>
      <Text style={[s.confBarLabel, { color }]}>{value}%</Text>
    </View>
  );
}

function ZoneRow({ label, top, bottom, type, fillPct }: {
  label: string; top: number; bottom: number; type: string; fillPct?: number;
}) {
  const isBull = type.includes("bullish");
  const color  = isBull ? Colors.green : Colors.red;
  return (
    <View style={s.zoneRow}>
      <View style={[s.zoneDot, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={s.zoneLabel}>{label}</Text>
        <Text style={s.zoneRange}>
          {bottom.toFixed(bottom < 1 ? 5 : 2)} – {top.toFixed(top < 1 ? 5 : 2)}
          {fillPct != null ? `  (${fillPct.toFixed(0)}% filled)` : ""}
        </Text>
      </View>
      <View style={[s.zoneTypeBadge, { borderColor: color + "44" }]}>
        <Text style={[s.zoneTypeText, { color }]}>
          {type.replace("_ob", " OB").replace("_fvg", " FVG").replace("bullish_", "Bull ").replace("bearish_", "Bear ")}
        </Text>
      </View>
    </View>
  );
}

function LiqRow({ level, type, touches }: { level: number; type: string; touches: number }) {
  const isHigh = type === "equal_highs";
  return (
    <View style={s.liqRow}>
      <Text style={[s.liqIcon, { color: isHigh ? Colors.red : Colors.green }]}>
        {isHigh ? "🔴" : "🟢"}
      </Text>
      <View style={{ flex: 1 }}>
        <Text style={s.liqLevel}>{level.toFixed(level < 1 ? 5 : 2)}</Text>
        <Text style={s.liqType}>{isHigh ? "Equal Highs (resistance)" : "Equal Lows (support)"}</Text>
      </View>
      <Text style={s.liqTouches}>{touches}x touched</Text>
    </View>
  );
}

export default function SearchScreen() {
  const [query,        setQuery]        = useState("");
  const [activePair,   setActivePair]   = useState<string | null>(null);
  const [showChart,    setShowChart]    = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey:  ["token-analysis", activePair],
    queryFn:   () => searchTokenAnalysis(activePair!),
    enabled:   !!activePair,
    staleTime: 60_000,   // refresh every 60s
    retry:     1,
  });

  const analysis: TokenAnalysis | null = data?.analysis ?? null;

  const handleSearch = useCallback(() => {
    const normalized = query.trim().toUpperCase();
    if (!normalized) return;
    const pair = normalized.endsWith("USDT") ? normalized : `${normalized}USDT`;
    setActivePair(pair);
    setShowChart(false);
  }, [query]);

  const handleQuickPair = (pair: string) => {
    setQuery(pair.replace("USDT", ""));
    setActivePair(pair);
    setShowChart(false);
  };

  const formatPrice = (p: number | null): string => {
    if (!p) return "—";
    if (p >= 10000) return p.toFixed(0);
    if (p >= 100)   return p.toFixed(2);
    if (p >= 1)     return p.toFixed(3);
    return p.toFixed(5);
  };

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>Token Analysis</Text>
        <Text style={s.subtitle}>Search any pair for SMC setup</Text>
      </View>

      {/* Search bar */}
      <View style={s.searchRow}>
        <View style={s.inputWrap}>
          <Text style={s.searchIcon}>🔍</Text>
          <TextInput
            style={s.input}
            placeholder="BTC, ETH, SOL, PEPE..."
            placeholderTextColor={Colors.muted}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            autoCapitalize="characters"
            returnKeyType="search"
          />
        </View>
        <TouchableOpacity style={s.searchBtn} onPress={handleSearch} activeOpacity={0.8}>
          <Text style={s.searchBtnText}>Analyze</Text>
        </TouchableOpacity>
      </View>

      {/* Quick pairs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.quickRow} contentContainerStyle={s.quickContent}>
        {QUICK_PAIRS.map((p) => (
          <TouchableOpacity
            key={p}
            style={[s.quickChip, activePair === p && s.quickChipActive]}
            onPress={() => handleQuickPair(p)}
            activeOpacity={0.8}
          >
            <Text style={[s.quickChipText, activePair === p && s.quickChipTextActive]}>
              {p.replace("USDT", "")}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.body}>

        {/* Loading */}
        {isLoading && (
          <View style={s.loadingWrap}>
            <ActivityIndicator color={Colors.accent} size="large" />
            <Text style={s.loadingText}>Analyzing {activePair}...</Text>
            <Text style={s.loadingSub}>Fetching HTF zones, OBs, FVGs, liquidity...</Text>
          </View>
        )}

        {/* Error */}
        {isError && !isLoading && (
          <View style={s.errorWrap}>
            <Text style={s.errorIcon}>⚠️</Text>
            <Text style={s.errorTitle}>Analysis Failed</Text>
            <Text style={s.errorBody}>
              {(error as any)?.message?.includes('"')
                ? (error as any).message
                : `Could not analyze ${activePair}. Make sure it's a valid Binance pair.`}
            </Text>
            <TouchableOpacity style={s.retryBtn} onPress={() => refetch()}>
              <Text style={s.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Empty state */}
        {!activePair && !isLoading && (
          <View style={s.emptyWrap}>
            <Text style={s.emptyIcon}>🔎</Text>
            <Text style={s.emptyTitle}>Search any token</Text>
            <Text style={s.emptyBody}>
              Enter a symbol or tap a quick chip to get a full SMC analysis: HTF bias, order blocks, FVGs, liquidity zones, and suggested entries with TP1/TP2/TP3 targets.
            </Text>
          </View>
        )}

        {/* Analysis results */}
        {analysis && !isLoading && (
          <>
            {/* ── Header card ── */}
            <View style={s.resultHeader}>
              <View style={s.resultTitleRow}>
                <Text style={s.resultPair}>{analysis.pair.replace("USDT", "")}<Text style={s.resultQuote}>/USDT</Text></Text>
                <BiasChip bias={analysis.htf_bias} />
              </View>
              <Text style={s.resultPrice}>
                Last price: <Text style={{ color: Colors.accent }}>${formatPrice(analysis.last_price)}</Text>
              </Text>
              <View style={s.resultMeta}>
                <Text style={s.metaItem}>HTF: {analysis.htf_timeframe}</Text>
                <Text style={s.metaSep}>·</Text>
                <Text style={s.metaItem}>1H Trend: {analysis.ltf_trend}</Text>
                <Text style={s.metaSep}>·</Text>
                <Text style={s.metaItem}>{analysis.active_obs.length} OBs · {analysis.active_fvgs.length} FVGs</Text>
              </View>
              <View style={s.confRow}>
                <Text style={s.confLabel}>SETUP QUALITY</Text>
                <ConfBar value={analysis.confidence} />
              </View>
            </View>

            {/* ── Summary ── */}
            <View style={s.summaryCard}>
              <Text style={s.summaryTitle}>📋 Analysis Summary</Text>
              <Text style={s.summaryText}>{analysis.summary}</Text>
            </View>

            {/* ── Suggested Entry / TP Ladder ── */}
            {analysis.suggested_entry && (
              <View style={s.entryCard}>
                <Text style={s.sectionTitle}>🎯 Suggested Entry Levels</Text>
                <Text style={s.entryDirection}>
                  {analysis.htf_bias === "BULLISH" ? "🟢 LONG" : "🔴 SHORT"} Setup
                </Text>

                <View style={s.levelGrid}>
                  <View style={s.levelCell}>
                    <Text style={s.levelCellLabel}>ENTRY</Text>
                    <Text style={[s.levelCellValue, { color: Colors.accent }]}>
                      {formatPrice(analysis.suggested_entry)}
                    </Text>
                  </View>
                  <View style={s.levelCell}>
                    <Text style={s.levelCellLabel}>STOP LOSS</Text>
                    <Text style={[s.levelCellValue, { color: Colors.red }]}>
                      {formatPrice(analysis.suggested_sl)}
                    </Text>
                  </View>
                </View>

                <View style={s.tpLadderCard}>
                  <Text style={s.tpLadderTitle}>Take Profit Ladder</Text>
                  {[
                    { label: "TP1 — Scalp (50% exit)", value: analysis.suggested_tp1, rr: analysis.rr_1 },
                    { label: "TP2 ★ Main (30% exit)",  value: analysis.suggested_tp2, rr: analysis.rr_2, main: true },
                    { label: "TP3 — Runner (20% exit)", value: analysis.suggested_tp3, rr: analysis.rr_3 },
                  ].filter(t => t.value).map(({ label, value, rr, main }) => (
                    <View key={label} style={[s.tpRow, main && s.tpRowMain]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.tpRowLabel, main && { color: Colors.green }]}>{label}</Text>
                        <Text style={[s.tpRowValue, main && { color: Colors.green }]}>
                          {formatPrice(value)}
                        </Text>
                      </View>
                      <View style={[s.tpRRBadge, main && s.tpRRBadgeMain]}>
                        <Text style={[s.tpRRText, main && { color: Colors.green }]}>
                          1:{rr?.toFixed(1)}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>

                {/* Chart toggle */}
                <TouchableOpacity style={s.chartToggle} onPress={() => setShowChart(v => !v)} activeOpacity={0.8}>
                  <Text style={s.chartToggleText}>
                    {showChart ? "▲ Hide Chart" : "📊 Show Chart with Levels"}
                  </Text>
                </TouchableOpacity>

                {showChart && (
                  <PairChart
                    pair={analysis.pair}
                    entry={analysis.suggested_entry}
                    stopLoss={analysis.suggested_sl ?? 0}
                    takeProfit1={analysis.suggested_tp1 ?? 0}
                    takeProfit2={analysis.suggested_tp2 ?? 0}
                    takeProfit3={analysis.suggested_tp3 ?? 0}
                    rr1={analysis.rr_1 ?? 0}
                    rr2={analysis.rr_2 ?? 0}
                    rr3={analysis.rr_3 ?? 0}
                    signalType={analysis.htf_bias === "BULLISH" ? "BUY" : "SELL"}
                    timeframe="1h"
                  />
                )}
              </View>
            )}

            {/* ── Order Blocks ── */}
            {analysis.active_obs.length > 0 && (
              <View style={s.sectionCard}>
                <Text style={s.sectionTitle}>🧱 Order Blocks ({analysis.active_obs.length})</Text>
                {analysis.active_obs.map((ob, i) => (
                  <ZoneRow
                    key={i} label={`${ob.type.includes("bullish") ? "Bullish" : "Bearish"} OB`}
                    top={ob.top} bottom={ob.bottom} type={ob.type}
                  />
                ))}
              </View>
            )}

            {/* ── FVGs ── */}
            {analysis.active_fvgs.length > 0 && (
              <View style={s.sectionCard}>
                <Text style={s.sectionTitle}>⚡ Fair Value Gaps ({analysis.active_fvgs.length})</Text>
                {analysis.active_fvgs.map((fvg, i) => (
                  <ZoneRow
                    key={i} label={`${fvg.type.includes("bullish") ? "Bullish" : "Bearish"} FVG`}
                    top={fvg.top} bottom={fvg.bottom} type={fvg.type} fillPct={fvg.fill_pct}
                  />
                ))}
              </View>
            )}

            {/* ── Liquidity Zones ── */}
            {analysis.liq_zones.length > 0 && (
              <View style={s.sectionCard}>
                <Text style={s.sectionTitle}>💧 Liquidity Zones ({analysis.liq_zones.length})</Text>
                {analysis.liq_zones.map((z, i) => (
                  <LiqRow key={i} level={z.level} type={z.type} touches={z.touch_count} />
                ))}
              </View>
            )}

            {/* Disclaimer */}
            <View style={s.disclaimer}>
              <Text style={s.disclaimerText}>
                ⚠️ Analysis is based on historical HTF candle data and SMC principles. Not financial advice. Always use proper risk management.
              </Text>
            </View>
          </>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  header: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12 },
  title:    { fontSize: 24, fontWeight: "800", color: Colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: Colors.muted, marginTop: 3 },

  searchRow:   { flexDirection: "row", paddingHorizontal: 16, gap: 10, marginBottom: 10 },
  inputWrap: {
    flex: 1, flexDirection: "row", alignItems: "center",
    backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12,
  },
  searchIcon:  { fontSize: 14, marginRight: 8 },
  input: {
    flex: 1, height: 44, color: Colors.text,
    fontSize: 15, fontWeight: "700",
  },
  searchBtn: {
    backgroundColor: Colors.accent, borderRadius: 12,
    paddingHorizontal: 18, justifyContent: "center",
  },
  searchBtnText: { fontSize: 13, fontWeight: "800", color: "#000" },

  quickRow:    { maxHeight: 42, marginBottom: 4 },
  quickContent:{ paddingHorizontal: 16, gap: 8, alignItems: "center" },
  quickChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  quickChipActive:    { borderColor: Colors.accent, backgroundColor: "rgba(0,212,255,0.1)" },
  quickChipText:      { fontSize: 12, color: Colors.muted, fontWeight: "700" },
  quickChipTextActive:{ color: Colors.accent },

  body: { paddingHorizontal: 16, paddingTop: 8 },

  loadingWrap: { alignItems: "center", paddingTop: 60, gap: 12 },
  loadingText: { color: Colors.text, fontSize: 16, fontWeight: "700" },
  loadingSub:  { color: Colors.muted, fontSize: 13 },

  errorWrap: { alignItems: "center", paddingTop: 60, gap: 10, paddingHorizontal: 24 },
  errorIcon:  { fontSize: 40 },
  errorTitle: { fontSize: 16, fontWeight: "800", color: Colors.text },
  errorBody:  { fontSize: 13, color: Colors.muted, textAlign: "center", lineHeight: 20 },
  retryBtn:   { backgroundColor: Colors.accent, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, marginTop: 6 },
  retryBtnText:{ fontSize: 13, fontWeight: "800", color: "#000" },

  emptyWrap:  { alignItems: "center", paddingTop: 60, paddingHorizontal: 28 },
  emptyIcon:  { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: Colors.text, marginBottom: 8 },
  emptyBody:  { fontSize: 14, color: Colors.muted, textAlign: "center", lineHeight: 22 },

  resultHeader: {
    backgroundColor: Colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 12, gap: 8,
  },
  resultTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  resultPair:     { fontSize: 26, fontWeight: "800", color: Colors.text, letterSpacing: -0.5 },
  resultQuote:    { fontSize: 14, color: Colors.muted },
  resultPrice:    { fontSize: 13, color: Colors.muted },
  resultMeta:     { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4 },
  metaItem:       { fontSize: 11, color: Colors.muted, fontWeight: "600" },
  metaSep:        { fontSize: 11, color: Colors.muted },
  confRow:        { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4 },
  confLabel:      { fontSize: 9, color: Colors.muted, letterSpacing: 1.5, fontWeight: "700" },
  confBarWrap:    { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  confBarTrack:   { flex: 1, height: 6, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" },
  confBarFill:    { height: "100%", borderRadius: 3 },
  confBarLabel:   { fontSize: 12, fontWeight: "800", minWidth: 32 },

  biasChip:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  biasChipText: { fontSize: 11, fontWeight: "800" },

  summaryCard: {
    backgroundColor: Colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 12,
  },
  summaryTitle: { fontSize: 12, fontWeight: "800", color: Colors.text, marginBottom: 8 },
  summaryText:  { fontSize: 13, color: Colors.muted, lineHeight: 20 },

  entryCard: {
    backgroundColor: Colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: "rgba(0,200,100,0.2)", padding: 14, marginBottom: 12, gap: 12,
  },
  sectionTitle:   { fontSize: 12, fontWeight: "800", color: Colors.text, marginBottom: 4 },
  entryDirection: { fontSize: 14, fontWeight: "800", color: Colors.green },
  levelGrid:      { flexDirection: "row", gap: 10 },
  levelCell: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.2)",
    borderRadius: 10, padding: 12, borderWidth: 1, borderColor: Colors.border,
  },
  levelCellLabel: { fontSize: 9, color: Colors.muted, letterSpacing: 1.5, fontWeight: "700", marginBottom: 4 },
  levelCellValue: { fontSize: 16, fontWeight: "800" },

  tpLadderCard: {
    backgroundColor: "rgba(0,200,100,0.04)", borderRadius: 12,
    borderWidth: 1, borderColor: "rgba(0,200,100,0.15)", overflow: "hidden",
  },
  tpLadderTitle: { fontSize: 10, fontWeight: "700", color: Colors.muted, letterSpacing: 1.5, padding: 10, paddingBottom: 6 },
  tpRow:         { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.04)" },
  tpRowMain:     { backgroundColor: "rgba(0,200,100,0.06)" },
  tpRowLabel:    { fontSize: 9, color: Colors.muted, fontWeight: "700", letterSpacing: 1, marginBottom: 2 },
  tpRowValue:    { fontSize: 15, fontWeight: "800", color: Colors.text },
  tpRRBadge:     { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: "rgba(0,200,100,0.08)", borderWidth: 1, borderColor: "rgba(0,200,100,0.2)" },
  tpRRBadgeMain: { backgroundColor: "rgba(0,200,100,0.15)", borderColor: "rgba(0,200,100,0.4)" },
  tpRRText:      { fontSize: 12, fontWeight: "800", color: Colors.muted },

  chartToggle: {
    alignItems: "center", padding: 12,
    backgroundColor: "rgba(0,212,255,0.06)",
    borderRadius: 10, borderWidth: 1, borderColor: "rgba(0,212,255,0.2)",
  },
  chartToggleText: { fontSize: 13, color: Colors.accent, fontWeight: "700" },

  sectionCard: {
    backgroundColor: Colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 12, gap: 8,
  },

  zoneRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  zoneDot:  { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  zoneLabel:{ fontSize: 12, fontWeight: "700", color: Colors.text },
  zoneRange:{ fontSize: 11, color: Colors.muted, marginTop: 1 },
  zoneTypeBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5, borderWidth: 1, backgroundColor: "rgba(0,0,0,0.2)" },
  zoneTypeText:  { fontSize: 9, fontWeight: "700" },

  liqRow:    { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  liqIcon:   { fontSize: 16, flexShrink: 0 },
  liqLevel:  { fontSize: 14, fontWeight: "700", color: Colors.text },
  liqType:   { fontSize: 11, color: Colors.muted, marginTop: 1 },
  liqTouches:{ fontSize: 10, color: Colors.muted, fontWeight: "600" },

  disclaimer: {
    backgroundColor: "rgba(255,180,0,0.05)", borderRadius: 10,
    padding: 12, borderWidth: 1, borderColor: "rgba(255,180,0,0.15)",
    marginBottom: 12,
  },
  disclaimerText: { fontSize: 11, color: "#FFB400", lineHeight: 16 },
});