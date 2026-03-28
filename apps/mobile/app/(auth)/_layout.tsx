// // ──────────────────────────────────────────────
// // apps/mobile/app/(auth)/_layout.tsx
// // ──────────────────────────────────────────────
// import { Stack } from 'expo-router';
// import { colors } from '../../utils/theme';

// export default function AuthLayout() {
//   return (
//     <Stack screenOptions={{
//       headerShown: false,
//       contentStyle: { backgroundColor: colors.background },
//     }} />
//   );
// }






// FILE: apps/mobile/app/(auth)/_layout.tsx
import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
    </Stack>
  );
}