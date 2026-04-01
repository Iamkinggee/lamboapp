// // FILE: apps/mobile/app/(tabs)/history.tsx
// import {
//   View, Text, FlatList, StyleSheet, TouchableOpacity,
//   RefreshControl, Modal, TextInput, ActivityIndicator,
// } from "react-native";
// import { useState } from "react";
// import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
// import { fetchTrades, logTrade, type TradeOutcome } from "../../services/api";
// import { useAuthStore } from "../../store/useAuthStore";
// import { Colors } from "../../utils/theme";

// type Outcome = "win" | "loss" | "pending";

// export default function HistoryScreen() {
//   const qc    = useQueryClient();
//   const token = useAuthStore((s) => s.token);

//   const [showModal, setShowModal] = useState(false);
//   const [pair,      setPair]      = useState("BTCUSDT");
//   const [entry,     setEntry]     = useState("");
//   const [sl,        setSl]        = useState("");
//   const [tp,        setTp]        = useState("");
//   const [direction, setDirection] = useState<"BUY" | "SELL">("BUY");
//   const [outcome,   setOutcome]   = useState<Outcome>("pending");

//   const { data, isLoading, refetch } = useQuery({
//     queryKey: ["trades"],
//     queryFn:  () => fetchTrades(),
//     enabled:  !!token,  // ← don't fetch until token exists
//   });

//   const logMutation = useMutation({
//     mutationFn: logTrade,
//     onSuccess: () => {
//       qc.invalidateQueries({ queryKey: ["trades"] });
//       setShowModal(false);
//       resetForm();
//     },
//   });

//   const resetForm = () => {
//     setPair("BTCUSDT"); setEntry(""); setSl(""); setTp("");
//     setDirection("BUY"); setOutcome("pending");
//   };

//   const stats  = data?.stats  ?? { total: 0, wins: 0, losses: 0, win_rate: 0, avg_rr: 0 };
//   const trades = data?.trades ?? [];

//   const outcomeColor = (o: string) =>
//     o === "win" ? Colors.green : o === "loss" ? Colors.red : Colors.muted;
//   const outcomeLabel = (o: string) =>
//     o === "win" ? "WIN" : o === "loss" ? "LOSS" : o === "pending" ? "OPEN" : "B/E";

//   return (
//     <View style={styles.container}>
//       <View style={styles.header}>
//         <Text style={styles.title}>History</Text>
//         <TouchableOpacity style={styles.logBtn} onPress={() => setShowModal(true)} activeOpacity={0.8}>
//           <Text style={styles.logBtnText}>+ Log Trade</Text>
//         </TouchableOpacity>
//       </View>

//       <View style={styles.statsRow}>
//         {[
//           { label: "Total",    value: stats.total,          color: Colors.accent },
//           { label: "Wins",     value: stats.wins,           color: Colors.green  },
//           { label: "Win Rate", value: `${stats.win_rate}%`, color: stats.win_rate >= 50 ? Colors.green : Colors.red },
//           { label: "Losses",   value: stats.losses,         color: Colors.red    },
//         ].map(({ label, value, color }) => (
//           <View key={label} style={styles.statCard}>
//             <Text style={[styles.statValue, { color }]}>{value}</Text>
//             <Text style={styles.statLabel}>{label}</Text>
//           </View>
//         ))}
//       </View>

//       <FlatList
//         data={trades}
//         keyExtractor={(item) => item.id ?? `${item.pair}-${item.created_at}`}
//         renderItem={({ item }) => (
//           <View style={styles.tradeRow}>
//             <View style={styles.tradeLeft}>
//               <Text style={styles.tradePair}>{item.pair}</Text>
//               <View style={[styles.dirBadge, { backgroundColor: item.type === "BUY" ? "rgba(0,200,150,0.15)" : "rgba(255,71,87,0.15)" }]}>
//                 <Text style={[styles.dirBadgeText, { color: item.type === "BUY" ? Colors.green : Colors.red }]}>
//                   {item.type}
//                 </Text>
//               </View>
//             </View>
//             <View style={styles.tradeMid}>
//               <Text style={styles.tradeEntry}>{item.entry}</Text>
//               <Text style={styles.tradeDate}>
//                 {item.created_at ? new Date(item.created_at).toLocaleDateString() : "—"}
//               </Text>
//             </View>
//             <View style={[styles.outcomeBadge, { borderColor: outcomeColor(item.outcome.toLowerCase()) }]}>
//               <Text style={[styles.outcomeText, { color: outcomeColor(item.outcome.toLowerCase()) }]}>
//                 {outcomeLabel(item.outcome.toLowerCase())}
//               </Text>
//             </View>
//           </View>
//         )}
//         contentContainerStyle={styles.list}
//         showsVerticalScrollIndicator={false}
//         refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={Colors.accent} />}
//         ListEmptyComponent={
//           <View style={styles.emptyWrap}>
//             <Text style={styles.emptyIcon}>📊</Text>
//             <Text style={styles.emptyText}>No trades logged yet</Text>
//             <Text style={styles.emptySubText}>Tap "+ Log Trade" to record your first trade</Text>
//           </View>
//         }
//       />

