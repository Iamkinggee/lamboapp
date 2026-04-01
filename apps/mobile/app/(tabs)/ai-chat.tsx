// FILE: apps/mobile/app/(tabs)/ai-chat.tsx

import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, ScrollView,
} from "react-native";
import { useState, useRef, useEffect, useCallback } from "react";
import { Colors } from "../../utils/theme";
import { sendChatMessage } from "../../services/api";
import { useWatchlistStore } from "../../store/useWatchlistStore";
import { useSignalStore } from "../../store/useSignalStore";

type Message = {
  id:        string;
  role:      "user" | "assistant";
  content:   string;
  timestamp: number;
};

const QUICK_ACTIONS = [
  "Analyse my watchlist",
  "Which signal looks strongest?",
  "Quiz me on Order Blocks",
  "What is a liquidity sweep?",
];

// ── Build a concise context string from watchlist + recent signals ─────────
function buildContextPrefix(
  watchlist: ReturnType<typeof useWatchlistStore.getState>["watchlist"],
  activeSignals: ReturnType<typeof useSignalStore.getState>["signals"]
): string {
  const parts: string[] = [];

  if (watchlist.length > 0) {
    const wlSummary = watchlist.map((w) => {
      const s = w.signal;
      return `${s.pair} ${s.type} | Entry ${s.entry} | SL ${s.stop_loss} | TP ${s.take_profit} | RR 1:${s.risk_reward} | Conf ${s.confidence_score}%`;
    }).join("\n");
    parts.push(`[User's current watchlist — ${watchlist.length} trade(s) being tracked:\n${wlSummary}]`);
  }

  const active = activeSignals.filter((s) => s.status === "ACTIVE").slice(0, 5);
  if (active.length > 0) {
    const sigSummary = active.map((s) => {
      const sig = s.signal;
      return `${sig.pair} ${sig.type} | Score ${sig.confidence_score}% | HTF ${sig.htf_bias} | ${sig.confluences.join(", ")}`;
    }).join("\n");
    parts.push(`[Live signals on the platform right now — ${active.length} active:\n${sigSummary}]`);
  }

  return parts.length > 0
    ? `Context (visible only to you as the AI):\n${parts.join("\n\n")}\n\n---\nUser message: `
    : "";
}

const ChatBubble = ({ message }: { message: Message }) => {
  const isUser = message.role === "user";
  return (
    <View style={[bubbleStyles.wrap, isUser ? bubbleStyles.userWrap : bubbleStyles.aiWrap]}>
      {!isUser && (
        <View style={bubbleStyles.aiLabel}>
          <Text style={bubbleStyles.aiLabelText}>SMC AI</Text>
        </View>
      )}
      <View style={[bubbleStyles.bubble, isUser ? bubbleStyles.userBubble : bubbleStyles.aiBubble]}>
        <Text style={[bubbleStyles.text, isUser ? bubbleStyles.userText : bubbleStyles.aiText]}>
          {message.content}
        </Text>
      </View>
    </View>
  );
};

const bubbleStyles = StyleSheet.create({
  wrap:       { marginVertical: 4, maxWidth: "85%" },
  userWrap:   { alignSelf: "flex-end" },
  aiWrap:     { alignSelf: "flex-start" },
  aiLabel:    { marginBottom: 4, marginLeft: 2 },
  aiLabelText:{ fontSize: 10, color: Colors.accentPurple, fontWeight: "700", letterSpacing: 1 },
  bubble:     { padding: 12, borderRadius: 16 },
  userBubble: { backgroundColor: Colors.accent, borderBottomRightRadius: 4 },
  aiBubble:   { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderBottomLeftRadius: 4 },
  text:       { fontSize: 15, lineHeight: 22 },
  userText:   { color: "#000", fontWeight: "600" },
  aiText:     { color: Colors.text },
});

