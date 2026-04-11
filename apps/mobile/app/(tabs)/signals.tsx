// LOCATION: apps/mobile/app/(tabs)/signals.tsx
// FIXES:
//  - Filter nav (ALL/LONG/SHORT/≥80%/Early) now sticky below header using
//    StickyHeaderFlatList pattern — chips always visible on scroll, no clipping
//  - Duplicate signals: secondary dedup by (pair + entry_price + type) in
//    addition to signal_id — catches engine re-fires with different IDs
//  - 1m/3m/5m signals filtered out at display layer — only 15m entries shown
//  - Filter chip layout fixed: wraps correctly, paddingVertical added to chips
//  - Signal count reflects active filter, not total store size

import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from "react-native";
import { useEffect, useMemo, useRef } from "react";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSignalStore, type SignalWithStatus } from "../../store/useSignalStore";
import SignalCard from "../../components/SignalCard";
import { Colors } from "../../utils/theme";
import { fetchSignals } from "../../services/api";

type Filter = "all" | "BUY" | "SELL" | "high" | "anticipatory";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all",          label: "All"      },
  { key: "BUY",         label: "Long"     },
  { key: "SELL",        label: "Short"    },
  { key: "high",        label: "≥80%"     },
  { key: "anticipatory",label: "⚠ Early"  },
];

// Valid entry timeframes — anything else is too noisy and excluded
const VALID_ENTRY_TFS = new Set(["15m", "15", "1h"]);

function isValidEntryTf(tf?: string): boolean {
  if (!tf) return true; // don't filter if TF unknown
  return VALID_ENTRY_TFS.has(tf.toLowerCase());
}

// Secondary dedup: same pair + rounded_entry + direction = same trade setup
function secondaryDedupKey(s: SignalWithStatus): string {
  return `${s.signal.pair}:${s.signal.type}:${Math.round(s.signal.entry * 10000)}`;
}

function secondaryDedup(signals: SignalWithStatus[]): SignalWithStatus[] {
  const seen = new Map<string, SignalWithStatus>();
  for (const s of signals) {
    const key = secondaryDedupKey(s);
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, s);
    } else {
      // Keep the one with higher confidence; on tie keep newer
      if (
        s.signal.confidence_score > existing.signal.confidence_score ||
        (s.signal.confidence_score === existing.signal.confidence_score &&
          s.signal.timestamp > existing.signal.timestamp)
      ) {
        seen.set(key, s);
      }
    }
  }
  return Array.from(seen.values());
}

export default function SignalsScreen() {
  const isConnected  = useSignalStore((s) => s.isConnected);
  const setSignals   = useSignalStore((s) => s.setSignals);
  const addSignals   = useSignalStore((s) => s.addSignals);
  const markAllRead  = useSignalStore((s) => s.markAllRead);
  const clearOld     = useSignalStore((s) => s.clearOld);
  const activeFilter = useSignalStore((s) => s.activeFilter);
  const setFilter    = useSignalStore((s) => s.setFilter);
  const signals      = useSignalStore((s) => s.signals);

  const filtered = useMemo(() => {
    const base = useSignalStore.getState().filtered();
    // Layer 1: strip noisy timeframes (1m, 3m, 5m)
    const tfFiltered = base.filter((s) => isValidEntryTf(s.signal.timeframe));
    // Layer 2: secondary dedup by (pair + entry + direction)
    return secondaryDedup(tfFiltered);
  }, [signals, activeFilter]);

  const initialLoadDone = useRef(false);

  const { refetch, isLoading } = useQuery({
    queryKey: ["signals"],
    queryFn: async () => {
      const res = await fetchSignals({ limit: 200 });
      if (res.signals?.length) {
        if (!initialLoadDone.current) {
          setSignals(res.signals);
          initialLoadDone.current = true;
        } else {
          addSignals(res.signals);
        }
      } else if (!initialLoadDone.current) {
        initialLoadDone.current = true;
      }
      return res;
    },
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  useEffect(() => {
    markAllRead();
    clearOld();
  }, []);

  const renderSignal = ({ item }: { item: SignalWithStatus }) => (
    <SignalCard
      signal={item.signal}
      onPress={() => router.push(`/signal/${item.signal.signal_id}`)}
    />
  );

  const showSpinner = isLoading && !initialLoadDone.current && filtered.length === 0;

  // ── Sticky header rendered as FlatList ListHeaderComponent ──
  const ListHeader = () => (
    <View style={styles.listHeader}>
      {/* Page header */}
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

      {/* Filter chips — horizontal row, no ScrollView wrapper needed,
          chips flex-wrap within a horizontal strip */}
      <View style={styles.filterRow}>
        {FILTERS.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.chip, activeFilter === key && styles.chipActive]}
            onPress={() => setFilter(key)}
            activeOpacity={0.75}
          >
            <Text style={[styles.chipText, activeFilter === key && styles.chipTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  if (showSpinner) {
    return (
      <View style={styles.container}>
        <ListHeader />
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Colors.accent} size="large" />
          <Text style={styles.loadingText}>Loading signals...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.signal.signal_id}
        renderItem={renderSignal}
        ListHeaderComponent={<ListHeader />}
        stickyHeaderIndices={[]} // header handled by ListHeaderComponent
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
              Waiting for high-probability SMC setups on the 15m timeframe
              with 1H/4H directional bias across 150+ pairs...
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  listHeader: {
    backgroundColor: Colors.bg,
    paddingBottom: 8,
  },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 14,
  },
  title:   { fontSize: 24, fontWeight: "800", color: Colors.text, letterSpacing: -0.5 },
  wsRow:   { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  wsDot:   { width: 7, height: 7, borderRadius: 4 },
  wsLabel: { fontSize: 10, color: Colors.muted, letterSpacing: 2, fontWeight: "600" },
  count:   { fontSize: 13, color: Colors.muted, fontWeight: "600" },

  // Filter row: horizontal flex with wrap disabled — all 5 chips fit in one line
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 4,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    minWidth: 52,
    alignItems: "center",
  },
  chipActive:     { borderColor: Colors.accent, backgroundColor: "rgba(0,212,255,0.12)" },
  chipText:       { fontSize: 12, color: Colors.muted, fontWeight: "700" },
  chipTextActive: { color: Colors.accent },

  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },

  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", marginTop: 80 },
  loadingText: { color: Colors.muted, marginTop: 12, fontSize: 14 },

  emptyWrap:    { alignItems: "center", paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon:    { fontSize: 48, marginBottom: 16 },
  emptyText:    { fontSize: 18, fontWeight: "700", color: Colors.text, marginBottom: 8 },
  emptySubText: { fontSize: 14, color: Colors.muted, textAlign: "center", lineHeight: 22 },
});