// FILE: apps/mobile/app/(tabs)/history.tsx
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl, Modal, TextInput, ActivityIndicator,
} from "react-native";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchTrades, logTrade, type TradeOutcome } from "../../services/api";
import { Colors } from "../../utils/theme";

type Outcome = "win" | "loss" | "pending";

export default function HistoryScreen() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [pair,      setPair]      = useState("BTCUSDT");
  const [entry,     setEntry]     = useState("");
  const [sl,        setSl]        = useState("");
  const [tp,        setTp]        = useState("");
  const [direction, setDirection] = useState<"BUY" | "SELL">("BUY");
  const [outcome,   setOutcome]   = useState<Outcome>("pending");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["trades"],
    queryFn:  () => fetchTrades(),
  });

  const logMutation = useMutation({
    mutationFn: logTrade,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trades"] });
      setShowModal(false);
      resetForm();
    },
  });

  const resetForm = () => {
    setPair("BTCUSDT"); setEntry(""); setSl(""); setTp("");
    setDirection("BUY"); setOutcome("pending");
  };

  const stats  = data?.stats  ?? { total: 0, wins: 0, losses: 0, win_rate: 0, avg_rr: 0 };
  const trades = data?.trades ?? [];

  const outcomeColor = (o: string) =>
    o === "win" ? Colors.green : o === "loss" ? Colors.red : Colors.muted;
  const outcomeLabel = (o: string) =>
    o === "win" ? "WIN" : o === "loss" ? "LOSS" : o === "pending" ? "OPEN" : "B/E";

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>History</Text>
        <TouchableOpacity
          style={styles.logBtn}
          onPress={() => setShowModal(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.logBtnText}>+ Log Trade</Text>
        </TouchableOpacity>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        {[
          { label: "Total",    value: stats.total,              color: Colors.accent },
          { label: "Wins",     value: stats.wins,               color: Colors.green  },
          { label: "Win Rate", value: `${stats.win_rate}%`,     color: stats.win_rate >= 50 ? Colors.green : Colors.red },
          { label: "Losses",   value: stats.losses,             color: Colors.red    },
        ].map(({ label, value, color }) => (
          <View key={label} style={styles.statCard}>
            <Text style={[styles.statValue, { color }]}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Trade list */}
      <FlatList
        data={trades}
        keyExtractor={(item) => item.id ?? `${item.pair}-${item.created_at}`}
        renderItem={({ item }) => (
          <View style={styles.tradeRow}>
            <View style={styles.tradeLeft}>
              <Text style={styles.tradePair}>{item.pair}</Text>
              <View style={[styles.dirBadge, { backgroundColor: item.type === "BUY" ? "rgba(0,200,150,0.15)" : "rgba(255,71,87,0.15)" }]}>
                <Text style={[styles.dirBadgeText, { color: item.type === "BUY" ? Colors.green : Colors.red }]}>
                  {item.type}
                </Text>
              </View>
            </View>
            <View style={styles.tradeMid}>
              <Text style={styles.tradeEntry}>{item.entry}</Text>
              <Text style={styles.tradeDate}>
                {item.created_at ? new Date(item.created_at).toLocaleDateString() : "—"}
              </Text>
            </View>
            <View style={[styles.outcomeBadge, { borderColor: outcomeColor(item.outcome.toLowerCase()) }]}>
              <Text style={[styles.outcomeText, { color: outcomeColor(item.outcome.toLowerCase()) }]}>
                {outcomeLabel(item.outcome.toLowerCase())}
              </Text>
            </View>
          </View>
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={Colors.accent} />
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>📊</Text>
            <Text style={styles.emptyText}>No trades logged yet</Text>
            <Text style={styles.emptySubText}>Tap "+ Log Trade" to record your first trade</Text>
          </View>
        }
      />

      {/* Log Trade Modal */}
      <Modal visible={showModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Log Trade</Text>

            <Text style={styles.fieldLabel}>PAIR</Text>
            <TextInput
              style={styles.fieldInput}
              value={pair}
              onChangeText={setPair}
              placeholder="BTCUSDT"
              placeholderTextColor={Colors.muted}
              autoCapitalize="characters"
            />

            <View style={styles.fieldRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>ENTRY</Text>
                <TextInput style={styles.fieldInput} value={entry} onChangeText={setEntry}
                  placeholder="67450" placeholderTextColor={Colors.muted} keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>STOP LOSS</Text>
                <TextInput style={styles.fieldInput} value={sl} onChangeText={setSl}
                  placeholder="66800" placeholderTextColor={Colors.muted} keyboardType="decimal-pad" />
              </View>
            </View>

            <Text style={styles.fieldLabel}>TAKE PROFIT</Text>
            <TextInput style={styles.fieldInput} value={tp} onChangeText={setTp}
              placeholder="68900" placeholderTextColor={Colors.muted} keyboardType="decimal-pad" />

            <Text style={styles.fieldLabel}>DIRECTION</Text>
            <View style={styles.toggleRow}>
              {(["BUY", "SELL"] as const).map((d) => (
                <TouchableOpacity key={d}
                  style={[styles.toggleBtn, direction === d && { backgroundColor: d === "BUY" ? "rgba(0,200,150,0.2)" : "rgba(255,71,87,0.2)", borderColor: d === "BUY" ? Colors.green : Colors.red }]}
                  onPress={() => setDirection(d)}>
                  <Text style={[styles.toggleBtnText, direction === d && { color: d === "BUY" ? Colors.green : Colors.red }]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>OUTCOME</Text>
            <View style={styles.toggleRow}>
              {(["win", "loss", "pending"] as Outcome[]).map((o) => (
                <TouchableOpacity key={o}
                  style={[styles.toggleBtn, outcome === o && { borderColor: outcomeColor(o), backgroundColor: `${outcomeColor(o)}22` }]}
                  onPress={() => setOutcome(o)}>
                  <Text style={[styles.toggleBtnText, outcome === o && { color: outcomeColor(o) }]}>{o.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={() =>
                  logMutation.mutate({
                    signal_id:        "",
                    pair,
                    type:             direction,
                    entry:            Number(entry),
                    stop_loss:        Number(sl),
                    take_profit:      Number(tp),
                    risk_reward:      0,
                    confidence_score: 0,
                    outcome:          outcome.toUpperCase() as TradeOutcome,
                  })
                }
                disabled={logMutation.isPending}
              >
                {logMutation.isPending
                  ? <ActivityIndicator color="#000" />
                  : <Text style={styles.saveBtnText}>SAVE TRADE →</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
  },
  title:    { fontSize: 24, fontWeight: "800", color: Colors.text, letterSpacing: -0.5 },
  logBtn:   { backgroundColor: Colors.accent, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  logBtnText: { color: "#000", fontSize: 12, fontWeight: "800" },

  statsRow: { flexDirection: "row", paddingHorizontal: 16, gap: 10, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 12, alignItems: "center" },
  statValue:{ fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  statLabel:{ fontSize: 10, color: Colors.muted, fontWeight: "600", marginTop: 2, letterSpacing: 1 },

  list: { padding: 16, paddingTop: 0, gap: 8 },
  tradeRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, padding: 14, gap: 12,
  },
  tradeLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  tradePair: { fontSize: 14, fontWeight: "700", color: Colors.text },
  dirBadge:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  dirBadgeText: { fontSize: 10, fontWeight: "800" },
  tradeMid:  { flex: 1 },
  tradeEntry:{ fontSize: 13, color: Colors.text, fontWeight: "600" },
  tradeDate: { fontSize: 11, color: Colors.muted, marginTop: 2 },
  outcomeBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  outcomeText:  { fontSize: 11, fontWeight: "800" },

  emptyWrap: { alignItems: "center", paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: "700", color: Colors.text, marginBottom: 8 },
  emptySubText: { fontSize: 14, color: Colors.muted, textAlign: "center" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modal: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: Colors.text, marginBottom: 20 },
  fieldLabel: { fontSize: 11, color: Colors.muted, letterSpacing: 2, marginBottom: 8, marginTop: 12, fontWeight: "600" },
  fieldInput: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: 12, color: Colors.text, fontSize: 15 },
  fieldRow:   { flexDirection: "row", gap: 12 },
  toggleRow:  { flexDirection: "row", gap: 10 },
  toggleBtn:  { flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg, alignItems: "center" },
  toggleBtnText: { fontSize: 12, color: Colors.muted, fontWeight: "700" },
  modalActions: { gap: 10, marginTop: 20 },
  saveBtn:    { backgroundColor: Colors.accent, borderRadius: 12, padding: 16, alignItems: "center" },
  saveBtnText:{ color: "#000", fontSize: 14, fontWeight: "800" },
  cancelBtn:  { padding: 14, alignItems: "center" },
  cancelBtnText: { color: Colors.muted, fontSize: 14 },
});