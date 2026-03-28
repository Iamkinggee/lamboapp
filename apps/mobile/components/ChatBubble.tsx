// FILE: apps/mobile/components/ChatBubble.tsx
import { View, Text, StyleSheet } from "react-native";
import { Colors } from "../utils/theme";

type Message = {
  id:        string;
  role:      "user" | "assistant";
  content:   string;
  timestamp: number;
};

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-GB", {
    hour:   "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function ChatBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <View style={[styles.wrap, isUser ? styles.wrapUser : styles.wrapAI]}>
      {!isUser && (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>AI</Text>
        </View>
      )}
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAI]}>
        <Text style={[styles.text, isUser ? styles.textUser : styles.textAI]}>
          {message.content}
        </Text>
        <Text style={styles.time}>{fmtTime(message.timestamp)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection:  "row",
    alignItems:     "flex-end",
    gap:            8,
    marginBottom:   10,
  },
  wrapUser: { justifyContent: "flex-end" },
  wrapAI:   { justifyContent: "flex-start" },

  avatar: {
    width:           28,
    height:          28,
    borderRadius:    8,
    backgroundColor: Colors.accentPurple, // was Colors.purple — correct key is accentPurple
    alignItems:      "center",
    justifyContent:  "center",
    flexShrink:      0,
  },
  avatarText: { fontSize: 9, fontWeight: "800", color: "#fff" },

  bubble: {
    maxWidth:     "78%",
    padding:      12,
    borderRadius: 16,
    borderWidth:  1,
  },
  bubbleUser: {
    backgroundColor:      Colors.accent,
    borderColor:          Colors.accent,
    borderBottomRightRadius: 4,
  },
  bubbleAI: {
    backgroundColor:     Colors.surface,
    borderColor:         Colors.border,
    borderBottomLeftRadius: 4,
  },

  text:     { fontSize: 14, lineHeight: 21 },
  textUser: { color: "#000", fontWeight: "600" },
  textAI:   { color: Colors.text },

  time: { fontSize: 10, marginTop: 4, opacity: 0.5, alignSelf: "flex-end" },
});