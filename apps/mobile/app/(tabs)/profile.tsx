



// FILE: apps/mobile/app/(tabs)/profile.tsx
import {
  View, Text, StyleSheet, TouchableOpacity, Switch,
  ScrollView, Alert,
} from "react-native";
import { router } from "expo-router";
import { useAuthStore } from "../../store/useAuthStore";
import { Colors } from "../../utils/theme";

const PAIRS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT"];

export default function ProfileScreen() {
  const { user, skillLevel, preferences, setSkillLevel, updatePreferences, logout } =
    useAuthStore();

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out", style: "destructive",
        onPress: async () => { await logout(); router.replace("/(auth)/sign-in"); },
      },
    ]);
  };

  const SettingRow = ({
    label, sub, children,
  }: { label: string; sub?: string; children: React.ReactNode }) => (
    <View style={styles.settingRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.settingLabel}>{label}</Text>
        {sub && <Text style={styles.settingSub}>{sub}</Text>}
      </View>
      {children}
    </View>
  );

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.email?.[0]?.toUpperCase() ?? "U"}
          </Text>
        </View>
        <Text style={styles.email}>{user?.email ?? ""}</Text>
        <View style={[styles.skillBadge, { borderColor: Colors.accent }]}>
          <Text style={[styles.skillBadgeText, { color: Colors.accent }]}>
            {(skillLevel ?? "beginner").toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Skill Level */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>SKILL LEVEL</Text>
        <View style={styles.skillRow}>
          {(["beginner", "intermediate", "advanced"] as const).map((level) => (
            <TouchableOpacity
              key={level}
              style={[styles.skillBtn, skillLevel === level && styles.skillBtnActive]}
              onPress={() => setSkillLevel(level)}
              activeOpacity={0.8}
            >
              <Text style={[styles.skillBtnText, skillLevel === level && styles.skillBtnTextActive]}>
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.skillHint}>
          {skillLevel === "beginner"
            ? "Simple explanations with analogies"
            : skillLevel === "intermediate"
            ? "Execution timing and entry model focus"
            : "Institutional logic and order flow analysis"}
        </Text>
      </View>

      {/* Notifications */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>NOTIFICATIONS</Text>
        <SettingRow label="High Confidence Signals" sub="Score ≥ 80%">
          <Switch
            value={preferences?.notifyHighConf ?? true}
            onValueChange={(v) => updatePreferences({ notifyHighConf: v })}
            trackColor={{ false: Colors.border, true: Colors.green }}
            thumbColor="#fff"
          />
        </SettingRow>
        <SettingRow label="All Signals" sub="Any score above threshold">
          <Switch
            value={preferences?.notifyAll ?? false}
            onValueChange={(v) => updatePreferences({ notifyAll: v })}
            trackColor={{ false: Colors.border, true: Colors.green }}
            thumbColor="#fff"
          />
        </SettingRow>
        <SettingRow label="HTF Bias Change" sub="Trend flip alerts">
          <Switch
            value={preferences?.notifyBiasChange ?? true}
            onValueChange={(v) => updatePreferences({ notifyBiasChange: v })}
            trackColor={{ false: Colors.border, true: Colors.green }}
            thumbColor="#fff"
          />
        </SettingRow>
        <SettingRow label="Daily Mentor Tip" sub="AI tip at 9 AM">
          <Switch
            value={preferences?.notifyDailyTip ?? true}
            onValueChange={(v) => updatePreferences({ notifyDailyTip: v })}
            trackColor={{ false: Colors.border, true: Colors.green }}
            thumbColor="#fff"
          />
        </SettingRow>
      </View>

      {/* Watched Pairs */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>WATCHED PAIRS</Text>
        <View style={styles.pairsGrid}>
          {PAIRS.map((pair) => {
            const watched = preferences?.watchedPairs?.includes(pair) ?? true;
            return (
              <TouchableOpacity
                key={pair}
                style={[styles.pairChip, watched && styles.pairChipActive]}
                onPress={() => {
                  const current = preferences?.watchedPairs ?? PAIRS;
                  const next = watched
                    ? current.filter((p: string) => p !== pair)
                    : [...current, pair];
                  updatePreferences({ watchedPairs: next });
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.pairChipText, watched && styles.pairChipTextActive]}>
                  {pair.replace("USDT", "")}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Risk Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>RISK SETTINGS</Text>
        <SettingRow label="Min Confidence Threshold" sub="Currently 65%">
          <Text style={styles.settingValue}>65%</Text>
        </SettingRow>
        <SettingRow label="Min Risk/Reward" sub="Minimum RR to accept">
          <Text style={styles.settingValue}>1:2</Text>
        </SettingRow>
      </View>

      {/* App info + sign out */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>APP</Text>
        <SettingRow label="Version" sub="">
          <Text style={styles.settingValue}>1.0.0</Text>
        </SettingRow>
        {/* <SettingRow label="Stack" sub="">
          <Text style={[styles.settingValue, { fontSize: 10 }]}>Groq · Supabase · AWS</Text>
        </SettingRow> */}
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { alignItems: "center", paddingTop: 60, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: Colors.border },
  avatar: { width: 64, height: 64, borderRadius: 20, backgroundColor: Colors.accentPurple, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  avatarText: { fontSize: 24, fontWeight: "800", color: "#fff" },
  email: { fontSize: 15, color: Colors.text, fontWeight: "600", marginBottom: 8 },
  skillBadge: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  skillBadgeText: { fontSize: 11, fontWeight: "800", letterSpacing: 1 },

  section: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8 },
  sectionTitle: { fontSize: 11, color: Colors.muted, letterSpacing: 2, fontWeight: "700", marginBottom: 12 },

  settingRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  settingLabel: { fontSize: 14, color: Colors.text, fontWeight: "600" },
  settingSub:   { fontSize: 12, color: Colors.muted, marginTop: 2 },
  settingValue: { fontSize: 13, color: Colors.accent, fontWeight: "700" },

  skillRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  skillBtn: { flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, alignItems: "center" },
  skillBtnActive: { borderColor: Colors.accent, backgroundColor: "rgba(0,212,255,0.1)" },
  skillBtnText: { fontSize: 12, color: Colors.muted, fontWeight: "700" },
  skillBtnTextActive: { color: Colors.accent },
  skillHint: { fontSize: 12, color: Colors.muted, lineHeight: 18 },

  pairsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  pairChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  pairChipActive: { borderColor: Colors.accent, backgroundColor: "rgba(0,212,255,0.1)" },
  pairChipText: { fontSize: 12, color: Colors.muted, fontWeight: "700" },
  pairChipTextActive: { color: Colors.accent },

  logoutBtn: { marginHorizontal: 20, marginTop: 20, padding: 16, borderRadius: 12, borderWidth: 1, backgroundColor: "rgba(255, 255, 255, 0.08)", alignItems: "center" },
  logoutText: {   color: Colors.textSecondary, fontSize: 14, fontWeight: "700" },
});