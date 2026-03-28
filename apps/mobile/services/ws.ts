// ──────────────────────────────────────────────
// apps/mobile/services/ws.ts
// WebSocket service — singleton connection manager
// ──────────────────────────────────────────────
import { getToken } from './api';
import { SMCSignal } from './api';

const WS_URL = process.env.EXPO_PUBLIC_WS_URL ?? 'ws://localhost:3001/ws';

type WSStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING';
type SignalHandler = (signal: SMCSignal) => void;
type StatusHandler = (status: WSStatus) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private status: WSStatus = 'DISCONNECTED';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  private signalHandlers: Set<SignalHandler> = new Set();
  private statusHandlers: Set<StatusHandler> = new Set();
  private subscribedPairs: string[] = [];

  // ── Public API ──────────────────────────────

  onSignal(handler: SignalHandler): () => void {
    this.signalHandlers.add(handler);
    return () => this.signalHandlers.delete(handler);
  }

  onStatusChange(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  subscribe(pairs: string[]): void {
    this.subscribedPairs = pairs;
    if (this.status === 'CONNECTED') {
      this.send({ type: 'subscribe', pairs });
    }
  }

  connect(): void {
    if (this.status === 'CONNECTED' || this.status === 'CONNECTING') return;
    this._connect();
  }

  disconnect(): void {
    this.reconnectAttempts = this.maxReconnectAttempts; // prevent auto-reconnect
    this._cleanup();
    this._setStatus('DISCONNECTED');
  }

  getStatus(): WSStatus {
    return this.status;
  }

  // ── Internal ────────────────────────────────

  private async _connect(): Promise<void> {
    this._setStatus(this.reconnectAttempts > 0 ? 'RECONNECTING' : 'CONNECTING');

    const token = await getToken();
    if (!token) {
      console.warn('[WS] No token — cannot connect');
      this._setStatus('DISCONNECTED');
      return;
    }

    try {
      this.ws = new WebSocket(WS_URL);
    } catch (err) {
      console.error('[WS] Failed to create WebSocket:', err);
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      // Step 1: authenticate
      this.send({ type: 'auth', token });
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as {
          event: string;
          data: unknown;
        };

        if (msg.event === 'ping') {
          this.send({ type: 'pong' });

          // On first ping after auth, we're confirmed connected
          if (this.status !== 'CONNECTED') {
            this._setStatus('CONNECTED');
            this.reconnectAttempts = 0;

            // Resubscribe to pairs after reconnect
            if (this.subscribedPairs.length > 0) {
              this.send({ type: 'subscribe', pairs: this.subscribedPairs });
            }
          }
          return;
        }

        if (msg.event === 'signal:new') {
          this.signalHandlers.forEach((h) => h(msg.data as SMCSignal));
        }
      } catch {
        // ignore malformed messages
      }
    };

    this.ws.onerror = () => {
      console.error('[WS] Connection error');
    };

    this.ws.onclose = () => {
      this._cleanup();
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this._scheduleReconnect();
      } else {
        this._setStatus('DISCONNECTED');
      }
    };
  }

  private send(data: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private _scheduleReconnect(): void {
    this.reconnectAttempts++;
    // Exponential backoff: 1s, 2s, 4s, 8s ... max 30s
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30_000);
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this._setStatus('RECONNECTING');
    this.reconnectTimer = setTimeout(() => this._connect(), delay);
  }

  private _cleanup(): void {
    if (this.pingInterval) { clearInterval(this.pingInterval); this.pingInterval = null; }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  private _setStatus(status: WSStatus): void {
    this.status = status;
    this.statusHandlers.forEach((h) => h(status));
  }
}

// Singleton
export const wsService = new WebSocketService();