export default function AiChatScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input,    setInput]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const watchlist    = useWatchlistStore((s) => s.watchlist);
  const signalsList  = useSignalStore((s) => s.signals);

  // Build context-aware intro message that references the user's watchlist
  useEffect(() => {
    let intro = "👋 I'm your SMC trading mentor. I can explain signals, review your watchlisted trades, quiz you on concepts, and help you develop your edge.\n\n";

    if (watchlist.length > 0) {
      const pairs = watchlist.map((w) => `${w.signal.pair.replace("USDT", "")}/USDT (${w.signal.type})`).join(", ");
      intro += `I can see you're currently watching: **${pairs}**.\n\nAsk me anything about these trades or SMC in general.`;
    } else {
      intro += "You don't have any signals on your watchlist yet. Add signals from the Signals tab to get trade-specific advice.";
    }

    setMessages([{
      id:        "intro",
      role:      "assistant",
      content:   intro,
      timestamp: Date.now(),
    }]);
  }, [watchlist.length]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = {
      id:        Date.now().toString(),
      role:      "user",
      content:   trimmed,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    // ── Inject watchlist + live signal context into message ───────────
    const contextPrefix = buildContextPrefix(watchlist, signalsList);
    const messageWithContext = contextPrefix ? `${contextPrefix}${trimmed}` : trimmed;

    try {
      console.log('[Chat] Sending with context. Pairs watched:', watchlist.length);
      const { response } = await sendChatMessage(messageWithContext);

      setMessages((prev) => [...prev, {
        id:        (Date.now() + 1).toString(),
        role:      "assistant",
        content:   response,
        timestamp: Date.now(),
      }]);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "";
      console.error("[Chat] Error:", error);
      setMessages((prev) => [...prev, {
        id:        (Date.now() + 1).toString(),
        role:      "assistant",
        content:   msg.includes("Unauthorized")
          ? "Session expired. Please log out and log back in."
          : "Sorry, I'm temporarily unavailable. Please try again.",
        timestamp: Date.now(),
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [loading, watchlist, signalsList]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
    >
      <View style={styles.header}>
        <View style={styles.aiAvatar}>
          <Text style={styles.aiAvatarText}>AI</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>SMC Mentor</Text>
          <Text style={styles.subtitle}>
            {watchlist.length > 0
              ? `Watching ${watchlist.length} trade${watchlist.length > 1 ? "s" : ""} · Context-aware`
              : "Context-aware · SMC expert"}
          </Text>
        </View>
        {watchlist.length > 0 && (
          <View style={styles.contextBadge}>
            <Text style={styles.contextBadgeText}>{watchlist.length} watched</Text>
          </View>
        )}
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ChatBubble message={item} />}
        contentContainerStyle={styles.messageList}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        ListFooterComponent={
          loading ? (
            <View style={styles.typingWrap}>
              <View style={styles.typingBubble}>
                <ActivityIndicator color={Colors.accent} size="small" />
                <Text style={styles.typingText}>Analysing...</Text>
              </View>
            </View>
          ) : null
        }
      />

      {/* Quick actions — shown only when no chat messages yet */}
      {messages.length <= 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.quickRow}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        >
          {QUICK_ACTIONS.map((action) => (
            <TouchableOpacity
              key={action}
              style={styles.quickChip}
              onPress={() => send(action)}
              activeOpacity={0.8}
            >
              <Text style={styles.quickChipText}>{action}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Ask about your trades or SMC..."
          placeholderTextColor={Colors.muted}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={500}
          returnKeyType="send"
          blurOnSubmit={false}
          onSubmitEditing={() => send(input)}
        />
        <TouchableOpacity
          style={[styles.sendBtn, loading && styles.sendBtnDisabled]}
          onPress={() => send(input)}
          disabled={loading}
          activeOpacity={0.7}
        >
          {loading
            ? <ActivityIndicator color="#000" size="small" />
            : <Text style={styles.sendBtnText}>→</Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: Colors.bg },
  header:          {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  aiAvatar:        { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.accentPurple, alignItems: "center", justifyContent: "center" },
  aiAvatarText:    { fontSize: 12, fontWeight: "800", color: "#fff" },
  title:           { fontSize: 18, fontWeight: "800", color: Colors.text },
  subtitle:        { fontSize: 12, color: Colors.muted, marginTop: 2 },
  contextBadge:    { backgroundColor: "rgba(0,212,255,0.12)", borderWidth: 1, borderColor: Colors.accent, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  contextBadgeText:{ fontSize: 10, color: Colors.accent, fontWeight: "800" },
  messageList:     { padding: 16, paddingBottom: 8, gap: 4 },
  typingWrap:      { paddingLeft: 16, paddingBottom: 8 },
  typingBubble:    {
    flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.surface,
    alignSelf: "flex-start", padding: 12, borderRadius: 16, borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: Colors.border,
  },
  typingText:      { fontSize: 13, color: Colors.muted },
  quickRow:        { maxHeight: 52, marginBottom: 8 },
  quickChip:       { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: Colors.accentPurple, backgroundColor: "rgba(123,47,190,0.1)" },
  quickChipText:   { fontSize: 12, color: Colors.accentPurple, fontWeight: "600" },
  inputRow:        {
    flexDirection: "row", alignItems: "flex-end", gap: 10,
    paddingHorizontal: 16, paddingBottom: Platform.OS === "ios" ? 34 : 20,
    paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  input:           {
    flex: 1, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
    color: Colors.text, fontSize: 15, maxHeight: 100,
  },
  sendBtn:         { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center" },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText:     { fontSize: 20, color: "#000", fontWeight: "800" },
});