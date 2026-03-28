


// FILE: apps/mobile/components/ConfidenceBar.tsx
import { View, Text, StyleSheet } from "react-native";
import { Colors } from "../utils/theme";

interface Props {
  score: number;
  large?: boolean;
}

function getColor(score: number): string {
  if (score >= 80) return Colors.green;
  if (score >= 60) return Colors.accent; // was Colors.gold — use accent (cyan) as mid-tier
  return Colors.red;
}

export default function ConfidenceBar({ score, large = false }: Props) {
  const color = getColor(score);

  return (
    <View style={[styles.wrap, large && styles.wrapLarge]}>
      <View style={[styles.track, large && styles.trackLarge]}>
        <View
          style={[
            styles.fill,
            large && styles.fillLarge,
            { width: `${score}%` as `${number}%`, backgroundColor: color },
          ]}
        />
      </View>
      <Text style={[styles.label, large && styles.labelLarge, { color }]}>
        {score}%
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:       { flexDirection: "row", alignItems: "center", gap: 8 },
  wrapLarge:  { gap: 12 },
  track:      { flex: 1, height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: "hidden" },
  trackLarge: { height: 8, borderRadius: 4 },
  fill:       { height: "100%", borderRadius: 2 },
  fillLarge:  { borderRadius: 4 },
  label:      { fontSize: 12, fontWeight: "700", minWidth: 36 },
  labelLarge: { fontSize: 20, fontWeight: "800" },
});