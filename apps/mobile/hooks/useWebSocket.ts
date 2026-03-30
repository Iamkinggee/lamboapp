// apps/mobile/hooks/useWebSocket.ts
// WebSocket connection management with auto-reconnect

import { useRef, useCallback, useEffect } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useSignalStore } from "../store/useSignalStore";
import { useAuthStore } from "../store/useAuthStore";
import type { SMCSignal } from "../services/api";

// const WS_URL = process.env.EXPO_PUBLIC_WS_URL ?? "ws://localhost:3001/ws";

const WS_URL = process.env.EXPO_PUBLIC_WS_URL ?? "ws:http://13.40.3.171:3001/ws";





const MAX_BACKOFF = 30000;

export function useWebSocket() {
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const retryCount = useRef(0);
  const shouldConnect = useRef(false);

  const { addSignal, setConnected } = useSignalStore();
  const isConnected = useSignalStore((s) => s.isConnected);
  const { token } = useAuthStore();

  const clearReconnect = () => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }
  };

  const connect = useCallback(() => {
    shouldConnect.current = true;
    if (ws.current?.readyState === WebSocket.OPEN) return;

    try {
      ws.current = new WebSocket(WS_URL);

      ws.current.onopen = () => {
        retryCount.current = 0;
        setConnected(true);
        // Authenticate the WS connection with JWT
        ws.current?.send(JSON.stringify({ type: "auth", token }));
      };

      ws.current.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === "signal:new") {
            addSignal(data.payload as SMCSignal);
          }
          // Handle other event types here (signal:update, market:bias)
        } catch {
          // Non-JSON message — ignore
        }
      };

      ws.current.onclose = () => {
        setConnected(false);
        if (!shouldConnect.current) return;

        // Exponential backoff: 1s, 2s, 4s, 8s ... max 30s
        const backoff = Math.min(1000 * 2 ** retryCount.current, MAX_BACKOFF);
        retryCount.current += 1;
        console.log(`[WS] Reconnecting in ${backoff / 1000}s...`);
        reconnectTimeout.current = setTimeout(connect, backoff);
      };

      ws.current.onerror = () => {
        ws.current?.close();
      };
    } catch (err) {
      console.error("[WS] Failed to create WebSocket:", err);
    }
  }, [token, addSignal, setConnected]);

  const disconnect = useCallback(() => {
    shouldConnect.current = false;
    clearReconnect();
    ws.current?.close();
    ws.current = null;
    setConnected(false);
  }, [setConnected]);

  // Reconnect when app comes back to foreground
  useEffect(() => {
    const handleAppState = (state: AppStateStatus) => {
      if (state === "active" && shouldConnect.current) {
        connect();
      }
    };
    const sub = AppState.addEventListener("change", handleAppState);
    return () => sub.remove();
  }, [connect]);

  return { connect, disconnect, isConnected };
}