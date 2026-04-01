
// FILE: apps/mobile/app/(tabs)/ai-chat.tsx

import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, ScrollView,
} from "react-native";
import { useState, useRef, useEffect } from "react";
import { Colors } from "../../utils/theme";
import { sendChatMessage } from "../../services/api";

type Message = {
  id:        string;
  role:      "user" | "assistant";
  content:   string;
  timestamp: number;
};

const QUICK_ACTIONS = [
  "Explain last signal",
  "Quiz me on Order Blocks",
  "Review my last trade",
  "What is a liquidity sweep?",
];

const ChatBubble = ({ message }: { message: Message }) => {
  const isUser = message.role === "user";
  return (
    <View style={[bubbleStyles.wrap, isUser ? bubbleStyles.userWrap : bubbleStyles.aiWrap]}>
      <View style={[bubbleStyles.bubble, isUser ? bubbleStyles.userBubble : bubbleStyles.aiBubble]}>
        <Text style={[bubbleStyles.text, isUser ? bubbleStyles.userText : bubbleStyles.aiText]}>
          {message.content}
        </Text>
      </View>
    </View>
  );
};

const bubbleStyles = StyleSheet.create({
  wrap:       { marginVertical: 4, maxWidth: "80%" },
  userWrap:   { alignSelf: "flex-end" },
  aiWrap:     { alignSelf: "flex-start" },
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

  useEffect(() => {
    setMessages([{
      id:        "intro",
      role:      "assistant",
      content:   "👋 I'm your SMC trading mentor. I can explain signals, review trades, quiz you on concepts, and help you develop your edge.\n\nWhat would you like to work on?",
      timestamp: Date.now(),
    }]);
  }, []);

  const send = async (text: string) => {
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

    try {
      console.log('[Chat] Sending:', trimmed);
      const { response } = await sendChatMessage(trimmed);
      console.log('[Chat] Response received');
      setMessages((prev) => [...prev, {
        id:        (Date.now() + 1).toString(),
        role:      "assistant",
        content:   response,
        timestamp: Date.now(),
      }]);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      console.error('[Chat] Error:', error);
      setMessages((prev) => [...prev, {
        id:        (Date.now() + 1).toString(),
        role:      "assistant",
        content:   msg.includes('Unauthorized')
          ? "Session expired. Please log out and log back in."
          : "Sorry, I'm temporarily unavailable. Please try again.",
        timestamp: Date.now(),
      }]);



    } finally {
      setLoading(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

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
        <View>
          <Text style={styles.title}>SMC Mentor</Text>
          <Text style={styles.subtitle}>Context-aware · SMC expert</Text>
        </View>
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
                <Text style={styles.typingText}>Thinking...</Text>
              </View>
            </View>
          ) : null
        }
      />

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
          placeholder="Ask anything about SMC..."
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
  header:          { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  aiAvatar:        { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.accentPurple, alignItems: "center", justifyContent: "center" },
  aiAvatarText:    { fontSize: 12, fontWeight: "800", color: "#fff" },
  title:           { fontSize: 18, fontWeight: "800", color: Colors.text },
  subtitle:        { fontSize: 12, color: Colors.muted, marginTop: 2 },
  messageList:     { padding: 16, paddingBottom: 8, gap: 4 },
  typingWrap:      { paddingLeft: 16, paddingBottom: 8 },
  typingBubble:    { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.surface, alignSelf: "flex-start", padding: 12, borderRadius: 16, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: Colors.border },
  typingText:      { fontSize: 13, color: Colors.muted },
  quickRow:        { maxHeight: 52, marginBottom: 8 },
  quickChip:       { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: Colors.accentPurple, backgroundColor: "rgba(123,47,190,0.1)" },
  quickChipText:   { fontSize: 12, color: Colors.accentPurple, fontWeight: "600" },
  inputRow:        { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 16, paddingBottom: Platform.OS === "ios" ? 34 : 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  input:           { flex: 1, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: Colors.text, fontSize: 15, maxHeight: 100 },
  sendBtn:         { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center" },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText:     { fontSize: 20, color: "#000", fontWeight: "800" },
});