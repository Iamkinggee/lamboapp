// LOCATION: apps/mobile/app/signal/[id].tsx
// FIX #5: Added PairChart with TradingView chart + levels tab
// Shows chart, entry/TP/SL levels, and technical analysis for each pair

import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Share, Alert,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { fetchSignalById, explainSignal } from "../../services/api";
import { useWatchlistStore } from "../../store/useWatchlistStore";
import { useSignalStore } from "../../store/useSignalStore";
import ConfidenceBar from "../../components/ConfidenceBar";
import PairChart from "@/components/PairChart";
import { Colors } from "../../utils/theme";

const CONFLUENCE_META: Record<string, { label: string; icon: string; desc: string }> = {
  "Liquidity Sweep":  { icon: "💧", label: "Liquidity Sweep",  desc: "Price swept a key liquidity pool before reversal" },
  "Order Block Tap":  { icon: "🧱", label: "Order Block Tap",  desc: "Price returned to an institutional order block" },
  "BOS/CHOCH":        { icon: "🔀", label: "Break of Structure / CHoCH", desc: "Market structure broke or changed character" },
  "Fair Value Gap":   { icon: "⚡", label: "Fair Value Gap",   desc: "Imbalance in price action — FVG filled on entry" },
  "HTF Bias Aligned": { icon: "📊", label: "HTF Bias Aligned", desc: "Higher timeframe trend confirms trade direction" },
  "Displacement":     { icon: "🚀", label: "Displacement",     desc: "Strong impulsive candle confirming institutional intent" },
  "Premium Zone":     { icon: "📈", label: "Premium Zone",     desc: "Price in premium — ideal for short entries" },
  "Discount Zone":    { icon: "📉", label: "Discount Zone",    desc: "Price in discount — ideal for long entries" },
};

function getConfluenceMeta(raw: string) {
  return CONFLUENCE_META[raw] ?? { icon: "✅", label: raw, desc: "" };
}

function parsePair(pair: string) {
  if (pair.endsWith("USDT")) return pair.replace("USDT", "") + "/USDT";
  if (pair.endsWith("BTC"))  return pair.replace("BTC", "") + "/BTC";
  return pair;
}

