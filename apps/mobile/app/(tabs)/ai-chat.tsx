// // ──────────────────────────────────────────────
// // apps/mobile/app/(tabs)/ai-chat.tsx
// // AI Mentor chat screen — Tab 2
// // ──────────────────────────────────────────────
// import React, { useState, useRef, useCallback } from 'react';
// import {
//   View, Text, TextInput, TouchableOpacity, FlatList,
//   StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
// } from 'react-native';
// import { useQuery } from '@tanstack/react-query';
// import { ChatBubble, TypingIndicator } from '../../components/ChatBubble';
// import { sendChatMessage, fetchChatHistory, ChatMessage } from '../../services/api';
// import { colors, spacing, radius, font } from '../../utils/theme';

// const QUICK_ACTIONS = [
//   'Explain last signal',
//   'Quiz me on OBs',
//   'Review my last trade',
//   'What is a FVG?',
// ];

// export default function AIChatScreen() {
//   const [messages,   setMessages]   = useState<ChatMessage[]>([]);
//   const [input,      setInput]      = useState('');
//   const [isTyping,   setIsTyping]   = useState(false);
//   const listRef = useRef<FlatList>(null);

//   // Load chat history on mount
//   useQuery({
//     queryKey: ['chat-history'],
//     queryFn:  async () => {
//       const data = await fetchChatHistory();
//       setMessages(data.history);
//       return data.history;
//     },
//     staleTime: Infinity,
//   });

//   const sendMessage = useCallback(async (text: string) => {
//     const trimmed = text.trim();
//     if (!trimmed || isTyping) return;

//     const userMsg: ChatMessage = { role: 'user', content: trimmed };
//     setMessages((prev) => [...prev, userMsg]);
//     setInput('');
//     setIsTyping(true);

//     // Scroll to bottom
//     setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);

//     try {
//       const data = await sendChatMessage(trimmed);
//       const aiMsg: ChatMessage = { role: 'assistant', content: data.response };
//       setMessages((prev) => [...prev, aiMsg]);
//     } catch {
//       const errMsg: ChatMessage = {
//         role:    'assistant',
//         content: 'Connection error. Please try again.',
//       };
//       setMessages((prev) => [...prev, errMsg]);
//     } finally {
//       setIsTyping(false);
//       setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
//     }
//   }, [isTyping]);

//   return (
//     <KeyboardAvoidingView
//       style={styles.container}
//       behavior={Platform.OS === 'ios' ? 'padding' : undefined}
//       keyboardVerticalOffset={90}
//     >
//       {/* Header */}
//       <View style={styles.header}>
//         <Text style={styles.title}>AI Mentor</Text>
//         <View style={styles.aiDot} />
//       </View>

//       {/* Message list */}
//       <FlatList
//         ref={listRef}
//         data={messages}
//         keyExtractor={(_, i) => String(i)}
//         renderItem={({ item }) => <ChatBubble message={item} />}
//         contentContainerStyle={styles.messageList}
//         ListEmptyComponent={
//           <View style={styles.emptyChat}>
//             <Text style={styles.emptyIcon}>◆</Text>
//             <Text style={styles.emptyTitle}>Your SMC Mentor</Text>
//             <Text style={styles.emptySubtitle}>
//               Ask anything about Smart Money Concepts, signal setups, or trade reviews.
//             </Text>
//           </View>
//         }
//         ListFooterComponent={isTyping ? <TypingIndicator /> : null}
//         onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
//       />

//       {/* Quick actions */}
//       {messages.length === 0 && (
//         <View style={styles.quickActions}>
//           {QUICK_ACTIONS.map((action) => (
//             <TouchableOpacity
//               key={action}
//               style={styles.quickChip}
//               onPress={() => sendMessage(action)}
//             >
//               <Text style={styles.quickChipText}>{action}</Text>
//             </TouchableOpacity>
//           ))}
//         </View>
//       )}

//       {/* Input bar */}
//       <View style={styles.inputRow}>
//         <TextInput
//           style={styles.input}
//           value={input}
//           onChangeText={setInput}
//           placeholder="Ask your SMC mentor..."
//           placeholderTextColor={colors.textMuted}
//           multiline
//           maxLength={500}
//           returnKeyType="send"
//           onSubmitEditing={() => sendMessage(input)}
//         />
//         <TouchableOpacity
//           style={[styles.sendBtn, (!input.trim() || isTyping) && styles.sendBtnDisabled]}
//           onPress={() => sendMessage(input)}
//           disabled={!input.trim() || isTyping}
//         >
//           {isTyping
//             ? <ActivityIndicator color={colors.background} size="small" />
//             : <Text style={styles.sendIcon}>↑</Text>
//           }
//         </TouchableOpacity>
//       </View>
//     </KeyboardAvoidingView>
//   );
// }

