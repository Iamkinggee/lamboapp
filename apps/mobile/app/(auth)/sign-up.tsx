// // ──────────────────────────────────────────────
// // apps/mobile/app/(auth)/sign-up.tsx
// // ──────────────────────────────────────────────
// import React, { useState } from 'react';
// import {
//   View, Text, TextInput, TouchableOpacity,
//   StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
// } from 'react-native';
// import { router } from 'expo-router';
// import { useAuthStore } from '../../store/useAuthStore';
// import { colors, spacing, radius, font } from '../../utils/theme';

// function handleBack() {
//   if (router.canGoBack()) {
//     router.back();
//   } else {
//     router.replace('/(auth)/sign-in');
//   }
// }

// export default function SignUpScreen() {
//   const [name,     setName]     = useState('');
//   const [email,    setEmail]    = useState('');
//   const [password, setPassword] = useState('');
//   const { register, isLoading, error, clearError } = useAuthStore();

//   async function handleRegister() {
//     if (!name || !email || !password) return;
//     clearError();
//     try {
//       await register(email.trim(), password, name.trim());
//       router.replace('/(tabs)/signals');
//     } catch { /* error shown from store */ }
//   }

//   return (
//     <KeyboardAvoidingView
//       style={styles.container}
//       behavior={Platform.OS === 'ios' ? 'padding' : undefined}
//     >
//       <View style={styles.inner}>
//         <View style={styles.header}>
//           <Text style={styles.logo}>◆ SMC</Text>
//           <Text style={styles.title}>Create Account</Text>
//           <Text style={styles.subtitle}>Start trading smarter today</Text>
//         </View>

//         <View style={styles.form}>
//           {error && (
//             <View style={styles.errorBox}>
//               <Text style={styles.errorText}>{error}</Text>
//             </View>
//           )}

//           <Text style={styles.label}>Full Name</Text>
//           <TextInput
//             style={styles.input} value={name} onChangeText={setName}
//             placeholder="Your name" placeholderTextColor={colors.textMuted}
//             autoCapitalize="words"
//           />

//           <Text style={styles.label}>Email</Text>
//           <TextInput
//             style={styles.input} value={email} onChangeText={setEmail}
//             placeholder="you@example.com" placeholderTextColor={colors.textMuted}
//             keyboardType="email-address" autoCapitalize="none"
//           />

//           <Text style={styles.label}>Password</Text>
//           <TextInput
//             style={styles.input} value={password} onChangeText={setPassword}
//             placeholder="Min. 8 characters" placeholderTextColor={colors.textMuted}
//             secureTextEntry
//           />

//           <TouchableOpacity
//             style={[styles.btn, isLoading && styles.btnDisabled]}
//             onPress={handleRegister} disabled={isLoading}
//           >
//             {isLoading
//               ? <ActivityIndicator color={colors.background} />
//               : <Text style={styles.btnText}>Create Account</Text>
//             }
//           </TouchableOpacity>

//           <TouchableOpacity style={styles.switchBtn} onPress={handleBack}>
//             <Text style={styles.switchText}>
//               Already have an account? <Text style={styles.switchLink}>Sign In</Text>
//             </Text>
//           </TouchableOpacity>
//         </View>
//       </View>
//     </KeyboardAvoidingView>
//   );
// }

// const styles = StyleSheet.create({
//   container:   { flex: 1, backgroundColor: colors.background },
//   inner:       { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
//   header:      { alignItems: 'center', marginBottom: spacing.xxl },
//   logo:        { color: colors.accentBlue, fontSize: font.size.xxxl, fontWeight: font.weight.bold, marginBottom: spacing.sm },
//   title:       { color: colors.textPrimary, fontSize: font.size.xxl, fontWeight: font.weight.bold },
//   subtitle:    { color: colors.textSecondary, fontSize: font.size.md, marginTop: spacing.xs },
//   form:        { gap: spacing.sm },
//   errorBox:    { backgroundColor: colors.error + '22', borderRadius: radius.sm, padding: spacing.sm, borderWidth: 1, borderColor: colors.error + '55' },
//   errorText:   { color: colors.error, fontSize: font.size.sm },
//   label:       { color: colors.textSecondary, fontSize: font.size.sm, fontWeight: font.weight.medium, marginBottom: 4 },
//   input: {
//     backgroundColor: colors.surface, borderRadius: radius.md,
//     padding: spacing.md, color: colors.textPrimary, fontSize: font.size.md,
//     borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm,
//   },
//   btn:         { backgroundColor: colors.accentBlue, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.sm },
//   btnDisabled: { opacity: 0.6 },
//   btnText:     { color: colors.background, fontSize: font.size.md, fontWeight: font.weight.bold },
//   switchBtn:   { alignItems: 'center', marginTop: spacing.md },
//   switchText:  { color: colors.textSecondary, fontSize: font.size.sm },
//   switchLink:  { color: colors.accentBlue, fontWeight: font.weight.semibold },
// });