export default function SignalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const storeSignal = useSignalStore((s) =>
    s.signals.find((sig) => sig.signal.signal_id === id)?.signal
  );

  const { data, isLoading } = useQuery({
    queryKey:  ["signal", id],
    queryFn:   () => fetchSignalById(id!),
    enabled:   !!id && !storeSignal,
    staleTime: 5 * 60_000,
  });

  const signal = storeSignal ?? data?.signal;

  const { data: explData, isLoading: explLoading, isError: explError } = useQuery({
    queryKey:  ["signal-explain", id],
    queryFn:   () => explainSignal(id!),
    enabled:   !!id && !!signal,
    staleTime: Infinity,
    retry: 1,
  });

  const { addToWatchlist, removeFromWatchlist, isWatched } = useWatchlistStore();
  const watched = signal ? isWatched(signal.signal_id) : false;

  const handleWatchlist = async () => {
    if (!signal) return;
    if (watched) {
      Alert.alert(
        "Remove from Watchlist",
        "Stop watching this signal?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Remove", style: "destructive", onPress: async () => removeFromWatchlist(signal.signal_id) },
        ]
      );
    } else {
      await addToWatchlist(signal);
      Alert.alert(
        "Added to Watchlist ✓",
        `${parsePair(signal.pair)} ${signal.type} is now being tracked. You'll be notified when SL or TP is hit.`,
        [{ text: "OK" }]
      );
    }
  };

  const handleShare = async () => {
    if (!signal) return;
    const confluenceList = signal.confluences
      .map((c) => `  • ${getConfluenceMeta(c).label}`)
      .join("\n");
    await Share.share({
      message:
        `🔔 SMC Signal — ${parsePair(signal.pair)}\n` +
        `Direction: ${signal.type === "BUY" ? "🟢 LONG" : "🔴 SHORT"}\n\n` +
        `Entry:       ${signal.entry}\n` +
        `Stop Loss:   ${signal.stop_loss}\n` +
        `Take Profit: ${signal.take_profit}\n` +
        `Risk/Reward: 1:${signal.risk_reward}\n` +
        `Confidence:  ${signal.confidence_score}%\n\n` +
        `Confluences:\n${confluenceList}`,
    });
  };

  if (isLoading || !signal) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={Colors.accent} size="large" />
      </View>
    );
  }

  const isBuy       = signal.type === "BUY";
  const explanation = explData?.explanation ?? signal.ai_explanation ?? null;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>

      {/* ── Nav row ── */}
      <View style={styles.navRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleShare} style={styles.shareBtn}>
          <Text style={styles.shareBtnText}>Share ↑</Text>
        </TouchableOpacity>
      </View>

      {/* ── Pair + direction ── */}
      <View style={styles.pairRow}>
        <Text style={styles.pair}>{parsePair(signal.pair)}</Text>
        <View style={[
          styles.typeBadge,
          { backgroundColor: isBuy ? "rgba(0,200,150,0.15)" : "rgba(255,71,87,0.15)",
            borderColor: isBuy ? Colors.green : Colors.red }
        ]}>
          <Text style={[styles.typeText, { color: isBuy ? Colors.green : Colors.red }]}>
            {isBuy ? "🟢 LONG" : "🔴 SHORT"}
          </Text>
        </View>
      </View>

      {/* ── Confidence ── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>CONFIDENCE SCORE</Text>
        <ConfidenceBar score={signal.confidence_score} large />
      </View>

      {/* ── FIX #5: Chart + Levels ── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>CHART & LEVELS</Text>
        <PairChart
          pair={signal.pair}
          entry={signal.entry}
          stopLoss={signal.stop_loss}
          takeProfit={signal.take_profit}
          takeProfit1={signal.take_profit_1}
          takeProfit2={signal.take_profit_2}
          takeProfit3={signal.take_profit_3}
          rr1={signal.rr_1}
          rr2={signal.rr_2}
          rr3={signal.rr_3}
          signalType={signal.type}
          timeframe={signal.timeframe}
          isAnticipatory={signal.is_anticipatory}
        />
      </View>

      {/* ── Anticipatory notice ── */}
      {signal.is_anticipatory && (
        <View style={[styles.biasBanner, { borderColor: '#FFB400', marginBottom: 12 }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.biasLabel, { color: '#FFB400' }]}>⚠️ EARLY / ANTICIPATORY SIGNAL</Text>
            <Text style={[styles.biasValue, { color: '#FFB400', fontSize: 12, fontWeight: '600' }]}>
              {signal.pre_signal_note || 'BOS/CHOCH not yet confirmed — enter with reduced size or wait.'}
            </Text>
          </View>
        </View>
      )}

      {/* ── Trade params grid ── */}
      <View style={styles.priceGrid}>
        {[
          { label: "ENTRY",       value: signal.entry,              color: Colors.text   },
          { label: "STOP LOSS",   value: signal.stop_loss,          color: Colors.red    },
        ].map(({ label, value, color }) => (
          <View key={label} style={styles.priceCard}>
            <Text style={styles.priceLabel}>{label}</Text>
            <Text style={[styles.priceValue, { color }]}>{value}</Text>
          </View>
        ))}
      </View>

      {/* ── TP Ladder ── */}
      <View style={[styles.priceGrid, { marginTop: 0 }]}>
        {[
          { label: "TP1 (50% exit)", value: signal.take_profit_1 || signal.take_profit, rr: signal.rr_1 || signal.risk_reward, color: Colors.green },
          { label: "TP2 ★ MAIN (30%)", value: signal.take_profit_2 || signal.take_profit, rr: signal.rr_2 || signal.risk_reward, color: Colors.green },
          { label: "TP3 RUNNER (20%)", value: signal.take_profit_3, rr: signal.rr_3, color: '#7fffaa' },
        ].filter(t => t.value).map(({ label, value, rr, color }) => (
          <View key={label} style={[styles.priceCard, { borderColor: 'rgba(0,200,100,0.2)' }]}>
            <Text style={styles.priceLabel}>{label}</Text>
            <Text style={[styles.priceValue, { color, fontSize: 16 }]}>{value}</Text>
            {rr ? <Text style={{ fontSize: 11, color: Colors.muted, marginTop: 2 }}>1:{rr}</Text> : null}
          </View>
        ))}
      </View>

      {/* ── HTF Bias banner ── */}
      <View style={[styles.biasBanner, {
        borderColor: signal.htf_bias === "BULLISH" ? Colors.green
                   : signal.htf_bias === "BEARISH" ? Colors.red
                   : Colors.border
      }]}>
        <View>
          <Text style={styles.biasLabel}>HTF BIAS</Text>
          <Text style={[styles.biasValue, {
            color: signal.htf_bias === "BULLISH" ? Colors.green
                 : signal.htf_bias === "BEARISH" ? Colors.red
                 : Colors.muted
          }]}>
            {signal.htf_bias}
          </Text>
        </View>
        <View style={styles.biasTFGroup}>
          <Text style={styles.biasTFLabel}>HTF</Text>
          <Text style={styles.biasTFValue}>{signal.htf_timeframe}</Text>
          <Text style={styles.biasTFSep}>·</Text>
          <Text style={styles.biasTFLabel}>ENTRY</Text>
          <Text style={styles.biasTFValue}>{signal.timeframe}</Text>
        </View>
      </View>

      {/* ── Confluences ── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>CONFLUENCES ({signal.confluences.length})</Text>
        {signal.confluences.length === 0 ? (
          <Text style={styles.noConfl}>No confluences recorded for this signal.</Text>
        ) : (
          signal.confluences.map((raw: string) => {
            const { icon, label, desc } = getConfluenceMeta(raw);
            return (
              <View key={raw} style={styles.conflCard}>
                <View style={styles.conflIconWrap}>
                  <Text style={styles.conflIcon}>{icon}</Text>
                </View>
                <View style={styles.conflBody}>
                  <Text style={styles.conflLabel}>{label}</Text>
                  {desc ? <Text style={styles.conflDesc}>{desc}</Text> : null}
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* ── AI Analysis ── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>AI ANALYSIS</Text>
        <View style={styles.analysisBox}>
          {explLoading ? (
            <View style={styles.analysisLoading}>
              <ActivityIndicator color={Colors.accentPurple} size="small" />
              <Text style={styles.analysisLoadingText}>Generating trade analysis...</Text>
            </View>
          ) : explError || !explanation ? (
            <View style={styles.analysisError}>
              <Text style={styles.analysisErrorIcon}>⚠️</Text>
              <Text style={styles.analysisErrorText}>
                Analysis unavailable. Check your connection or try again.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.analysisMeta}>
                <Text style={styles.analysisMetaText}>
                  {parsePair(signal.pair)} · {signal.type === "BUY" ? "🟢 Long" : "🔴 Short"} · {signal.confidence_score}% confidence
                </Text>
              </View>
              <Text style={styles.analysisText}>{explanation}</Text>
            </>
          )}
        </View>
      </View>

      {/* ── Actions ── */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.watchBtn, watched && styles.watchBtnActive]}
          onPress={handleWatchlist}
          activeOpacity={0.8}
        >
          <Text style={[styles.watchBtnText, watched && styles.watchBtnTextActive]}>
            {watched ? "👁 Watching — Tap to Remove" : "👁 Add to Watchlist"}
          </Text>
        </TouchableOpacity>
        {watched && (
          <TouchableOpacity
            style={styles.viewWatchlistBtn}
            onPress={() => router.push("/(tabs)/history")}
            activeOpacity={0.8}
          >
            <Text style={styles.viewWatchlistBtnText}>View in Watchlist →</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={{ height: 52 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: Colors.bg },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg },

  navRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 8,
  },
  backBtn:      { paddingVertical: 8, paddingRight: 16 },
  backBtnText:  { color: Colors.accent, fontSize: 14, fontWeight: "700" },
  shareBtn:     { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: Colors.border },
  shareBtnText: { color: Colors.muted, fontSize: 12, fontWeight: "600" },

  pairRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 20, paddingBottom: 20,
  },
  pair:      { fontSize: 28, fontWeight: "800", color: Colors.text, letterSpacing: -0.5 },
  typeBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  typeText:  { fontSize: 13, fontWeight: "800" },

  section:      { paddingHorizontal: 20, paddingBottom: 24 },
  sectionLabel: { fontSize: 11, color: Colors.muted, letterSpacing: 2, fontWeight: "700", marginBottom: 14 },

  priceGrid: {
    flexDirection: "row", flexWrap: "wrap",
    paddingHorizontal: 16, gap: 10, marginBottom: 20,
  },
  priceCard: {
    flex: 1, minWidth: "45%",
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, padding: 14,
  },
  priceLabel: { fontSize: 10, color: Colors.muted, letterSpacing: 1.5, fontWeight: "700", marginBottom: 6 },
  priceValue: { fontSize: 18, fontWeight: "800", letterSpacing: -0.5 },

  biasBanner: {
    marginHorizontal: 20, marginBottom: 24, padding: 16, borderRadius: 12,
    borderWidth: 1.5, backgroundColor: Colors.surface,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  biasLabel:   { fontSize: 10, color: Colors.muted, letterSpacing: 2, fontWeight: "700", marginBottom: 4 },
  biasValue:   { fontSize: 20, fontWeight: "800", letterSpacing: 1 },
  biasTFGroup: { flexDirection: "row", alignItems: "center", gap: 5 },
  biasTFLabel: { fontSize: 10, color: Colors.muted, fontWeight: "700", letterSpacing: 1 },
  biasTFValue: { fontSize: 12, color: Colors.text, fontWeight: "700" },
  biasTFSep:   { fontSize: 12, color: Colors.muted },

  noConfl:  { fontSize: 13, color: Colors.muted, fontStyle: "italic" },
  conflCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, padding: 12, marginBottom: 8,
  },
  conflIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(0,212,255,0.08)",
    alignItems: "center", justifyContent: "center",
  },
  conflIcon:  { fontSize: 18 },
  conflBody:  { flex: 1 },
  conflLabel: { fontSize: 14, fontWeight: "700", color: Colors.text, marginBottom: 2 },
  conflDesc:  { fontSize: 12, color: Colors.muted, lineHeight: 18 },

  analysisBox: {
    backgroundColor: Colors.surface, borderWidth: 1,
    borderColor: Colors.accentPurple + "55", borderRadius: 14, padding: 16,
  },
  analysisLoading:     { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  analysisLoadingText: { color: Colors.muted, fontSize: 13 },
  analysisError:       { alignItems: "center", paddingVertical: 12, gap: 8 },
  analysisErrorIcon:   { fontSize: 28 },
  analysisErrorText:   { fontSize: 13, color: Colors.muted, textAlign: "center", lineHeight: 20 },
  analysisMeta: {
    backgroundColor: "rgba(0,212,255,0.06)", borderRadius: 8,
    padding: 8, marginBottom: 12,
  },
  analysisMetaText: { fontSize: 12, color: Colors.accent, fontWeight: "700", letterSpacing: 0.3 },
  analysisText: { fontSize: 14, color: Colors.text, lineHeight: 24 },

  actions: { paddingHorizontal: 20, gap: 10 },
  watchBtn: {
    backgroundColor: Colors.surface, borderWidth: 1.5,
    borderColor: Colors.accent, borderRadius: 12,
    padding: 16, alignItems: "center",
  },
  watchBtnActive:      { backgroundColor: "rgba(0,212,255,0.12)" },
  watchBtnText:        { color: Colors.accent, fontSize: 14, fontWeight: "800" },
  watchBtnTextActive:  { color: Colors.accent },
  viewWatchlistBtn:    { backgroundColor: Colors.accent, borderRadius: 12, padding: 16, alignItems: "center" },
  viewWatchlistBtnText:{ color: "#000", fontSize: 14, fontWeight: "800" },
});