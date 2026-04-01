// LOCATION: apps/mobile/services/ws.ts
// ──────────────────────────────────────────────
// apps/mobile/services/ws.ts
// WebSocket service — singleton connection manager
// ──────────────────────────────────────────────
import { getToken } from './api';
import { SMCSignal } from './api';

const WS_URL = process.env.EXPO_PUBLIC_WS_URL ?? 'ws://13.40.3.171:3001/ws';

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
  private authenticated = false;

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
    // Reset reconnect counter on a fresh manual connect
    this.reconnectAttempts = 0;
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
    this.authenticated = false;

    // Always fetch a fresh token on every connection attempt
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
      console.log('[WS] Socket open — sending auth');
      // Send both `token` and `authorization` field names to handle server variants
      this.send({ type: 'auth', token, authorization: token });
    };

    this.ws.onmessage = (event) => {
      let msg: { event: string; data: unknown };
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        console.warn('[WS] Malformed message — skipping');
        return;
      }

      // ── Auth error from server ───────────────
      if (msg.event === 'error') {
        const errMsg = (msg.data as { message?: string })?.message ?? String(msg.data);
        console.error('[WS] Server error:', errMsg);
        // On auth error, close and trigger a fresh token reconnect
        if (errMsg.toLowerCase().includes('token') || errMsg.toLowerCase().includes('auth')) {
          console.warn('[WS] Auth error — will refresh token on reconnect');
          this.ws?.close();
        }
        return;
      }

      // ── Ping / connection confirmation ───────
      if (msg.event === 'ping') {
        this.send({ type: 'pong' });

        if (!this.authenticated) {
          this.authenticated = true;
          this._setStatus('CONNECTED');
          this.reconnectAttempts = 0;
          console.log('[WS] Authenticated and connected');

          if (this.subscribedPairs.length > 0) {
            this.send({ type: 'subscribe', pairs: this.subscribedPairs });
          }
        }
        return;
      }

      // ── auth_ok from some server implementations ──
      if (msg.event === 'auth_ok' || msg.event === 'authenticated') {
        this.authenticated = true;
        this._setStatus('CONNECTED');
        this.reconnectAttempts = 0;
        console.log('[WS] Auth confirmed by server');
        if (this.subscribedPairs.length > 0) {
          this.send({ type: 'subscribe', pairs: this.subscribedPairs });
        }
        return;
      }

      // ── Drop messages that arrive before auth ─
      if (!this.authenticated) {
        console.warn('[WS] Message received before auth — ignoring:', msg.event);
        return;
      }

      // ── New signal ───────────────────────────
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
    if (this.pingInterval)   { clearInterval(this.pingInterval);  this.pingInterval   = null; }
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
    this.status = status;
    console.log(`[WS] Status → ${status}`);
    this.statusHandlers.forEach((h) => h(status));
  }
}

// Singleton
export const wsService = new WebSocketService();