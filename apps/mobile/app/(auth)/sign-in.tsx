



// FILE: apps/mobile/app/(auth)/sign-in.tsx
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert,
} from "react-native";
import { useState } from "react";
import { router } from "expo-router";
import { useAuthStore } from "../../store/useAuthStore";
import { apiLogin } from "../../services/api";
import { Colors } from "../../utils/theme";
// import { Typography } from "../../utils/theme";

export default function SignIn() {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const login = useAuthStore((s) => s.login);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }
    setLoading(true);
    try {
      const { token, userId } = await apiLogin(email.trim(), password);
      await login(token, userId);
      router.replace("/(tabs)/signals");
    } catch (e: any) {
      Alert.alert("Login Failed", e.message ?? "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.inner}>
        {/* Logo */}
        <View style={styles.logoWrap}>
          <Text style={styles.logoText}>
            LAMBO<Text style={styles.logoAccent}>AI</Text>
          </Text>
          <Text style={styles.logoSub}>AI-POWERED SIGNAL ENGINE</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.label}>EMAIL</Text>
          <TextInput
            style={styles.input}
            placeholder="trader@example.com"
            placeholderTextColor={Colors.muted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={[styles.label, { marginTop: 16 }]}>PASSWORD</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••••••"
            placeholderTextColor={Colors.muted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.btnText}>SIGN IN →</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() => router.push("/(auth)/sign-up")}
          >
            <Text style={styles.linkText}>
              No account?{" "}
              <Text style={{ color: Colors.accent }}>Create one →</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  inner: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  logoWrap:  { alignItems: "center", marginBottom: 48 },
  logoText:  { fontSize: 36, fontWeight: "800", color: Colors.text, letterSpacing: -1 },
  logoAccent:{ color: Colors.accent },
  logoSub:   { fontSize: 11, color: Colors.muted, letterSpacing: 3, marginTop: 6 },

  form: {},
  label: {
    fontSize: 11,
    color:    Colors.muted,
    letterSpacing: 2,
    marginBottom: 8,
    fontWeight: "600",
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 14,
    color: Colors.text,
    fontSize: 15,
  },
  btn: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    marginTop: 24,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#000", fontSize: 14, fontWeight: "800", letterSpacing: 1 },
  linkBtn: { alignItems: "center", marginTop: 20 },
  linkText: { color: Colors.muted, fontSize: 14 },
});