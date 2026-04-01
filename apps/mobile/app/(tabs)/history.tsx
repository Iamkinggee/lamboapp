// FILE: apps/mobile/app/(tabs)/history.tsx
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  Modal, Alert, ScrollView,
} from "react-native";
import { useState, useEffect, useCallback, useRef } from "react";
import { Colors } from "../../utils/theme";
import { useWatchlistStore, type WatchlistEntry, type CompletedTrade } from "../../store/useWatchlistStore";

type Tab = "watchlist" | "history";

// ── Outcome selector modal ────────────────────────────────────────────────────
function OutcomeModal({
  visible, entry, onClose, onConfirm,
}: {
  visible:   boolean;
  entry:     WatchlistEntry | null;
  onClose:   () => void;
  onConfirm: (outcome: "WIN" | "LOSS" | "BREAKEVEN") => void;
}) {
  if (!entry) return null;
  const signal = entry.signal;

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
                  o === "WIN"       && styles.outcomeBtnWin,
                  o === "LOSS"      && styles.outcomeBtnLoss,
                  o === "BREAKEVEN" && styles.outcomeBtnBE,
                ]}
                onPress={() => onConfirm(o)}
                activeOpacity={0.8}
              >
                <Text style={[
                  styles.outcomeBtnText,
                  o === "WIN"       && { color: Colors.green   },
                  o === "LOSS"      && { color: Colors.red     },
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
  entry, onClose, onDelete,
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
  trade, onDelete,
}: {
  trade:    CompletedTrade;
  onDelete: (id: string) => void;
}) {
  const signal = trade.signal;
  const isBuy  = signal.type === "BUY";
  const outcomeColor =
    trade.outcome === "WIN"  ? Colors.green  :
    trade.outcome === "LOSS" ? Colors.red    : Colors.caution;
  const outcomeLabel = trade.outcome === "BREAKEVEN" ? "B/E" : trade.outcome;
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
          {trade.autoResolved && (
            <View style={styles.autoBadge}>
              <Text style={styles.autoBadgeText}>AUTO</Text>
            </View>
          )}
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

      <View style={styles.historyMeta}>
        <View style={styles.historyMetaItem}>
          <Text style={styles.statLabel}>CONF</Text>
          <Text style={styles.statValue}>{signal.confidence_score}%</Text>
        </View>
        <View style={styles.historyMetaItem}>
          <Text style={styles.statLabel}>DATE</Text>
          <Text style={styles.statValue}>{date}</Text>
        </View>
        {trade.autoResolved && (
          <View style={styles.historyMetaItem}>
            <Text style={[styles.statLabel, { color: Colors.accent }]}>SOURCE</Text>
            <Text style={[styles.statValue, { color: Colors.accent, fontSize: 11 }]}>Price hit</Text>
          </View>
        )}
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
  const [activeTab, setActiveTab]       = useState<Tab>("watchlist");
  const [closingEntry, setClosingEntry] = useState<WatchlistEntry | null>(null);

  const {
    watchlist, completedTrades,
    removeFromWatchlist, completeTrade, deleteCompletedTrade,
    hydrate,
  } = useWatchlistStore();

  // FIX: hydrate() must only run ONCE on mount, not on every render.
  // The original code called hydrate() inside useEffect([]) correctly,
  // but also read `prevCompletedCount` from the store at the top level
  // without wiring it to any effect — dead code that did nothing.
  // Replaced with a ref-based approach that actually switches the tab
  // when a new auto-resolved trade arrives from the price monitor.
  const prevCountRef = useRef(completedTrades.length);

  useEffect(() => {
    hydrate();
  }, []); // intentional empty deps — run once on mount

  // FIX: Actually auto-switch to history when a new auto-resolved trade appears.
  // Compares against a ref (not state) so we don't cause extra renders.
  useEffect(() => {
    const newCount = completedTrades.length;
    if (newCount > prevCountRef.current) {
      const latest = completedTrades[0]; // most recent first
      if (latest?.autoResolved) {
        setActiveTab("history");
      }
    }
    prevCountRef.current = newCount;
  }, [completedTrades.length]);

  // Stats for history tab
  const wins    = completedTrades.filter((t) => t.outcome === "WIN").length;
  const losses  = completedTrades.filter((t) => t.outcome === "LOSS").length;
  const total   = completedTrades.length;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
  const autoResolved = completedTrades.filter((t) => t.autoResolved).length;

  const handleConfirmOutcome = useCallback(async (outcome: "WIN" | "LOSS" | "BREAKEVEN") => {
    if (!closingEntry) return;
    await completeTrade(closingEntry.id, outcome);
    setClosingEntry(null);
    setActiveTab("history");
  }, [closingEntry, completeTrade]);

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
            {tab === "history" && total > 0 && (
              <View style={[styles.tabBadge, { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border }]}>
                <Text style={[styles.tabBadgeText, { color: Colors.muted }]}>{total}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Watchlist Tab ── */}
      {activeTab === "watchlist" && (
        <>
          {watchlist.length > 0 && (
            <View style={styles.infoBar}>
              <Text style={styles.infoBarText}>
                ⚡ SL/TP hits auto-move trades to History with a notification
              </Text>
            </View>
          )}
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
                  Open any signal and tap "Add to Watchlist" to track it here.{"\n"}
                  SL/TP hits are detected automatically.
                </Text>
              </View>
            }
          />
        </>
      )}

      {/* ── History Tab ── */}
      {activeTab === "history" && (
        <>
          {total > 0 && (
            <View style={styles.statsRow}>
              {[
                { label: "Total",    value: total,          color: Colors.accent },
                { label: "Wins",     value: wins,           color: Colors.green  },
                { label: "Win Rate", value: `${winRate}%`,  color: winRate >= 50 ? Colors.green : Colors.red },
                { label: "Losses",   value: losses,         color: Colors.red    },
              ].map(({ label, value, color }) => (
                <View key={label} style={styles.statCard}>
                  <Text style={[styles.statCardValue, { color }]}>{value}</Text>
                  <Text style={styles.statCardLabel}>{label}</Text>
                </View>
              ))}
            </View>
          )}

          {autoResolved > 0 && (
            <View style={styles.autoBar}>
              <Text style={styles.autoBarText}>
                🤖 {autoResolved} trade{autoResolved > 1 ? "s" : ""} auto-closed by price monitor
              </Text>
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
                  Close a watchlisted trade manually, or let the price monitor auto-close it when SL/TP is hit.
                </Text>
              </View>
            }
          />
        </>
      )}

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
    flexDirection: "row", marginHorizontal: 20, marginBottom: 8,
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

  infoBar: {
    marginHorizontal: 20, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: "rgba(0,212,255,0.06)", borderRadius: 8,
    borderWidth: 1, borderColor: "rgba(0,212,255,0.15)",
  },
  infoBarText: { fontSize: 11, color: Colors.accent, fontWeight: "600" },

  autoBar: {
    marginHorizontal: 20, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: "rgba(123,47,190,0.08)", borderRadius: 8,
    borderWidth: 1, borderColor: "rgba(123,47,190,0.2)",
  },
  autoBarText: { fontSize: 11, color: Colors.accentPurple, fontWeight: "600" },

  list: { padding: 16, gap: 12 },

  card: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderLeftWidth: 3, borderRadius: 14, padding: 14, gap: 10,
  },
  cardTop:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardPairRow:   { flexDirection: "row", alignItems: "center", gap: 8 },
  cardPair:      { fontSize: 17, fontWeight: "800", color: Colors.text },
  cardPairQuote: { fontSize: 12, color: Colors.muted },
  cardAge:       { fontSize: 11, color: Colors.muted },

  dirBadge:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  dirBadgeText: { fontSize: 11, fontWeight: "800" },

  autoBadge:     { backgroundColor: "rgba(123,47,190,0.15)", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: "rgba(123,47,190,0.3)" },
  autoBadgeText: { fontSize: 9, fontWeight: "800", color: Colors.accentPurple, letterSpacing: 0.5 },

  cardStats:  { flexDirection: "row", gap: 0 },
  statItem:   { flex: 1 },
  statLabel:  { fontSize: 9, color: Colors.muted, letterSpacing: 1.5, fontWeight: "700", marginBottom: 3 },
  statValue:  { fontSize: 13, fontWeight: "700", color: Colors.text },

  historyMeta:     { flexDirection: "row", gap: 0, paddingTop: 4, borderTopWidth: 1, borderTopColor: Colors.border },
  historyMetaItem: { flex: 1 },

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

  outcomePill:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  outcomePillText: { fontSize: 11, fontWeight: "800" },

  deleteFullBtn: {
    marginTop: 4, padding: 10, borderRadius: 8,
    borderWidth: 1, borderColor: "rgba(255,71,87,0.3)", alignItems: "center",
  },
  deleteFullBtnText: { color: Colors.red, fontSize: 12, fontWeight: "700" },

  statsRow: { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 4 },
  statCard: {
    flex: 1, backgroundColor: Colors.surface, borderWidth: 1,
    borderColor: Colors.border, borderRadius: 12, padding: 12, alignItems: "center",
  },
  statCardValue: { fontSize: 20, fontWeight: "800", letterSpacing: -0.5 },
  statCardLabel: { fontSize: 9, color: Colors.muted, fontWeight: "700", marginTop: 2, letterSpacing: 1 },

  emptyWrap:    { alignItems: "center", paddingTop: 70 },
  emptyIcon:    { fontSize: 48, marginBottom: 16 },
  emptyText:    { fontSize: 18, fontWeight: "700", color: Colors.text, marginBottom: 8 },
  emptySubText: { fontSize: 14, color: Colors.muted, textAlign: "center", lineHeight: 22, paddingHorizontal: 32 },

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
  outcomeBtnWin:  { borderColor: Colors.green,   backgroundColor: "rgba(0,200,150,0.1)"  },
  outcomeBtnLoss: { borderColor: Colors.red,     backgroundColor: "rgba(255,71,87,0.1)"  },
  outcomeBtnBE:   { borderColor: Colors.caution, backgroundColor: "rgba(255,215,0,0.1)"  },
  outcomeBtnText: { fontSize: 13, fontWeight: "800", color: Colors.muted },
  cancelBtn:      { padding: 14, alignItems: "center" },
  cancelBtnText:  { color: Colors.muted, fontSize: 14 },
});