//       <Modal visible={showModal} transparent animationType="slide">
//         <View style={styles.modalOverlay}>
//           <View style={styles.modal}>
//             <Text style={styles.modalTitle}>Log Trade</Text>
//             <Text style={styles.fieldLabel}>PAIR</Text>
//             <TextInput style={styles.fieldInput} value={pair} onChangeText={setPair}
//               placeholder="BTCUSDT" placeholderTextColor={Colors.muted} autoCapitalize="characters" />
//             <View style={styles.fieldRow}>
//               <View style={{ flex: 1 }}>
//                 <Text style={styles.fieldLabel}>ENTRY</Text>
//                 <TextInput style={styles.fieldInput} value={entry} onChangeText={setEntry}
//                   placeholder="67450" placeholderTextColor={Colors.muted} keyboardType="decimal-pad" />
//               </View>
//               <View style={{ flex: 1 }}>
//                 <Text style={styles.fieldLabel}>STOP LOSS</Text>
//                 <TextInput style={styles.fieldInput} value={sl} onChangeText={setSl}
//                   placeholder="66800" placeholderTextColor={Colors.muted} keyboardType="decimal-pad" />
//               </View>
//             </View>
//             <Text style={styles.fieldLabel}>TAKE PROFIT</Text>
//             <TextInput style={styles.fieldInput} value={tp} onChangeText={setTp}
//               placeholder="68900" placeholderTextColor={Colors.muted} keyboardType="decimal-pad" />
//             <Text style={styles.fieldLabel}>DIRECTION</Text>
//             <View style={styles.toggleRow}>
//               {(["BUY", "SELL"] as const).map((d) => (
//                 <TouchableOpacity key={d}
//                   style={[styles.toggleBtn, direction === d && { backgroundColor: d === "BUY" ? "rgba(0,200,150,0.2)" : "rgba(255,71,87,0.2)", borderColor: d === "BUY" ? Colors.green : Colors.red }]}
//                   onPress={() => setDirection(d)}>
//                   <Text style={[styles.toggleBtnText, direction === d && { color: d === "BUY" ? Colors.green : Colors.red }]}>{d}</Text>
//                 </TouchableOpacity>
//               ))}
//             </View>
//             <Text style={styles.fieldLabel}>OUTCOME</Text>
//             <View style={styles.toggleRow}>
//               {(["win", "loss", "pending"] as Outcome[]).map((o) => (
//                 <TouchableOpacity key={o}
//                   style={[styles.toggleBtn, outcome === o && { borderColor: outcomeColor(o), backgroundColor: `${outcomeColor(o)}22` }]}
//                   onPress={() => setOutcome(o)}>
//                   <Text style={[styles.toggleBtnText, outcome === o && { color: outcomeColor(o) }]}>{o.toUpperCase()}</Text>
//                 </TouchableOpacity>
//               ))}
//             </View>
//             <View style={styles.modalActions}>
//               <TouchableOpacity style={styles.saveBtn}
//                 onPress={() => logMutation.mutate({
//                   signal_id: "", pair, type: direction,
//                   entry: Number(entry), stop_loss: Number(sl), take_profit: Number(tp),
//                   risk_reward: 0, confidence_score: 0,
//                   outcome: outcome.toUpperCase() as TradeOutcome,
//                 })}
//                 disabled={logMutation.isPending}>
//                 {logMutation.isPending
//                   ? <ActivityIndicator color="#000" />
//                   : <Text style={styles.saveBtnText}>SAVE TRADE →</Text>}
//               </TouchableOpacity>
//               <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
//                 <Text style={styles.cancelBtnText}>Cancel</Text>
//               </TouchableOpacity>
//             </View>
//           </View>
//         </View>
//       </Modal>
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: { flex: 1, backgroundColor: Colors.bg },
//   header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 },
//   title:    { fontSize: 24, fontWeight: "800", color: Colors.text, letterSpacing: -0.5 },
//   logBtn:   { backgroundColor: Colors.accent, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
//   logBtnText: { color: "#000", fontSize: 12, fontWeight: "800" },
//   statsRow: { flexDirection: "row", paddingHorizontal: 16, gap: 10, marginBottom: 16 },
//   statCard: { flex: 1, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 12, alignItems: "center" },
//   statValue:{ fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
//   statLabel:{ fontSize: 10, color: Colors.muted, fontWeight: "600", marginTop: 2, letterSpacing: 1 },
//   list: { padding: 16, paddingTop: 0, gap: 8 },
//   tradeRow: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 14, gap: 12 },
//   tradeLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
//   tradePair: { fontSize: 14, fontWeight: "700", color: Colors.text },
//   dirBadge:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
//   dirBadgeText: { fontSize: 10, fontWeight: "800" },
//   tradeMid:  { flex: 1 },
//   tradeEntry:{ fontSize: 13, color: Colors.text, fontWeight: "600" },
//   tradeDate: { fontSize: 11, color: Colors.muted, marginTop: 2 },
//   outcomeBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
//   outcomeText:  { fontSize: 11, fontWeight: "800" },
//   emptyWrap: { alignItems: "center", paddingTop: 60 },
//   emptyIcon: { fontSize: 48, marginBottom: 16 },
//   emptyText: { fontSize: 18, fontWeight: "700", color: Colors.text, marginBottom: 8 },
//   emptySubText: { fontSize: 14, color: Colors.muted, textAlign: "center" },
//   modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
//   modal: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
//   modalTitle: { fontSize: 20, fontWeight: "800", color: Colors.text, marginBottom: 20 },
//   fieldLabel: { fontSize: 11, color: Colors.muted, letterSpacing: 2, marginBottom: 8, marginTop: 12, fontWeight: "600" },
//   fieldInput: { backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: 12, color: Colors.text, fontSize: 15 },
//   fieldRow:   { flexDirection: "row", gap: 12 },
//   toggleRow:  { flexDirection: "row", gap: 10 },
//   toggleBtn:  { flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg, alignItems: "center" },
//   toggleBtnText: { fontSize: 12, color: Colors.muted, fontWeight: "700" },
//   modalActions: { gap: 10, marginTop: 20 },
//   saveBtn:    { backgroundColor: Colors.accent, borderRadius: 12, padding: 16, alignItems: "center" },
//   saveBtnText:{ color: "#000", fontSize: 14, fontWeight: "800" },
//   cancelBtn:  { padding: 14, alignItems: "center" },
//   cancelBtnText: { color: Colors.muted, fontSize: 14 },
// });