// FILE: apps/mobile/app/(auth)/sign-up.tsx
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, ScrollView,
} from "react-native";
import { useState } from "react";
import { router } from "expo-router";
import { useAuthStore } from "../../store/useAuthStore";
import { apiRegister } from "../../services/api";
import { Colors } from "../../utils/theme";

const SKILL_LEVELS = ["Beginner", "Intermediate", "Advanced"] as const;
type SkillLevel = typeof SKILL_LEVELS[number];

export default function SignUp() {
  const [name,       setName]       = useState("");
  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [skillLevel, setSkillLevel] = useState<SkillLevel>("Beginner");
  const [loading,    setLoading]    = useState(false);
  const login = useAuthStore((s) => s.login);

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }
    if (password.length < 8) {
      Alert.alert("Error", "Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const { token, userId } = await apiRegister(name.trim(), email.trim(), password, skillLevel.toLowerCase());
      await login(token, userId);
      router.replace("/(tabs)/signals");
    } catch (e: any) {
      Alert.alert("Registration Failed", e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  // Safe back navigation — falls back to sign-in if no history exists
  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(auth)/sign-in");
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner} showsVerticalScrollIndicator={false}>
        <View style={styles.logoWrap}>
          <Text style={styles.logoText}>
            SMC<Text style={styles.logoAccent}>Trading</Text>
          </Text>
          <Text style={styles.logoSub}>CREATE YOUR ACCOUNT</Text>
        </View>

        <View style={styles.form}>
          {[
            { label: "FULL NAME",    value: name,     set: setName,     placeholder: "Your name",             type: "default" },
            { label: "EMAIL",        value: email,    set: setEmail,    placeholder: "trader@example.com",    type: "email-address" },
            { label: "PASSWORD",     value: password, set: setPassword, placeholder: "Min 8 characters",       type: "default", secure: true },
          ].map(({ label, value, set, placeholder, type, secure }) => (
            <View key={label} style={{ marginBottom: 16 }}>
              <Text style={styles.label}>{label}</Text>
              <TextInput
                style={styles.input}
                placeholder={placeholder}
                placeholderTextColor={Colors.muted}
                value={value}
                onChangeText={set as any}
                keyboardType={type as any}
                autoCapitalize={label === "FULL NAME" ? "words" : "none"}
                autoCorrect={false}
                secureTextEntry={secure}
              />
            </View>
          ))}

          <Text style={styles.label}>SKILL LEVEL</Text>
          <View style={styles.skillRow}>
            {SKILL_LEVELS.map((level) => (
              <TouchableOpacity
                key={level}
                style={[styles.skillBtn, skillLevel === level && styles.skillBtnActive]}
                onPress={() => setSkillLevel(level)}
                activeOpacity={0.8}
              >
                <Text style={[styles.skillBtnText, skillLevel === level && styles.skillBtnTextActive]}>
                  {level}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.btnText}>CREATE ACCOUNT →</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkBtn} onPress={handleBack}>
            <Text style={styles.linkText}>
              Already have an account?{" "}
              <Text style={{ color: Colors.accent }}>Sign in →</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  inner: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 32, paddingVertical: 48 },
  logoWrap:  { alignItems: "center", marginBottom: 40 },
  logoText:  { fontSize: 32, fontWeight: "800", color: Colors.text, letterSpacing: -1 },
  logoAccent:{ color: Colors.accent },
  logoSub:   { fontSize: 10, color: Colors.muted, letterSpacing: 3, marginTop: 6 },
  form: {},
  label: { fontSize: 11, color: Colors.muted, letterSpacing: 2, marginBottom: 8, fontWeight: "600" },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    padding: 14, color: Colors.text, fontSize: 15,
  },
  skillRow: { flexDirection: "row", gap: 10, marginBottom: 0 },
  skillBtn: {
    flex: 1, padding: 12, borderRadius: 8,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface, alignItems: "center",
  },
  skillBtnActive: { borderColor: Colors.accent, backgroundColor: "rgba(0,212,255,0.1)" },
  skillBtnText: { fontSize: 12, color: Colors.muted, fontWeight: "600" },
  skillBtnTextActive: { color: Colors.accent },
  btn: { backgroundColor: Colors.accent, borderRadius: 10, padding: 16, alignItems: "center", marginTop: 24 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#000", fontSize: 14, fontWeight: "800", letterSpacing: 1 },
  linkBtn: { alignItems: "center", marginTop: 20 },
  linkText: { color: Colors.muted, fontSize: 14 },
});