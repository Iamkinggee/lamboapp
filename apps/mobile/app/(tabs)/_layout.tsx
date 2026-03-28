// // ──────────────────────────────────────────────
// // apps/mobile/app/(tabs)/_layout.tsx
// // Bottom tab navigator
// // ──────────────────────────────────────────────
// import React from 'react';
// import { Tabs } from 'expo-router';
// import { colors, font } from '../../utils/theme';

// export default function TabsLayout() {
//   return (
//     <Tabs
//       screenOptions={{
//         tabBarStyle: {
//           backgroundColor:  colors.surface,
//           borderTopColor:   colors.border,
//           borderTopWidth:   1,
//           height:           60,
//           paddingBottom:    8,
//         },
//         tabBarActiveTintColor:   colors.accentBlue,
//         tabBarInactiveTintColor: colors.textMuted,
//         tabBarLabelStyle:        { fontSize: font.size.xs, fontWeight: font.weight.medium },
//         headerShown: false,
//       }}
//     >
//       <Tabs.Screen name="signals"  options={{ title: 'Signals',  tabBarIcon: ({ color }) => <TabIcon icon="◆" color={color} /> }} />
//       <Tabs.Screen name="ai-chat"  options={{ title: 'AI Mentor', tabBarIcon: ({ color }) => <TabIcon icon="✦" color={color} /> }} />
//       <Tabs.Screen name="history"  options={{ title: 'History',  tabBarIcon: ({ color }) => <TabIcon icon="▤" color={color} /> }} />
//       <Tabs.Screen name="profile"  options={{ title: 'Profile',  tabBarIcon: ({ color }) => <TabIcon icon="◉" color={color} /> }} />
//     </Tabs>
//   );
// }

// function TabIcon({ icon, color }: { icon: string; color: string }) {
//   const { Text } = require('react-native');
//   return <Text style={{ color, fontSize: 18 }}>{icon}</Text>;
// }






// FILE: apps/mobile/app/(tabs)/_layout.tsx
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../utils/theme";
import { useSignalStore } from "../../store/useSignalStore";

export default function TabLayout() {
  const unreadCount = useSignalStore((s) => s.unreadCount);

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
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
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