// apps/mobile/app/(tabs)/history.tsx
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl, Modal, Alert, ScrollView,
} from "react-native";
import { useState, useEffect } from "react";
import { Colors } from "../../utils/theme";
import { useWatchlistStore, type WatchlistEntry, type CompletedTrade } from "../../store/useWatchlistStore";

type Tab = "watchlist" | "history";

// ── Outcome selector modal ────────────────────────────────────────────────────
function OutcomeModal({
  visible,
  entry,
  onClose,
  onConfirm,
}: {
  visible:   boolean;
  entry:     WatchlistEntry | null;
  onClose:   () => void;
  onConfirm: (outcome: "WIN" | "LOSS" | "BREAKEVEN") => void;
}) {
  if (!entry) return null;
  const signal = entry.signal;
  const isBuy  = signal.type === "BUY";

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>Close Trade</Text>
          <Text style={styles.modalSub}>
            {signal.pair} · {signal.type} · Entry {signal.entry}
          </Text>

          <Text style={styles.fieldLabel}>RESULT</Text>
          <View style={styles.outcomeRow}>
            {(["WIN", "LOSS", "BREAKEVEN"] as const).map((o) => (
              <TouchableOpacity
                key={o}
                style={[
                  styles.outcomeBtn,
                  o === "WIN"  && styles.outcomeBtnWin,
                  o === "LOSS" && styles.outcomeBtnLoss,
                  o === "BREAKEVEN" && styles.outcomeBtnBE,
                ]}
                onPress={() => onConfirm(o)}
                activeOpacity={0.8}
              >
                <Text style={[
                  styles.outcomeBtnText,
                  o === "WIN"  && { color: Colors.green },
                  o === "LOSS" && { color: Colors.red },
                  o === "BREAKEVEN" && { color: Colors.caution },
                ]}>
                  {o === "BREAKEVEN" ? "B/E" : o}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Watchlist item ────────────────────────────────────────────────────────────
function WatchlistItem({
  entry,
  onClose,
  onDelete,
}: {
  entry:    WatchlistEntry;
  onClose:  (entry: WatchlistEntry) => void;
  onDelete: (id: string) => void;
}) {
  const signal = entry.signal;
  const isBuy  = signal.type === "BUY";
  const age    = Math.floor((Date.now() - entry.addedAt) / 60000);
  const ageStr = age < 60 ? `${age}m ago` : `${Math.floor(age / 60)}h ago`;

  return (
    <View style={[styles.card, { borderLeftColor: isBuy ? Colors.green : Colors.red }]}>
      <View style={styles.cardTop}>
        <View style={styles.cardPairRow}>
          <Text style={styles.cardPair}>{signal.pair.replace("USDT", "")}</Text>
          <Text style={styles.cardPairQuote}>/USDT</Text>
          <View style={[styles.dirBadge, { backgroundColor: isBuy ? "rgba(0,200,150,0.15)" : "rgba(255,71,87,0.15)" }]}>
            <Text style={[styles.dirBadgeText, { color: isBuy ? Colors.green : Colors.red }]}>
              {isBuy ? "🟢 LONG" : "🔴 SHORT"}
            </Text>
          </View>
        </View>
        <Text style={styles.cardAge}>{ageStr}</Text>
      </View>

      <View style={styles.cardStats}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>ENTRY</Text>
          <Text style={styles.statValue}>{signal.entry}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>SL</Text>
          <Text style={[styles.statValue, { color: Colors.red }]}>{signal.stop_loss}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>TP</Text>
          <Text style={[styles.statValue, { color: Colors.green }]}>{signal.take_profit}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>RR</Text>
          <Text style={[styles.statValue, { color: Colors.accent }]}>1:{signal.risk_reward}</Text>
        </View>
      </View>

      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.closeTradeBtn}
          onPress={() => onClose(entry)}
          activeOpacity={0.8}
        >
          <Text style={styles.closeTradeBtnText}>Close Trade ✓</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() =>
            Alert.alert("Remove", "Remove from watchlist?", [
              { text: "Cancel", style: "cancel" },
              { text: "Remove", style: "destructive", onPress: () => onDelete(entry.id) },
            ])
          }
          activeOpacity={0.8}
        >
          <Text style={styles.deleteBtnText}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Completed trade item ──────────────────────────────────────────────────────
function CompletedItem({
  trade,
  onDelete,
}: {
  trade:    CompletedTrade;
  onDelete: (id: string) => void;
}) {
  const signal  = trade.signal;
  const isBuy   = signal.type === "BUY";
  const outcomeColor =
    trade.outcome === "WIN"       ? Colors.green  :
    trade.outcome === "LOSS"      ? Colors.red    : Colors.caution;
  const outcomeLabel =
    trade.outcome === "BREAKEVEN" ? "B/E" : trade.outcome;
  const date = new Date(trade.closedAt).toLocaleDateString();

  return (
    <View style={[styles.card, { borderLeftColor: outcomeColor }]}>
      <View style={styles.cardTop}>
        <View style={styles.cardPairRow}>
          <Text style={styles.cardPair}>{signal.pair.replace("USDT", "")}</Text>
          <Text style={styles.cardPairQuote}>/USDT</Text>
          <View style={[styles.dirBadge, { backgroundColor: isBuy ? "rgba(0,200,150,0.15)" : "rgba(255,71,87,0.15)" }]}>
            <Text style={[styles.dirBadgeText, { color: isBuy ? Colors.green : Colors.red }]}>
              {isBuy ? "LONG" : "SHORT"}
            </Text>
          </View>
        </View>
        <View style={[styles.outcomePill, { borderColor: outcomeColor }]}>
          <Text style={[styles.outcomePillText, { color: outcomeColor }]}>{outcomeLabel}</Text>
        </View>
      </View>

      <View style={styles.cardStats}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>ENTRY</Text>
          <Text style={styles.statValue}>{signal.entry}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>RR</Text>
          <Text style={[styles.statValue, { color: Colors.accent }]}>1:{signal.risk_reward}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>CONF</Text>
          <Text style={styles.statValue}>{signal.confidence_score}%</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>DATE</Text>
          <Text style={styles.statValue}>{date}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.deleteFullBtn}
        onPress={() =>
          Alert.alert("Delete", "Delete this trade record?", [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => onDelete(trade.id) },
          ])
        }
        activeOpacity={0.8}
      >
        <Text style={styles.deleteFullBtnText}>Delete Record</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function HistoryScreen() {
  const [activeTab, setActiveTab]           = useState<Tab>("watchlist");
  const [closingEntry, setClosingEntry]     = useState<WatchlistEntry | null>(null);

  const {
    watchlist, completedTrades,
    removeFromWatchlist, completeTrade, deleteCompletedTrade,
    hydrate,
  } = useWatchlistStore();

  useEffect(() => { hydrate(); }, []);

  // ── Stats for history tab ─────────────────────────────────────────────────
  const wins      = completedTrades.filter((t) => t.outcome === "WIN").length;
  const losses    = completedTrades.filter((t) => t.outcome === "LOSS").length;
  const total     = completedTrades.length;
  const winRate   = total > 0 ? Math.round((wins / total) * 100) : 0;

  const handleConfirmOutcome = async (outcome: "WIN" | "LOSS" | "BREAKEVEN") => {
    if (!closingEntry) return;
    await completeTrade(closingEntry.id, outcome);
    setClosingEntry(null);
    setActiveTab("history"); // switch to history tab after closing
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Trades</Text>
        <Text style={styles.headerSub}>
          {activeTab === "watchlist"
            ? `${watchlist.length} watching`
            : `${total} closed`}
        </Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(["watchlist", "history"] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === "watchlist" ? "👁 Watchlist" : "📊 History"}
            </Text>
            {tab === "watchlist" && watchlist.length > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{watchlist.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Watchlist Tab */}
      {activeTab === "watchlist" && (
        <FlatList
          data={watchlist}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <WatchlistItem
              entry={item}
              onClose={setClosingEntry}
              onDelete={removeFromWatchlist}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIcon}>👁</Text>
              <Text style={styles.emptyText}>No signals watched</Text>
              <Text style={styles.emptySubText}>
                Open any signal and tap "Add to Watchlist" to track it here
              </Text>
            </View>
          }
        />
      )}

      {/* History Tab */}
      {activeTab === "history" && (
        <>
          {/* Stats row */}
          {total > 0 && (
            <View style={styles.statsRow}>
              {[
                { label: "Total",    value: total,      color: Colors.accent },
                { label: "Wins",     value: wins,       color: Colors.green  },
                { label: "Win Rate", value: `${winRate}%`, color: winRate >= 50 ? Colors.green : Colors.red },
                { label: "Losses",   value: losses,     color: Colors.red    },
              ].map(({ label, value, color }) => (
                <View key={label} style={styles.statCard}>
                  <Text style={[styles.statCardValue, { color }]}>{value}</Text>
                  <Text style={styles.statCardLabel}>{label}</Text>
                </View>
              ))}
            </View>
          )}

          <FlatList
            data={completedTrades}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <CompletedItem trade={item} onDelete={deleteCompletedTrade} />
            )}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyIcon}>📊</Text>
                <Text style={styles.emptyText}>No closed trades yet</Text>
                <Text style={styles.emptySubText}>
                  Close a watchlisted trade to record your result here
                </Text>
              </View>
            }
          />
        </>
      )}

      {/* Outcome modal */}
      <OutcomeModal
        visible={!!closingEntry}
        entry={closingEntry}
        onClose={() => setClosingEntry(null)}
        onConfirm={handleConfirmOutcome}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12,
  },
  title:     { fontSize: 24, fontWeight: "800", color: Colors.text, letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: Colors.muted, fontWeight: "600" },

  tabs: {
    flexDirection: "row", marginHorizontal: 20, marginBottom: 12,
    backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 4,
  },
  tab: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    alignItems: "center", flexDirection: "row",
    justifyContent: "center", gap: 6,
  },
  tabActive:     { backgroundColor: Colors.bg },
  tabText:       { fontSize: 13, color: Colors.muted, fontWeight: "700" },
  tabTextActive: { color: Colors.text },
  tabBadge: {
    backgroundColor: Colors.accent, borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 1,
  },
  tabBadgeText: { fontSize: 10, color: "#000", fontWeight: "800" },

  list: { padding: 16, gap: 12 },

  // Card
  card: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderLeftWidth: 3, borderRadius: 14, padding: 14, gap: 10,
  },
  cardTop:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardPairRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardPair:    { fontSize: 17, fontWeight: "800", color: Colors.text },
  cardPairQuote:{ fontSize: 12, color: Colors.muted },
  cardAge:     { fontSize: 11, color: Colors.muted },

  dirBadge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  dirBadgeText:{ fontSize: 11, fontWeight: "800" },

  cardStats: { flexDirection: "row", gap: 0 },
  statItem:  { flex: 1 },
  statLabel: { fontSize: 9, color: Colors.muted, letterSpacing: 1.5, fontWeight: "700", marginBottom: 3 },
  statValue: { fontSize: 13, fontWeight: "700", color: Colors.text },

  cardActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  closeTradeBtn: {
    flex: 1, backgroundColor: "rgba(0,212,255,0.1)",
    borderWidth: 1, borderColor: Colors.accent,
    borderRadius: 8, paddingVertical: 10, alignItems: "center",
  },
  closeTradeBtnText: { color: Colors.accent, fontSize: 12, fontWeight: "800" },
  deleteBtn: {
    width: 40, backgroundColor: "rgba(255,71,87,0.1)",
    borderWidth: 1, borderColor: Colors.red,
    borderRadius: 8, alignItems: "center", justifyContent: "center",
  },
  deleteBtnText: { color: Colors.red, fontSize: 14, fontWeight: "800" },

  outcomePill: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1,
  },
  outcomePillText: { fontSize: 11, fontWeight: "800" },

  deleteFullBtn: {
    marginTop: 4, padding: 10, borderRadius: 8,
    borderWidth: 1, borderColor: "rgba(255,71,87,0.3)",
    alignItems: "center",
  },
  deleteFullBtnText: { color: Colors.red, fontSize: 12, fontWeight: "700" },

  // Stats row
  statsRow: { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 4 },
  statCard: {
    flex: 1, backgroundColor: Colors.surface, borderWidth: 1,
    borderColor: Colors.border, borderRadius: 12, padding: 12, alignItems: "center",
  },
  statCardValue: { fontSize: 20, fontWeight: "800", letterSpacing: -0.5 },
  statCardLabel: { fontSize: 9, color: Colors.muted, fontWeight: "700", marginTop: 2, letterSpacing: 1 },

  // Empty
  emptyWrap:    { alignItems: "center", paddingTop: 70 },
  emptyIcon:    { fontSize: 48, marginBottom: 16 },
  emptyText:    { fontSize: 18, fontWeight: "700", color: Colors.text, marginBottom: 8 },
  emptySubText: { fontSize: 14, color: Colors.muted, textAlign: "center", lineHeight: 22, paddingHorizontal: 32 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  modal: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24,
    borderTopRightRadius: 24, padding: 24, paddingBottom: 44,
  },
  modalTitle: { fontSize: 20, fontWeight: "800", color: Colors.text, marginBottom: 6 },
  modalSub:   { fontSize: 13, color: Colors.muted, marginBottom: 20 },
  fieldLabel: { fontSize: 11, color: Colors.muted, letterSpacing: 2, fontWeight: "700", marginBottom: 12 },
  outcomeRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  outcomeBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.bg, alignItems: "center",
  },
  outcomeBtnWin:  { borderColor: Colors.green, backgroundColor: "rgba(0,200,150,0.1)" },
  outcomeBtnLoss: { borderColor: Colors.red,   backgroundColor: "rgba(255,71,87,0.1)"  },
  outcomeBtnBE:   { borderColor: Colors.caution, backgroundColor: "rgba(255,215,0,0.1)" },
  outcomeBtnText: { fontSize: 13, fontWeight: "800", color: Colors.muted },
  cancelBtn:  { padding: 14, alignItems: "center" },
  cancelBtnText: { color: Colors.muted, fontSize: 14 },
});