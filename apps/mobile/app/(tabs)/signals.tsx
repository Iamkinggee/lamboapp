// LOCATION: apps/mobile/app/(tabs)/signals.tsx
// FIXES:
//  2. Duplicate signals prevented by dedup in store
//  6. TP_HIT / SL_HIT coins auto-removed — filtered() only returns ACTIVE
//  7. Stale signals from previous sessions never shown — purged in setSignals()
//  NEW: WS signals appear immediately — spinner only blocks when store is truly empty
//  NEW: filtered() memoized to avoid re-computation on every unrelated store update

import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator, ScrollView,
} from "react-native";
import { useEffect, useMemo, useRef } from "react";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSignalStore, type SignalWithStatus } from "../../store/useSignalStore";
import SignalCard from "../../components/SignalCard";
import { Colors } from "../../utils/theme";
import { fetchSignals } from "../../services/api";

type Filter = "all" | "BUY" | "SELL" | "high" | "anticipatory";
const FILTER_LABELS: Record<Filter, string> = {
  all:          "All",
  BUY:          "LONG",
  SELL:         "SHORT",
  high:         "≥80%",
  anticipatory: "⚠️ Early",
};

export default function SignalsScreen() {
  const isConnected  = useSignalStore((s) => s.isConnected);
  const setSignals   = useSignalStore((s) => s.setSignals);
  const addSignals   = useSignalStore((s) => s.addSignals);
  const markAllRead  = useSignalStore((s) => s.markAllRead);
  const clearOld     = useSignalStore((s) => s.clearOld);
  const activeFilter = useSignalStore((s) => s.activeFilter);
  const setFilter    = useSignalStore((s) => s.setFilter);

  // FIX: subscribe to raw signals + filter, then memoize filtered() so it
  // only recomputes when signals or activeFilter actually change — not on
  // every unrelated store update (e.g. isConnected toggling).
  const signals = useSignalStore((s) => s.signals);
  const filtered = useMemo(
    () => useSignalStore.getState().filtered(),
    [signals, activeFilter]
  );

  const initialLoadDone = useRef(false);

  const { refetch, isLoading } = useQuery({
    queryKey: ["signals"],
    queryFn: async () => {
      // Fetch a large page to get all active pairs
      const res = await fetchSignals({ limit: 200 });
      if (res.signals?.length) {
        if (!initialLoadDone.current) {
          // FIX #7: setSignals internally purges anything older than 24h
          // so stale tokens from a previous session never appear
          setSignals(res.signals);
          initialLoadDone.current = true;
        } else {
          addSignals(res.signals);
        }
      } else if (!initialLoadDone.current) {
        // Even with no signals returned, mark done so we don't spin forever
        initialLoadDone.current = true;
      }
      return res;
    },
    refetchOnWindowFocus: true,
    // Auto-refresh every 15s so entries are never missed even if WS drops
    refetchInterval: 15_000,
    // FIX: staleTime prevents the query from immediately re-running when the
    // tab is focused or the component remounts, which was evicting WS signals
    // that hadn't yet been persisted to the DB.
    staleTime: 10_000,
  });

  useEffect(() => {
    markAllRead();
    // FIX #7: also clear any stale ACTIVE signals lingering in the store
    clearOld();
  }, []);

  const renderSignal = ({ item }: { item: SignalWithStatus }) => (
    <SignalCard
      signal={item.signal}
      onPress={() => router.push(`/signal/${item.signal.signal_id}`)}
    />
  );

  // FIX: only block the UI with a spinner when the store is completely empty
  // AND the REST call is still in flight. If WS has already pushed signals
  // into the store, show them immediately — don't wait for REST to finish.
  const showSpinner = isLoading && !initialLoadDone.current && filtered.length === 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Live Signals</Text>
          <View style={styles.wsRow}>
            <View style={[styles.wsDot, { backgroundColor: isConnected ? Colors.green : Colors.red }]} />
            <Text style={styles.wsLabel}>{isConnected ? "LIVE" : "RECONNECTING..."}</Text>
          </View>
        </View>
        <Text style={styles.count}>{filtered.length} active</Text>
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      >
        {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.chip, activeFilter === f && styles.chipActive]}
            onPress={() => setFilter(f)}
            activeOpacity={0.8}
          >
            <Text style={[styles.chipText, activeFilter === f && styles.chipTextActive]}>
              {FILTER_LABELS[f]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Signal list — only ACTIVE, non-stale signals */}
      {showSpinner ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Colors.accent} size="large" />
          <Text style={styles.loadingText}>Loading signals...</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.signal.signal_id}
          renderItem={renderSignal}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
              tintColor={Colors.accent}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIcon}>⚡</Text>
              <Text style={styles.emptyText}>No active signals</Text>
              <Text style={styles.emptySubText}>
                All current setups have resolved. Waiting for fresh high-probability SMC setups across {150}+ pairs...
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
  },
  title:   { fontSize: 24, fontWeight: "800", color: Colors.text, letterSpacing: -0.5 },
  wsRow:   { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  wsDot:   { width: 7, height: 7, borderRadius: 4 },
  wsLabel: { fontSize: 10, color: Colors.muted, letterSpacing: 2, fontWeight: "600" },
  count:   { fontSize: 13, color: Colors.muted, fontWeight: "600" },

  filterRow: { maxHeight: 48, marginBottom: 4 },
  chip: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1,
    borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  chipActive:     { borderColor: Colors.accent, backgroundColor: "rgba(0,212,255,0.1)" },
  chipText:       { fontSize: 12, color: Colors.muted, fontWeight: "700" },
  chipTextActive: { color: Colors.accent },

  list: { padding: 16, paddingTop: 8, gap: 12 },

  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", marginTop: 80 },
  loadingText: { color: Colors.muted, marginTop: 12, fontSize: 14 },

  emptyWrap:    { alignItems: "center", paddingTop: 80, paddingHorizontal: 32 },
  emptyIcon:    { fontSize: 48, marginBottom: 16 },
  emptyText:    { fontSize: 18, fontWeight: "700", color: Colors.text, marginBottom: 8 },
  emptySubText: { fontSize: 14, color: Colors.muted, textAlign: "center", lineHeight: 22 },
});