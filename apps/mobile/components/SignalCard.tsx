// LOCATION: apps/mobile/components/SignalCard.tsx
// UPDATES:
//  - TP1/TP2/TP3 shown in bottom row with individual RR labels
//  - ANTICIPATORY badge on early-warning signals
//  - entry_model badge (ANTICIPATION vs CONFIRMATION)
//  - Cleaner RR display showing all 3 levels

import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Colors } from "../utils/theme";
import ConfidenceBar from "./ConfidenceBar";
import type { SMCSignal } from "../services/api";

interface Props {
  signal:  SMCSignal;
  onPress: () => void;
}

const CONFLUENCE_SHORT: Record<string, string> = {
  "Liquidity Sweep":         "Liq Sweep",
  "Bullish Order Block Tap": "Bullish OB",
  "Bearish Order Block Tap": "Bearish OB",
  "Order Block Tap":         "Order Block",
  "LTF Micro BOS Confirmed": "BOS ✓",
  "LTF CHOCH Detected":      "CHoCH ✓",
  "BOS/CHOCH":               "BOS / CHoCH",
  "Inside FVG Zone":         "FVG",
  "Fair Value Gap":          "FVG",
  "HTF Bias Aligned":        "HTF Aligned",
  "Displacement":            "Displacement",
  "Premium Zone":            "Premium",
  "Discount Zone":           "Discount",
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

function formatPrice(p: number): string {
  if (!p) return "—";
  if (p >= 10000) return p.toFixed(0);
  if (p >= 100)   return p.toFixed(2);
  if (p >= 1)     return p.toFixed(3);
  return p.toFixed(5);
}

export default function SignalCard({ signal, onPress }: Props) {
  const isBuy      = signal.type === "BUY";
  const newSignal  = isNew(signal.timestamp);
  const { base, quote } = parsePair(signal.pair);
  const isAnticipatory  = signal.is_anticipatory;
  const isConfirmation  = signal.entry_model === "CONFIRMATION";

  const confluences: string[] = Array.isArray(signal.confluences)
    ? signal.confluences
    : (signal.confluences as unknown as string)?.split(",").map((c: string) => c.trim()) ?? [];

  // TP display: use ladder if available, else legacy
  const tp1 = signal.take_profit_1 || 0;
  const tp2 = signal.take_profit_2 || signal.take_profit || 0;
  const tp3 = signal.take_profit_3 || 0;
  const rr1 = signal.rr_1 || 0;
  const rr2 = signal.rr_2 || signal.risk_reward || 0;
  const rr3 = signal.rr_3 || 0;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { borderLeftColor: isBuy ? Colors.green : Colors.red },
        isAnticipatory && styles.cardAnticipatory,
      ]}
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
          {isAnticipatory && (
            <View style={styles.antBadge}>
              <Text style={styles.antBadgeText}>⚠️ EARLY</Text>
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

      {/* ── HTF bias + entry model + timeframe ── */}
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
        <Text style={styles.htfSep}>·</Text>
        <View style={[styles.modelBadge, isConfirmation ? styles.modelConfirm : styles.modelAnticip]}>
          <Text style={[styles.modelText, { color: isConfirmation ? Colors.green : Colors.caution }]}>
            {isConfirmation ? "CONFIRMED" : "ANTICIPATORY"}
          </Text>
        </View>
      </View>

      {/* Anticipatory warning note */}
      {isAnticipatory && signal.pre_signal_note ? (
        <View style={styles.antNote}>
          <Text style={styles.antNoteText} numberOfLines={2}>{signal.pre_signal_note}</Text>
        </View>
      ) : null}

      {/* ── Confluences ── */}
      {confluences.length > 0 && (
        <View style={styles.conflRow}>
          {confluences.slice(0, 4).map((c) => (
            <View key={c} style={styles.conflChip}>
              <Text style={styles.conflChipText}>
                {CONFLUENCE_SHORT[c] ?? c}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Entry / SL row ── */}
      <View style={styles.entryRow}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>ENTRY</Text>
          <Text style={styles.statValue}>{formatPrice(signal.entry)}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>SL</Text>
          <Text style={[styles.statValue, { color: Colors.red }]}>{formatPrice(signal.stop_loss)}</Text>
        </View>
        <Text style={[styles.confScore, { color: confidenceColor(signal.confidence_score) }]}>
          {signal.confidence_score}%
        </Text>
      </View>

      {/* ── TP Ladder ── */}
      <View style={styles.tpLadder}>
        {tp1 > 0 && (
          <View style={styles.tpItem}>
            <Text style={styles.tpLabel}>TP1</Text>
            <Text style={styles.tpValue}>{formatPrice(tp1)}</Text>
            <Text style={styles.tpRR}>1:{rr1.toFixed(1)}</Text>
          </View>
        )}
        {tp2 > 0 && (
          <View style={[styles.tpItem, styles.tpItemMain]}>
            <Text style={[styles.tpLabel, { color: Colors.green }]}>TP2 ★</Text>
            <Text style={[styles.tpValue, { color: Colors.green }]}>{formatPrice(tp2)}</Text>
            <Text style={[styles.tpRR, { color: Colors.green }]}>1:{rr2.toFixed(1)}</Text>
          </View>
        )}
        {tp3 > 0 && (
          <View style={styles.tpItem}>
            <Text style={styles.tpLabel}>TP3</Text>
            <Text style={styles.tpValue}>{formatPrice(tp3)}</Text>
            <Text style={styles.tpRR}>1:{rr3.toFixed(1)}</Text>
          </View>
        )}
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
    padding: 14,
    gap: 8,
  },
  cardAnticipatory: {
    borderColor: "rgba(255,180,0,0.3)",
    backgroundColor: "rgba(255,180,0,0.03)",
  },

  topRow:   { flexDirection: "row", alignItems: "center", gap: 8 },
  pairWrap: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1, flexWrap: "wrap" },
  pair:     { fontSize: 18, fontWeight: "800", color: Colors.text, letterSpacing: -0.5 },
  pairQuote:{ fontSize: 12, color: Colors.muted },

  newBadge:     { backgroundColor: Colors.accent, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  newBadgeText: { fontSize: 9, fontWeight: "800", color: "#000", letterSpacing: 1 },

  antBadge:     { backgroundColor: "rgba(255,180,0,0.15)", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: "rgba(255,180,0,0.4)" },
  antBadgeText: { fontSize: 9, fontWeight: "800", color: "#FFB400", letterSpacing: 0.5 },

  badge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  badgeBuy:  { backgroundColor: "rgba(0,188,141,0.12)", borderColor: "rgba(0,200,150,0.3)" },
  badgeSell: { backgroundColor: "rgba(255,71,87,0.12)",  borderColor: "rgba(255,71,87,0.3)"  },
  badgeText: { fontSize: 11, fontWeight: "800" },
  time:      { fontSize: 11, color: Colors.muted },

  htfRow:  { flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" },
  htfLabel:{ fontSize: 10, color: Colors.muted, fontWeight: "600" },
  htfValue:{ fontSize: 10, fontWeight: "800" },
  htfSep:  { fontSize: 10, color: Colors.muted },

  modelBadge:   { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  modelConfirm: { backgroundColor: "rgba(0,200,100,0.08)", borderColor: "rgba(0,200,100,0.25)" },
  modelAnticip: { backgroundColor: "rgba(255,180,0,0.08)",  borderColor: "rgba(255,180,0,0.25)"  },
  modelText:    { fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },

  antNote:     { backgroundColor: "rgba(255,180,0,0.06)", borderRadius: 8, padding: 8, borderWidth: 1, borderColor: "rgba(255,180,0,0.2)" },
  antNoteText: { fontSize: 11, color: "#FFB400", lineHeight: 16 },

  conflRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  conflChip: {
    paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: "rgba(0,212,255,0.07)",
    borderRadius: 5, borderWidth: 1, borderColor: "rgba(0,212,255,0.2)",
  },
  conflChipText: { fontSize: 10, color: Colors.accent, fontWeight: "600" },

  entryRow:  { flexDirection: "row", alignItems: "center", gap: 10 },
  statBox:   { alignItems: "flex-start", minWidth: 60 },
  statLabel: { fontSize: 9, color: Colors.muted, letterSpacing: 1, fontWeight: "700" },
  statValue: { fontSize: 13, fontWeight: "700", color: Colors.text },
  confScore: { fontSize: 14, fontWeight: "800", flex: 1, textAlign: "right" },

  // TP Ladder
  tpLadder: {
    flexDirection: "row",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.2)",
    borderRadius: 8,
    padding: 8,
    marginTop: 2,
  },
  tpItem: {
    flex: 1, alignItems: "center",
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  tpItemMain: {
    backgroundColor: "rgba(0,200,100,0.06)",
    borderWidth: 1,
    borderColor: "rgba(0,200,100,0.2)",
  },
  tpLabel: { fontSize: 8,  fontWeight: "800", color: Colors.muted, letterSpacing: 1, marginBottom: 2 },
  tpValue: { fontSize: 11, fontWeight: "700", color: Colors.text },
  tpRR:    { fontSize: 9,  fontWeight: "600", color: Colors.muted, marginTop: 1 },
});