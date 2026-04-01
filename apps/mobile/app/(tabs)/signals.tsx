// FILE: apps/mobile/app/(tabs)/signals.tsx
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator, ScrollView,
} from "react-native";
import { useEffect } from "react";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSignalStore } from "../../store/useSignalStore";
import { useWebSocket } from "../../hooks/useWebSocket";
import SignalCard from "../../components/SignalCard";
import { Colors } from "../../utils/theme";
import { fetchSignals } from "../../services/api";
import type { SMCSignal } from "../../services/api";

type Filter = "all" | "BUY" | "SELL" | "high";
const FILTER_LABELS: Record<Filter, string> = {
  all:  "All",
  BUY:  "BUY",
  SELL: "SELL",
  high: "≥80%",
};

export default function SignalsScreen() {
  // ✅ FIX: Only use isConnected from useWebSocket — DO NOT call connect/disconnect here.
  // The root _layout.tsx manages the WebSocket lifecycle globally.
  // Disconnecting here would kill signals on every tab switch.
  const { isConnected } = useWebSocket();

  const setSignals  = useSignalStore((s) => s.setSignals);
  const markAllRead = useSignalStore((s) => s.markAllRead);

  const { refetch, isLoading } = useQuery({
    queryKey: ["signals"],
    queryFn:  async () => {
      const res = await fetchSignals({ limit: 50 });
      // Seed the store with historical signals on load
      if (res.signals?.length) setSignals(res.signals);
      return res;
    },
    refetchOnWindowFocus: false,
  });

  // Reset unread badge once when this screen mounts
  useEffect(() => {
    markAllRead();
  }, []);

  const activeFilter = useSignalStore((s) => s.activeFilter);
  const setFilter    = useSignalStore((s) => s.setFilter);
  const filtered     = useSignalStore((s) => s.filtered());

  const renderSignal = ({ item }: { item: SMCSignal }) => (
    <SignalCard
      signal={item}
      onPress={() => router.push(`/signal/${item.signal_id}`)}
    />
  );

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
        <Text style={styles.count}>{filtered.length} signals</Text>
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

      {/* Signal list */}
      {isLoading && filtered.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Colors.accent} size="large" />
          <Text style={styles.loadingText}>Loading signals...</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.signal_id}
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
              <Text style={styles.emptyText}>No signals yet</Text>
              <Text style={styles.emptySubText}>
                Waiting for high-probability SMC setups...
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  title:  { fontSize: 24, fontWeight: "800", color: Colors.text, letterSpacing: -0.5 },
  wsRow:  { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  wsDot:  { width: 7, height: 7, borderRadius: 4 },
  wsLabel:{ fontSize: 10, color: Colors.muted, letterSpacing: 2, fontWeight: "600" },
  count:  { fontSize: 13, color: Colors.muted, fontWeight: "600" },

  filterRow: { maxHeight: 48, marginBottom: 4 },
  chip: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1,
    borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  chipActive: { borderColor: Colors.accent, backgroundColor: "rgba(0,212,255,0.1)" },
  chipText: { fontSize: 12, color: Colors.muted, fontWeight: "700" },
  chipTextActive: { color: Colors.accent },

  list: { padding: 16, paddingTop: 8, gap: 12 },

  loadingWrap:  { flex: 1, alignItems: "center", justifyContent: "center", marginTop: 80 },
  loadingText:  { color: Colors.muted, marginTop: 12, fontSize: 14 },

  emptyWrap:    { alignItems: "center", paddingTop: 80 },
  emptyIcon:    { fontSize: 48, marginBottom: 16 },
  emptyText:    { fontSize: 18, fontWeight: "700", color: Colors.text, marginBottom: 8 },
  emptySubText: { fontSize: 14, color: Colors.muted, textAlign: "center", lineHeight: 22 },
});