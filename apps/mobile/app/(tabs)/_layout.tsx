// FILE: apps/mobile/app/(tabs)/_layout.tsx
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../utils/theme";
import { useSignalStore } from "../../store/useSignalStore";
import { useWatchlistStore } from "../../store/useWatchlistStore";

export default function TabLayout() {
  const unreadCount = useSignalStore((s) => s.unreadCount);
  // Show badge on History tab when watchlist has entries (user should be aware of them)
  const watchlistCount = useWatchlistStore((s) => s.watchlist.length);

  return (
    <Tabs
      screenOptions={{
        headerShown:        false,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor:  Colors.border,
          borderTopWidth:  1,
          height:          60,
          paddingBottom:   8,
        },
        tabBarActiveTintColor:   Colors.accent,
        tabBarInactiveTintColor: Colors.muted,
        tabBarLabelStyle:        { fontSize: 10, fontWeight: "600", letterSpacing: 0.5 },
      }}
    >
      <Tabs.Screen
        name="signals"
        options={{
          title: "Signals",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="flash" size={size} color={color} />
          ),
          tabBarBadge:      unreadCount > 0 ? unreadCount : undefined,
          tabBarBadgeStyle: { backgroundColor: Colors.accent, color: "#000", fontSize: 10 },
        }}
      />
      <Tabs.Screen
        name="ai-chat"
        options={{
          title: "AI Mentor",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble-ellipses" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bar-chart" size={size} color={color} />
          ),
          // Badge shows watchlist count so user knows trades are being monitored
          tabBarBadge:      watchlistCount > 0 ? watchlistCount : undefined,
          tabBarBadgeStyle: { backgroundColor: Colors.accentPurple, color: "#fff", fontSize: 10 },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}