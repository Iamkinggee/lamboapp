

// FILE: apps/mobile/app/signal/[id].tsx
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Share,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
// import { apiFetchSignal, apiExplainSignal } from "../../services/api";
import { fetchSignalById, explainSignal } from "../../services/api";

import ConfidenceBar from "../../components/ConfidenceBar";
import { Colors } from "../../utils/theme";

export default function SignalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  // const { data: signal, isLoading } = useQuery({
  //   queryKey: ["signal", id],
  //   queryFn:  () => fetchSignalById(id!),
  //   enabled:  !!id,
  // });



  const { data, isLoading } = useQuery({
  queryKey: ["signal", id],
  queryFn:  () => fetchSignalById(id!),
  enabled:  !!id,
});

const signal = data?.signal; 


  // const { data: explanation, isLoading: explLoading } = useQuery({
  //   queryKey: ["signal-explain", id],
  //   queryFn:  () => explainSignal(id!),
  //   enabled:  !!id,
  // });


  const { data: explData, isLoading: explLoading } = useQuery({
  queryKey: ["signal-explain", id],
  queryFn:  () => explainSignal(id!),
  enabled:  !!id,
});
// then use: explData?.explanation

  if (isLoading || !signal) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={Colors.accent} size="large" />
      </View>
    );
  }

  const isBuy = signal.type === "BUY";

  const handleShare = async () => {
    await Share.share({
      message: `SMC Signal: ${signal.pair} ${signal.type}\nEntry: ${signal.entry} | SL: ${signal.stop_loss} | TP: ${signal.take_profit}\nRR: 1:${signal.risk_reward} | Confidence: ${signal.confidence_score}%\nConfluences: ${signal.confluences.join(", ")}`,
    });
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.heroLeft}>
          <Text style={styles.pair}>{signal.pair}</Text>
          <View style={[styles.typeBadge, { backgroundColor: isBuy ? "rgba(0,200,150,0.15)" : "rgba(255,71,87,0.15)", borderColor: isBuy ? Colors.green : Colors.red }]}>
            <Text style={[styles.typeText, { color: isBuy ? Colors.green : Colors.red }]}>
              {signal.type}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={handleShare} style={styles.shareBtn}>
          <Text style={styles.shareBtnText}>Share ↑</Text>
        </TouchableOpacity>
      </View>

      {/* Confidence */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>CONFIDENCE SCORE</Text>
        <ConfidenceBar score={signal.confidence_score} large />
      </View>

      {/* Trade params */}
      <View style={styles.priceGrid}>
        {[
          { label: "ENTRY",     value: signal.entry,       color: Colors.text  },
          { label: "STOP LOSS", value: signal.stop_loss,   color: Colors.red   },
          { label: "TAKE PROFIT",value: signal.take_profit, color: Colors.green },
          { label: "RISK/REWARD",value: `1:${signal.risk_reward}`, color: Colors.accent },
        ].map(({ label, value, color }) => (
          <View key={label} style={styles.priceCard}>
            <Text style={styles.priceLabel}>{label}</Text>
            <Text style={[styles.priceValue, { color }]}>{value}</Text>
          </View>
        ))}
      </View>

      {/* HTF Bias */}
      <View style={[styles.biasBanner, { borderColor: signal.htf_bias === "BULLISH" ? Colors.green : Colors.red }]}>
        <Text style={styles.biasLabel}>HTF BIAS</Text>
        <Text style={[styles.biasValue, { color: signal.htf_bias === "BULLISH" ? Colors.green : Colors.red }]}>
          {signal.htf_bias}
        </Text>
      </View>

      {/* Confluences */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>CONFLUENCES</Text>
        {signal.confluences.map((c: string) => (
          <View key={c} style={styles.conflRow}>
            <View style={styles.conflDot} />
            <Text style={styles.conflText}>{c}</Text>
          </View>
        ))}
      </View>

      {/* AI Explanation */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>AI EXPLANATION</Text>
        <View style={styles.explanationBox}>
          {explLoading ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <ActivityIndicator color={Colors.accentPurple} size="small" />
              <Text style={{ color: Colors.muted, fontSize: 13 }}>Generating explanation...</Text>
            </View>
          ) : (
            <Text style={styles.explanationText}>
              {explData?.explanation ?? signal.ai_explanation ?? "No explanation available."}
            </Text>
          )}
        </View>
      </View>

      {/* Log Trade Button */}
      <TouchableOpacity
        style={styles.logBtn}
        onPress={() => router.push("/(tabs)/history")}
        activeOpacity={0.8}
      >
        <Text style={styles.logBtnText}>Log This Trade →</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: Colors.bg },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.bg },

  hero: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 20,
  },
  heroLeft:  { flexDirection: "row", alignItems: "center", gap: 12 },
  pair:      { fontSize: 24, fontWeight: "800", color: Colors.text, letterSpacing: -0.5 },
  typeBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  typeText:  { fontSize: 13, fontWeight: "800" },
  shareBtn:  { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: Colors.border },
  shareBtnText: { color: Colors.muted, fontSize: 12, fontWeight: "600" },

  section: { paddingHorizontal: 20, paddingBottom: 20 },
  sectionLabel: { fontSize: 11, color: Colors.muted, letterSpacing: 2, fontWeight: "700", marginBottom: 12 },

  priceGrid: {
    flexDirection: "row", flexWrap: "wrap",
    paddingHorizontal: 16, gap: 10, marginBottom: 20,
  },
  priceCard: {
    flex: 1, minWidth: "45%",
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, padding: 14,
  },
  priceLabel:{ fontSize: 10, color: Colors.muted, letterSpacing: 1.5, fontWeight: "700", marginBottom: 6 },
  priceValue:{ fontSize: 18, fontWeight: "800", letterSpacing: -0.5 },

  biasBanner: {
    marginHorizontal: 20, marginBottom: 20, padding: 14, borderRadius: 12,
    borderWidth: 1, backgroundColor: Colors.surface,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  biasLabel: { fontSize: 11, color: Colors.muted, letterSpacing: 2, fontWeight: "700" },
  biasValue: { fontSize: 16, fontWeight: "800", letterSpacing: 1 },

  conflRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  conflDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.accent },
  conflText:{ fontSize: 14, color: Colors.text, fontWeight: "600" },

  explanationBox: {
    backgroundColor: Colors.surface, borderWidth: 1,
    borderColor: Colors.accentPurple + "44", borderRadius: 12, padding: 16,
  },
  explanationText: { fontSize: 14, color: Colors.text, lineHeight: 22 },

  logBtn: {
    marginHorizontal: 20, backgroundColor: Colors.accent,
    borderRadius: 12, padding: 16, alignItems: "center",
  },
  logBtnText: { color: "#000", fontSize: 14, fontWeight: "800" },
});