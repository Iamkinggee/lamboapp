// FILE: apps/mobile/components/SignalCard.tsx
import {
  View, Text, StyleSheet, TouchableOpacity,
} from "react-native";
import { Colors } from "../utils/theme";
import ConfidenceBar from "./ConfidenceBar";
import type { SMCSignal } from "../services/api";

interface Props {
  signal:  SMCSignal;
  onPress: () => void;
}

const CONFLUENCE_ABBREVIATIONS: Record<string, string> = {
  "Liquidity Sweep":   "LIQ",
  "Order Block Tap":   "OB",
  "BOS/CHOCH":         "BOS",
  "Fair Value Gap":    "FVG",
  "HTF Bias Aligned":  "HTF",
  "Displacement":      "DISP",
  "Premium Zone":      "PREM",
  "Discount Zone":     "DISC",
};

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// Signal is "new" if it was published in the last 10 minutes
function isNew(ts: number): boolean {
  return Date.now() - ts < 10 * 60 * 1000;
}

function confidenceColor(score: number): string {
  if (score >= 80) return Colors.green;
  if (score >= 60) return Colors.caution;
  return Colors.red;
}

export default function SignalCard({ signal, onPress }: Props) {
  const isBuy   = signal.type === "BUY";
  const newSignal = isNew(signal.timestamp);

  return (
    <TouchableOpacity
      style={[styles.card, { borderLeftColor: isBuy ? Colors.green : Colors.red }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Top row */}
      <View style={styles.topRow}>
        <View style={styles.pairWrap}>
          <Text style={styles.pair}>{signal.pair.replace("USDT", "")}</Text>
          <Text style={styles.pairQuote}>/USDT</Text>
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

      {/* Confidence bar */}
      <View style={styles.confRow}>
        <ConfidenceBar score={signal.confidence_score} />
      </View>

      {/* HTF Bias */}
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

      {/* Confluence badges */}
      <View style={styles.confBadges}>
        {signal.confluences.map((c) => (
          <View key={c} style={styles.confBadge}>
            <Text style={styles.confBadgeText}>
              {CONFLUENCE_ABBREVIATIONS[c] ?? c.slice(0, 4).toUpperCase()}
            </Text>
          </View>
        ))}
      </View>

      {/* RR row */}
      <View style={styles.bottomRow}>
        <View style={styles.rrBox}>
          <Text style={styles.rrLabel}>RR</Text>
          <Text style={styles.rrValue}>1:{signal.risk_reward}</Text>
        </View>
        <View style={styles.entryBox}>
          <Text style={styles.entryLabel}>Entry</Text>
          <Text style={styles.entryValue}>{signal.entry}</Text>
        </View>
        <View style={styles.confScoreBox}>
          <Text style={[styles.confScore, { color: confidenceColor(signal.confidence_score) }]}>
            {signal.confidence_score}%
          </Text>
        </View>
        <TouchableOpacity style={styles.explainBtn} onPress={onPress}>
          <Text style={styles.explainText}>Analysis →</Text>
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

  confRow: {},
  confBadges: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  confBadge:  {
    paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: "rgba(0,212,255,0.08)",
    borderRadius: 4, borderWidth: 1, borderColor: "rgba(0,212,255,0.2)",
  },
  confBadgeText: { fontSize: 10, color: Colors.accent, fontWeight: "700", letterSpacing: 0.5 },

  bottomRow:   { flexDirection: "row", alignItems: "center", gap: 10 },
  rrBox:       { alignItems: "center" },
  rrLabel:     { fontSize: 9, color: Colors.muted, letterSpacing: 1, fontWeight: "700" },
  rrValue:     { fontSize: 13, fontWeight: "800", color: Colors.text },
  entryBox:    { flex: 1, alignItems: "flex-start" },
  entryLabel:  { fontSize: 9, color: Colors.muted, letterSpacing: 1, fontWeight: "700" },
  entryValue:  { fontSize: 13, fontWeight: "700", color: Colors.text },
  confScoreBox:{ alignItems: "center" },
  confScore:   { fontSize: 14, fontWeight: "800" },
  explainBtn:  {
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: "rgba(0,212,255,0.08)",
    borderRadius: 8, borderWidth: 1, borderColor: "rgba(0,212,255,0.25)",
  },
  explainText: { fontSize: 12, color: Colors.accent, fontWeight: "700" },
});