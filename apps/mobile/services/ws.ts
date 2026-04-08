// LOCATION: apps/mobile/services/ws.ts
// WebSocket service — singleton connection manager

import { getToken } from './api';
import { SMCSignal } from './api';

const WS_URL = process.env.EXPO_PUBLIC_WS_URL ?? (() => {
  throw new Error('[Config] EXPO_PUBLIC_WS_URL is not set. Add it to your .env file.');
})();

type WSStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING';
type SignalHandler = (signal: SMCSignal) => void;
type StatusHandler = (status: WSStatus) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private status: WSStatus = 'DISCONNECTED';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 20;
  private authenticated = false;
  private connecting = false;

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
    if (this.status === 'CONNECTED' || this.status === 'CONNECTING' || this.connecting) return;
    this.reconnectAttempts = 0;
    this._connect();
  }

  disconnect(): void {
    this.reconnectAttempts = this.maxReconnectAttempts;
    this.connecting = false;
    this._cleanup();
    this._setStatus('DISCONNECTED');
  }

  getStatus(): WSStatus {
    return this.status;
  }

  // ── Internal ────────────────────────────────

  private async _connect(): Promise<void> {
    if (this.connecting) return;
    this.connecting = true;

    this._setStatus(this.reconnectAttempts > 0 ? 'RECONNECTING' : 'CONNECTING');
    this.authenticated = false;

    const token = await getToken();
    if (!token) {
      console.warn('[WS] No token yet — will retry in 3s');
      this.connecting = false;
      this.reconnectTimer = setTimeout(() => this._connect(), 3000);
      return;
    }

    try {
      const header = JSON.parse(atob(token.split('.')[0]));
      console.log('[WS] Token alg:', header.alg, '| typ:', header.typ);
    } catch {
      console.warn('[WS] Could not decode token header');
    }

    try {
      this.ws = new WebSocket(WS_URL);
    } catch (err) {
      console.error('[WS] Failed to create WebSocket:', err);
      this.connecting = false;
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log('[WS] Socket open — sending auth');
      this.send({ type: 'auth', token });
    };

    this.ws.onmessage = (event) => {
      let msg: { event: string; data: unknown };
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        console.warn('[WS] Malformed message — skipping');
        return;
      }

      if (msg.event === 'error') {
        const errMsg = (msg.data as { message?: string })?.message ?? String(msg.data);
        console.error('[WS] Server error:', errMsg);
        if (errMsg.toLowerCase().includes('token') || errMsg.toLowerCase().includes('auth')) {
          console.warn('[WS] Auth error — will refresh token on reconnect');
          this.ws?.close();
        }
        return;
      }

      if (msg.event === 'ping') {
        this.send({ type: 'pong' });
        if (!this.authenticated) {
          this.authenticated = true;
          this.connecting = false;
          this._setStatus('CONNECTED');
          this.reconnectAttempts = 0;
          console.log('[WS] Authenticated and connected');
          if (this.subscribedPairs.length > 0) {
            this.send({ type: 'subscribe', pairs: this.subscribedPairs });
          }
        }
        return;
      }

      if (msg.event === 'auth_ok' || msg.event === 'authenticated') {
        this.authenticated = true;
        this.connecting = false;
        this._setStatus('CONNECTED');
        this.reconnectAttempts = 0;
        console.log('[WS] Auth confirmed by server');
        if (this.subscribedPairs.length > 0) {
          this.send({ type: 'subscribe', pairs: this.subscribedPairs });
        }
        return;
      }

      if (!this.authenticated) {
        console.warn('[WS] Message received before auth — ignoring:', msg.event);
        return;
      }

      if (msg.event === 'signal:new') {
        const signal = msg.data as SMCSignal;
        console.log(`[WS] New signal: ${signal.type} ${signal.pair} @ ${signal.entry}`);
        this.signalHandlers.forEach((h) => h(signal));
      }
    };

    this.ws.onerror = (err) => {
      console.error('[WS] Connection error:', err);
    };

    this.ws.onclose = (event: Event) => {
      const { code, wasClean } = event as unknown as { code: number; wasClean: boolean };
      console.warn(`[WS] Closed — code: ${code}, clean: ${wasClean}`);
      this.authenticated = false;
      this.connecting = false;
      this._cleanup();
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this._scheduleReconnect();
      } else {
        console.error('[WS] Max reconnect attempts reached — giving up');
        this._setStatus('DISCONNECTED');
      }
    };
  }

  private send(data: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('[WS] send() called but socket not open — dropping');
    }
  }

  private _scheduleReconnect(): void {
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30_000);
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    this._setStatus('RECONNECTING');
    this.reconnectTimer = setTimeout(() => this._connect(), delay);
  }

  private _cleanup(): void {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.ws) {
      this.ws.onopen    = null;
      this.ws.onmessage = null;
      this.ws.onerror   = null;
      this.ws.onclose   = null;
      this.ws.close();
      this.ws = null;
    }
  }

  private _setStatus(status: WSStatus): void {
    if (this.status === status) return;
    this.status = status;
    console.log(`[WS] Status → ${status}`);
    this.statusHandlers.forEach((h) => h(status));
  }
}

export const wsService = new WebSocketService();
