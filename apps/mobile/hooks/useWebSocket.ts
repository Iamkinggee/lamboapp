


// apps/mobile/hooks/useWebSocket.ts
import { useEffect, useCallback } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useSignalStore } from "../store/useSignalStore";
import { wsService } from "../services/ws";

export function useWebSocket() {
  const { addSignal, setConnected } = useSignalStore();
  const isConnected = useSignalStore((s) => s.isConnected);

  useEffect(() => {
    // Sync wsService status → store
    const unsubStatus = wsService.onStatusChange((status) => {
      setConnected(status === "CONNECTED");
    });

    // Pipe incoming signals → store
    const unsubSignal = wsService.onSignal((signal) => {
      addSignal(signal);
    });

    return () => {
      unsubStatus();
      unsubSignal();
    };
  }, [addSignal, setConnected]);

  // Reconnect when app comes to foreground
  useEffect(() => {
    const handleAppState = (state: AppStateStatus) => {
      if (state === "active") wsService.connect();
    };
    const sub = AppState.addEventListener("change", handleAppState);
    return () => sub.remove();
  }, []);

  const connect = useCallback(() => wsService.connect(), []);
  const disconnect = useCallback(() => wsService.disconnect(), []);

  return { connect, disconnect, isConnected };
}