// const styles = StyleSheet.create({
//   container: { flex: 1, backgroundColor: colors.background },
//   header: {
//     flexDirection:  'row',
//     alignItems:     'center',
//     justifyContent: 'space-between',
//     paddingHorizontal: spacing.md,
//     paddingTop:        spacing.lg,
//     paddingBottom:     spacing.sm,
//     borderBottomWidth: 1,
//     borderBottomColor: colors.border,
//   },
//   title: { color: colors.textPrimary, fontSize: font.size.xxl, fontWeight: font.weight.bold },
//   aiDot: {
//     width:           10,
//     height:          10,
//     borderRadius:    radius.full,
//     backgroundColor: colors.accentPurple,
//   },
//   messageList:  { paddingVertical: spacing.md, flexGrow: 1 },
//   emptyChat: {
//     flex:           1,
//     alignItems:     'center',
//     justifyContent: 'center',
//     padding:        spacing.xl,
//     marginTop:      spacing.xxl,
//   },
//   emptyIcon:     { fontSize: 40, color: colors.accentPurple, marginBottom: spacing.md },
//   emptyTitle:    { color: colors.textPrimary,   fontSize: font.size.xl,  fontWeight: font.weight.bold, marginBottom: spacing.sm },
//   emptySubtitle: { color: colors.textSecondary, fontSize: font.size.md,  textAlign: 'center', lineHeight: 22 },
//   quickActions: {
//     flexDirection:  'row',
//     flexWrap:       'wrap',
//     gap:            spacing.sm,
//     paddingHorizontal: spacing.md,
//     marginBottom:   spacing.sm,
//   },
//   quickChip: {
//     backgroundColor: colors.surface,
//     borderRadius:    radius.full,
//     paddingHorizontal: spacing.md,
//     paddingVertical:   spacing.sm,
//     borderWidth:     1,
//     borderColor:     colors.accentPurple + '55',
//   },
//   quickChipText: { color: colors.accentPurple, fontSize: font.size.sm },
//   inputRow: {
//     flexDirection:  'row',
//     alignItems:     'flex-end',
//     paddingHorizontal: spacing.md,
//     paddingVertical:   spacing.sm,
//     borderTopWidth:    1,
//     borderTopColor:    colors.border,
//     gap:               spacing.sm,
//   },
//   input: {
//     flex:            1,
//     backgroundColor: colors.surface,
//     borderRadius:    radius.md,
//     padding:         spacing.sm,
//     color:           colors.textPrimary,
//     fontSize:        font.size.md,
//     borderWidth:     1,
//     borderColor:     colors.border,
//     maxHeight:       100,
//   },
//   sendBtn: {
//     width:           44,
//     height:          44,
//     borderRadius:    radius.full,
//     backgroundColor: colors.accentBlue,
//     alignItems:      'center',
//     justifyContent:  'center',
//   },
//   sendBtnDisabled: { opacity: 0.4 },
//   sendIcon: { color: colors.background, fontSize: font.size.xl, fontWeight: font.weight.bold },
// });











// FILE: apps/mobile/app/(tabs)/ai-chat.tsx
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, ScrollView,
} from "react-native";
import { useState, useRef, useEffect } from "react";
import { Colors } from "../../utils/theme";
import { apiAiChat } from "../../services/api";
import ChatBubble from "../../components/ChatBubble";

type Message = { id: string; role: "user" | "assistant"; content: string; timestamp: number };

const QUICK_ACTIONS = [
  "Explain last signal",
  "Quiz me on Order Blocks",
  "Review my last trade",
  "What is a liquidity sweep?",
];

export default function AiChatScreen() {
  const [messages,  setMessages]  = useState<Message[]>([]);
  const [input,     setInput]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Greeting on mount
  useEffect(() => {
    setMessages([{
      id: "intro",
      role: "assistant",
      content: "👋 I'm your SMC trading mentor. I can explain signals, review trades, quiz you on concepts, and help you develop your edge.\n\nWhat would you like to work on?",
      timestamp: Date.now(),
    }]);
  }, []);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text.trim(),
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const { response } = await apiAiChat(text.trim());
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Sorry, I'm temporarily unavailable. Please try again in a moment.",
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
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.aiAvatar}>
          <Text style={styles.aiAvatarText}>AI</Text>
        </View>
        <View>
          <Text style={styles.title}>SMC Mentor</Text>
          <Text style={styles.subtitle}>Context-aware · SMC expert</Text>
        </View>
      </View>

      {/* Messages */}
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

      {/* Quick actions */}
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
              onPress={() => sendMessage(action)}
              activeOpacity={0.8}
            >
              <Text style={styles.quickChipText}>{action}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Input bar */}
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
          onSubmitEditing={() => sendMessage(input)}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
          onPress={() => sendMessage(input)}
          disabled={!input.trim() || loading}
          activeOpacity={0.8}
        >
          <Text style={styles.sendBtnText}>→</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  aiAvatar: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.purple, alignItems: "center", justifyContent: "center",
  },
  aiAvatarText:{ fontSize: 12, fontWeight: "800", color: "#fff" },
  title:    { fontSize: 18, fontWeight: "800", color: Colors.text },
  subtitle: { fontSize: 12, color: Colors.muted, marginTop: 2 },

  messageList: { padding: 16, paddingBottom: 8, gap: 4 },

  typingWrap:  { paddingLeft: 16, paddingBottom: 8 },
  typingBubble:{
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.surface, alignSelf: "flex-start",
    padding: 12, borderRadius: 16, borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: Colors.border,
  },
  typingText: { fontSize: 13, color: Colors.muted },

  quickRow: { maxHeight: 52, marginBottom: 8 },
  quickChip: {
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 20, borderWidth: 1,
    borderColor: Colors.purple, backgroundColor: "rgba(123,47,190,0.1)",
  },
  quickChipText: { fontSize: 12, color: Colors.purple, fontWeight: "600" },

  inputRow: {
    flexDirection: "row", alignItems: "flex-end", gap: 10,
    paddingHorizontal: 16, paddingBottom: Platform.OS === "ios" ? 34 : 20, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  input: {
    flex: 1, backgroundColor: Colors.surface, borderWidth: 1,
    borderColor: Colors.border, borderRadius: 20, paddingHorizontal: 16,
    paddingVertical: 10, color: Colors.text, fontSize: 15, maxHeight: 100,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { fontSize: 20, color: "#000", fontWeight: "800" },
});