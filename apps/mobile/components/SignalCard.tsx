// LOCATION: apps/mobile/components/SignalCard.tsx

import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Colors } from "../utils/theme";
import ConfidenceBar from "./ConfidenceBar";
import type { SMCSignal } from "../services/api";

interface Props {
  signal:  SMCSignal;
  onPress: () => void;
}

// Full names shown on the card chips (short but readable)
const CONFLUENCE_SHORT: Record<string, string> = {
  "Liquidity Sweep":  "Liquidity Sweep",
  "Order Block Tap":  "Order Block",
  "BOS/CHOCH":        "BOS / CHoCH",
  "Fair Value Gap":   "FVG",
  "HTF Bias Aligned": "HTF Aligned",
  "Displacement":     "Displacement",
  "Premium Zone":     "Premium Zone",
  "Discount Zone":    "Discount Zone",
};

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function isNew(ts: number): boolean {
  return Date.now() - ts < 10 * 60 * 1000;
}

function confidenceColor(score: number): string {
  if (score >= 80) return Colors.green;
  if (score >= 60) return Colors.caution;
  return Colors.red;
}

function parsePair(pair: string): { base: string; quote: string } {
  if (pair.endsWith("USDT")) return { base: pair.replace("USDT", ""), quote: "USDT" };
  if (pair.endsWith("BTC"))  return { base: pair.replace("BTC", ""),  quote: "BTC"  };
  if (pair.endsWith("ETH"))  return { base: pair.replace("ETH", ""),  quote: "ETH"  };
  return { base: pair, quote: "" };
}

export default function SignalCard({ signal, onPress }: Props) {
  const isBuy     = signal.type === "BUY";
  const newSignal = isNew(signal.timestamp);
  const { base, quote } = parsePair(signal.pair);

  // Normalise confluences — sometimes arrives as comma-packed string
  const confluences: string[] = Array.isArray(signal.confluences)
    ? signal.confluences
    : (signal.confluences as unknown as string)?.split(",").map((c: string) => c.trim()) ?? [];

  return (
    <TouchableOpacity
      style={[styles.card, { borderLeftColor: isBuy ? Colors.green : Colors.red }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* ── Top row: pair / direction / age ── */}
      <View style={styles.topRow}>
        <View style={styles.pairWrap}>
          <Text style={styles.pair}>{base}</Text>
          <Text style={styles.pairQuote}>/{quote}</Text>
          {newSignal && (
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>NEW</Text>
            </View>
          )}
        </View>

        <View style={[styles.badge, isBuy ? styles.badgeBuy : styles.badgeSell]}>
          <Text style={[styles.badgeText, { color: isBuy ? Colors.green : Colors.red }]}>
            {isBuy ? "🟢 LONG" : "🔴 SHORT"}
          </Text>
        </View>

        <Text style={styles.time}>{timeAgo(signal.timestamp)}</Text>
      </View>

      {/* ── Confidence bar ── */}
      <ConfidenceBar score={signal.confidence_score} />

      {/* ── HTF bias + timeframe ── */}
      <View style={styles.htfRow}>
        <Text style={styles.htfLabel}>HTF {signal.htf_timeframe}</Text>
        <Text style={[styles.htfValue, {
          color: signal.htf_bias === "BULLISH" ? Colors.green
               : signal.htf_bias === "BEARISH" ? Colors.red
               : Colors.muted
        }]}>
          {signal.htf_bias}
        </Text>
        <Text style={styles.htfSep}>·</Text>
        <Text style={styles.htfLabel}>{signal.timeframe} entry</Text>
      </View>

      {/* ── Confluences — full readable names ── */}
      {confluences.length > 0 && (
        <View style={styles.conflRow}>
          {confluences.map((c) => (
            <View key={c} style={styles.conflChip}>
              <Text style={styles.conflChipText}>
                {CONFLUENCE_SHORT[c] ?? c}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Bottom row: RR / entry / score / CTA ── */}
      <View style={styles.bottomRow}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>RR</Text>
          <Text style={styles.statValue}>1:{signal.risk_reward}</Text>
        </View>

        <View style={styles.statBox}>
          <Text style={styles.statLabel}>ENTRY</Text>
          <Text style={styles.statValue}>{signal.entry}</Text>
        </View>

        <Text style={[styles.confScore, { color: confidenceColor(signal.confidence_score) }]}>
          {signal.confidence_score}%
        </Text>

        <TouchableOpacity style={styles.analysisBtn} onPress={onPress}>
          <Text style={styles.analysisBtnText}>Analysis →</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    borderLeftWidth: 3,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },

  topRow:   { flexDirection: "row", alignItems: "center", gap: 8 },
  pairWrap: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  pair:     { fontSize: 18, fontWeight: "800", color: Colors.text, letterSpacing: -0.5 },
  pairQuote:{ fontSize: 12, color: Colors.muted },

  newBadge:     { backgroundColor: Colors.accent, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  newBadgeText: { fontSize: 9, fontWeight: "800", color: "#000", letterSpacing: 1 },

  badge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  badgeBuy:  { backgroundColor: "rgba(0,188,141,0.12)", borderColor: "rgba(0,200,150,0.3)" },
  badgeSell: { backgroundColor: "rgba(255,71,87,0.12)", borderColor: "rgba(255,71,87,0.3)" },
  badgeText: { fontSize: 11, fontWeight: "800" },
  time:      { fontSize: 11, color: Colors.muted },

  htfRow:  { flexDirection: "row", alignItems: "center", gap: 6 },
  htfLabel:{ fontSize: 11, color: Colors.muted, fontWeight: "600" },
  htfValue:{ fontSize: 11, fontWeight: "800" },
  htfSep:  { fontSize: 11, color: Colors.muted },

  conflRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  conflChip: {
    paddingHorizontal: 9, paddingVertical: 4,
    backgroundColor: "rgba(0,212,255,0.07)",
    borderRadius: 6, borderWidth: 1, borderColor: "rgba(0,212,255,0.2)",
  },
  conflChipText: { fontSize: 11, color: Colors.accent, fontWeight: "600" },

  bottomRow:  { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 2 },
  statBox:    { alignItems: "flex-start", minWidth: 48 },
  statLabel:  { fontSize: 9, color: Colors.muted, letterSpacing: 1, fontWeight: "700" },
  statValue:  { fontSize: 13, fontWeight: "700", color: Colors.text },
  confScore:  { fontSize: 14, fontWeight: "800", flex: 1, textAlign: "right" },

  analysisBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: "rgba(0,212,255,0.08)",
    borderRadius: 8, borderWidth: 1, borderColor: "rgba(0,212,255,0.25)",
  },
  analysisBtnText: { fontSize: 12, color: Colors.accent, fontWeight: "700" },
});