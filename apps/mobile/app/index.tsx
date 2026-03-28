// // ──────────────────────────────────────────────
// // apps/mobile/app/index.tsx
// // Entry redirect — send to signals if logged in,
// // else to sign-in
// // ──────────────────────────────────────────────
// import { Redirect } from 'expo-router';
// import { useAuthStore } from '../store/useAuthStore';

// export default function Index() {
//   const user = useAuthStore((s) => s.user);   // ✅ user instead of token
//   return user
//     ? <Redirect href="/(tabs)/signals" />
//     : <Redirect href="/(auth)/sign-in" />;
// }







// FILE: apps/mobile/app/index.tsx
import { Redirect } from "expo-router";
import { useAuthStore } from "../store/useAuthStore";

export default function Index() {
  const token = useAuthStore((s) => s.token);
  return <Redirect href={token ? "/(tabs)/signals" : "/(auth)/sign-in"} />;
}