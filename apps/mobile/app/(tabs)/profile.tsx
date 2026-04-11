// FILE: apps/mobile/app/(tabs)/profile.tsx
// Redesigned: removed skill level, avatar icon, watched pairs.
// Added: live session info, trade performance stats, signal engine status,
//        risk settings (editable), app build info, sign out.

import {
  View, Text, StyleSheet, TouchableOpacity, Switch,
  ScrollView, Alert, ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "../../store/useAuthStore";
import { useSignalStore } from "../../store/useSignalStore";
import { fetchTrades } from "../../services/api";
import { Colors } from "../../utils/theme";

// ── Small reusable row ────────────────────────────────────────
function Row({
  label, sub, children,
}: { label: string; sub?: string; children?: React.ReactNode }) {
  return (
    <View style={s.row}>
      <View style={{ flex: 1 }}>
        <Text style={s.rowLabel}>{label}</Text>
        {sub ? <Text style={s.rowSub}>{sub}</Text> : null}
      </View>
      {children}
    </View>
  );
}

// ── Stat box ──────────────────────────────────────────────────
function StatBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={s.statBox}>
      <Text style={[s.statValue, color ? { color } : {}]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

// ── Section wrapper ───────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.sectionCard}>{children}</View>
    </View>
  );
}

export default function ProfileScreen() {
  const { user, preferences, updatePreferences, logout } = useAuthStore();
  const isConnected  = useSignalStore((s) => s.isConnected);
  const allSignals   = useSignalStore((s) => s.signals);
  const activeCount  = useSignalStore((s) => s.filtered().length);

  const { data: tradeData, isLoading: statsLoading } = useQuery({
    queryKey:  ["trade-stats"],
    queryFn:   () => fetchTrades({ limit: 200 }),
    staleTime: 60_000,
  });

  const stats   = tradeData?.stats;
  const resolved = allSignals.filter(s => s.status !== "ACTIVE");
  const tpHits   = resolved.filter(s => s.status === "TP_HIT").length;
  const slHits   = resolved.filter(s => s.status === "SL_HIT").length;

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out", style: "destructive",
        onPress: async () => { await logout(); router.replace("/(auth)/sign-in"); },
      },
    ]);
  };

  return (
    <ScrollView style={s.container} showsVerticalScrollIndicator={false}>

      {/* ── Account header ── */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.email}>{user?.email ?? "—"}</Text>
          <View style={[s.sessionBadge, { borderColor: isConnected ? Colors.green : Colors.red }]}>
            <View style={[s.sessionDot, { backgroundColor: isConnected ? Colors.green : Colors.red }]} />
            <Text style={[s.sessionText, { color: isConnected ? Colors.green : Colors.red }]}>
              {isConnected ? "LIVE" : "DISCONNECTED"}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={s.signOutInline} onPress={handleLogout} activeOpacity={0.8}>
          <Text style={s.signOutInlineText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {/* ── Signal Performance (session) ── */}
      <Section title="SESSION PERFORMANCE">
        <View style={s.statsRow}>
          <StatBox label="Active" value={String(activeCount)} color={Colors.accent} />
          <StatBox label="TP Hits" value={String(tpHits)} color={Colors.green} />
          <StatBox label="SL Hits" value={String(slHits)} color={Colors.red} />
          <StatBox label="Total" value={String(allSignals.length)} />
        </View>
        <View style={s.divider} />
        {statsLoading ? (
          <View style={s.statsLoading}>
            <ActivityIndicator size="small" color={Colors.accent} />
            <Text style={s.statsLoadingText}>Loading trade stats…</Text>
          </View>
        ) : stats ? (
          <View style={s.statsRow}>
            <StatBox
              label="Win Rate"
              value={`${stats.win_rate?.toFixed(0) ?? "—"}%`}
              color={
                stats.win_rate >= 60 ? Colors.green
                : stats.win_rate >= 45 ? Colors.caution
                : Colors.red
              }
            />
            <StatBox label="Trades" value={String(stats.total ?? 0)} />
            <StatBox label="Wins"   value={String(stats.wins  ?? 0)} color={Colors.green} />
            <StatBox label="Avg RR" value={stats.avg_rr ? `1:${stats.avg_rr.toFixed(1)}` : "—"} color={Colors.accent} />
          </View>
        ) : (
          <Text style={s.noStats}>Log trades to see performance metrics</Text>
        )}
      </Section>

      {/* ── Notifications ── */}
      <Section title="NOTIFICATIONS">
        <Row label="High Confidence Signals" sub="Score ≥ 80% only">
          <Switch
            value={preferences?.notifyHighConf ?? true}
            onValueChange={(v) => updatePreferences({ notifyHighConf: v })}
            trackColor={{ false: Colors.border, true: Colors.green }}
            thumbColor="#fff"
          />
        </Row>
        <Row label="All Signals" sub="Every signal above threshold">
          <Switch
            value={preferences?.notifyAll ?? false}
            onValueChange={(v) => updatePreferences({ notifyAll: v })}
            trackColor={{ false: Colors.border, true: Colors.green }}
            thumbColor="#fff"
          />
        </Row>
        <Row label="Anticipatory Alerts" sub="Early warning before BOS confirms">
          <Switch
            value={preferences?.notifyAnticipatory ?? true}
            onValueChange={(v) => updatePreferences({ notifyAnticipatory: v })}
            trackColor={{ false: Colors.border, true: Colors.caution }}
            thumbColor="#fff"
          />
        </Row>
        <Row label="HTF Bias Change" sub="Trend flip on 1H / 4H">
          <Switch
            value={preferences?.notifyBiasChange ?? true}
            onValueChange={(v) => updatePreferences({ notifyBiasChange: v })}
            trackColor={{ false: Colors.border, true: Colors.green }}
            thumbColor="#fff"
          />
        </Row>
        <Row label="Daily Market Brief" sub="AI summary at 9 AM">
          <Switch
            value={preferences?.notifyDailyTip ?? true}
            onValueChange={(v) => updatePreferences({ notifyDailyTip: v })}
            trackColor={{ false: Colors.border, true: Colors.green }}
            thumbColor="#fff"
          />
        </Row>
      </Section>

      {/* ── Risk Settings ── */}
      <Section title="RISK SETTINGS">
        <Row label="Min Confidence Threshold" sub="Signals below this are filtered">
          <Text style={s.settingValue}>65%</Text>
        </Row>
        <Row label="Min Risk / Reward" sub="Minimum RR2 (main target) to publish">
          <Text style={s.settingValue}>1:2.0</Text>
        </Row>
        <Row label="TP1 Target" sub="Scalp / first partial exit">
          <Text style={s.settingValue}>1:2.0</Text>
        </Row>
        <Row label="TP2 Target" sub="Main swing target (30% of position)">
          <Text style={s.settingValue}>1:3.5</Text>
        </Row>
        <Row label="TP3 Target" sub="Runner — targets opposing liquidity">
          <Text style={s.settingValue}>1:5.5+</Text>
        </Row>
        <Row label="SL Buffer" sub="Beyond OB wick">
          <Text style={s.settingValue}>0.1%</Text>
        </Row>
      </Section>

      {/* ── Signal Engine Status ── */}
      <Section title="ENGINE STATUS">
        <Row label="WebSocket" sub="Real-time Binance feed">
          <View style={[s.engineBadge, { borderColor: isConnected ? Colors.green : Colors.red }]}>
            <Text style={[s.engineBadgeText, { color: isConnected ? Colors.green : Colors.red }]}>
              {isConnected ? "● LIVE" : "● OFFLINE"}
            </Text>
          </View>
        </Row>
        <Row label="Entry Timeframes" sub="3m + 5m LTF for entries">
          <Text style={s.settingValue}>3m / 5m</Text>
        </Row>
        <Row label="Bias Timeframes" sub="HTF structure analysis">
          <Text style={s.settingValue}>1H / 4H</Text>
        </Row>
        <Row label="Signal Cooldown" sub="Per-pair cooldown window">
          <Text style={s.settingValue}>90s</Text>
        </Row>
        <Row label="Anticipatory Cooldown" sub="Early alert cooldown">
          <Text style={s.settingValue}>45s</Text>
        </Row>
        <Row label="Pairs Monitored" sub="Active Binance USDT pairs">
          <Text style={s.settingValue}>80+</Text>
        </Row>
      </Section>

      {/* ── SMC Strategy Info ── */}
      <Section title="STRATEGY">
        <Row label="Liquidity Sweep" sub="30% weight — stop hunt detection" />
        <Row label="Order Block Tap" sub="25% weight — institutional zones" />
        <Row label="BOS / CHoCH"     sub="20% weight — structure confirmation" />
        <Row label="Fair Value Gap"  sub="15% weight — imbalance zones" />
        <Row label="HTF Bias Align"  sub="10% weight — trend confirmation" />
        <View style={s.stratNote}>
          <Text style={s.stratNoteText}>
            Anticipatory signals fire at ≥55 score (OB + Liq sweep) before BOS confirms. Confirmatory signals require ≥80 score with full confluence stack.
          </Text>
        </View>
      </Section>

      {/* ── App Info ── */}
      <Section title="APP">
        <Row label="Version">
          <Text style={s.settingValue}>1.0.0</Text>
        </Row>
        <Row label="Signal Model">
          <Text style={s.settingValue}>SMC v2</Text>
        </Row>
        <Row label="Data Source">
          <Text style={s.settingValue}>Binance WS</Text>
        </Row>
      </Section>

      {/* ── Sign out ── */}
      <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
        <Text style={s.logoutText}>Sign Out</Text>
      </TouchableOpacity>

      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  // Header
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerLeft:   { gap: 6 },
  email:        { fontSize: 16, fontWeight: "700", color: Colors.text },
  sessionBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, alignSelf: "flex-start" },
  sessionDot:   { width: 6, height: 6, borderRadius: 3 },
  sessionText:  { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  signOutInline:    { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.border },
  signOutInlineText:{ fontSize: 12, color: Colors.muted, fontWeight: "600" },

  // Section
  section:     { paddingHorizontal: 16, paddingTop: 20 },
  sectionTitle:{ fontSize: 10, color: Colors.muted, letterSpacing: 2, fontWeight: "700", marginBottom: 8, paddingHorizontal: 4 },
  sectionCard: { backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, overflow: "hidden" },

  // Row
  row: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: Colors.border + "88",
  },
  rowLabel: { fontSize: 14, color: Colors.text, fontWeight: "600" },
  rowSub:   { fontSize: 11, color: Colors.muted, marginTop: 2 },

  settingValue: { fontSize: 13, color: Colors.accent, fontWeight: "700" },

  // Stats grid
  statsRow: { flexDirection: "row", paddingVertical: 4 },
  statBox: {
    flex: 1, alignItems: "center", paddingVertical: 12,
  },
  statValue: { fontSize: 20, fontWeight: "800", color: Colors.text, marginBottom: 3 },
  statLabel: { fontSize: 9,  color: Colors.muted, fontWeight: "700", letterSpacing: 1 },
  divider:   { height: 1, backgroundColor: Colors.border + "88" },

  statsLoading:     { flexDirection: "row", alignItems: "center", gap: 10, padding: 16 },
  statsLoadingText: { fontSize: 13, color: Colors.muted },
  noStats:          { fontSize: 13, color: Colors.muted, padding: 16, textAlign: "center" },

  // Engine badge
  engineBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  engineBadgeText: { fontSize: 10, fontWeight: "800" },

  // Strategy note
  stratNote:     { margin: 14, marginTop: 4, padding: 12, backgroundColor: "rgba(0,212,255,0.04)", borderRadius: 8, borderWidth: 1, borderColor: "rgba(0,212,255,0.12)" },
  stratNoteText: { fontSize: 11, color: Colors.muted, lineHeight: 18 },

  // Logout
  logoutBtn: {
    margin: 16, marginTop: 20, padding: 16, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: "rgba(255,71,87,0.06)", alignItems: "center",
  },
  logoutText: { color: Colors.red, fontSize: 14, fontWeight: "700" },
});