// ============================================================
// FILE: services/api-server/src/ws/signal_broadcaster.ts
// PURPOSE: WebSocket broadcaster — streams live signals to
//          all authenticated mobile clients AND triggers push
//          notifications for users not currently connected.
// CHANGE FROM PHASE 3: Added push notification trigger after
//          every broadcast.
// FIX: Added authentication gating — clients must send auth
//      message before receiving broadcasts or pings.
// ============================================================

import { WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { SMCSignal, WSEvent, WSClientEvent } from '../models/signal';
import { signalBus } from '../redis/subscriber';
import { sendSignalPushNotifications } from '../routes/notifications';

interface ConnectedClient {
  ws:               WebSocket;
  userId:           string;
  subscribedPairs:  Set<string>;
  lastPong:         number;
  authenticated:    boolean;
}

const clients = new Map<string, ConnectedClient>();

export class SignalEventBus extends EventEmitter {
  emitSignal(signal: SMCSignal) {
    this.emit('signal:new', signal);
  }
}

export function registerClient(
  connectionId: string,
  ws: WebSocket,
  userId: string
): void {
  clients.set(connectionId, {
    ws,
    userId,
    subscribedPairs: new Set(),
    lastPong: Date.now(),
    authenticated: false,
  });

  console.log(`[WS] Client connected: ${userId} (${connectionId}) — Total: ${clients.size}`);

  ws.on('message', (rawData) => {
    try {
      const msg = JSON.parse(rawData.toString()) as WSClientEvent;
      handleClientMessage(connectionId, msg);
    } catch { /* ignore malformed */ }
  });

  ws.on('close', () => {
    clients.delete(connectionId);
    console.log(`[WS] Disconnected: ${userId} — Remaining: ${clients.size}`);
  });

  ws.on('error', (err) => {
    console.error(`[WS] Error [${userId}]:`, err.message);
    clients.delete(connectionId);
  });

  // Do NOT send ping immediately — wait for client to authenticate first
}

function handleClientMessage(connectionId: string, msg: WSClientEvent): void {
  const client = clients.get(connectionId);
  if (!client) return;

  if (msg.type === 'auth') {
    // Token is already verified upstream during the WS upgrade handshake.
    // If the client reached this point, the connection is legitimate —
    // mark them authenticated and confirm to the client.
    client.authenticated = true;
    client.lastPong = Date.now();
    sendToClient(connectionId, { event: 'auth_ok', data: { ts: Date.now() } });
    console.log(`[WS] Auth OK: ${client.userId} (${connectionId})`);
    return;
  }

  // Gate all other message types behind authentication
  if (!client.authenticated) {
    console.warn(`[WS] Unauthenticated message type "${msg.type}" from ${client.userId} — ignoring`);
    return;
  }

  if (msg.type === 'pong')        { client.lastPong = Date.now(); return; }
  if (msg.type === 'subscribe')   { msg.pairs.forEach((p) => client.subscribedPairs.add(p.toUpperCase())); return; }
  if (msg.type === 'unsubscribe') { msg.pairs.forEach((p) => client.subscribedPairs.delete(p.toUpperCase())); return; }
}

function sendToClient(connectionId: string, event: WSEvent): void {
  const client = clients.get(connectionId);
  if (!client || client.ws.readyState !== WebSocket.OPEN) return;
  try {
    client.ws.send(JSON.stringify(event));
  } catch {
    clients.delete(connectionId);
  }
}

export function broadcastSignal(signal: SMCSignal): void {
  const payload: WSEvent = { event: 'signal:new', data: signal };
  let sent = 0;

  for (const [connectionId, client] of Array.from(clients.entries())) {
    // Only broadcast to authenticated clients
    if (!client.authenticated) continue;

    if (
      client.subscribedPairs.size === 0 ||
      client.subscribedPairs.has(signal.pair.toUpperCase())
    ) {
      sendToClient(connectionId, payload);
      sent++;
    }
  }

  if (sent > 0) {
    console.log(`[WS] Broadcast: ${signal.pair} ${signal.type} → ${sent} clients`);
  }

  // ── Phase 6 addition: push notifications ──
  // Fire-and-forget — don't block broadcast for push delivery
  sendSignalPushNotifications(signal).catch((err) => {
    console.error('[Push] Notification send failed:', err);
  });
}

// ── Ping/pong keep-alive ──────────────────────
const PING_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS  = 90_000;

export function startPingLoop(): void {
  setInterval(() => {
    const now = Date.now();
    for (const [connectionId, client] of Array.from(clients.entries())) {
      if (now - client.lastPong > PONG_TIMEOUT_MS) {
        console.warn(`[WS] Dropping stale: ${client.userId}`);
        client.ws.terminate();
        clients.delete(connectionId);
        continue;
      }
      // Only ping authenticated clients
      if (client.authenticated) {
        sendToClient(connectionId, { event: 'ping', data: { ts: now } });
      }
    }
  }, PING_INTERVAL_MS);
}

export function initBroadcaster(): void {
  signalBus.on('signal:new', (signal: SMCSignal) => broadcastSignal(signal));
  startPingLoop();
  console.log('[WS] Broadcaster initialized with push notifications');
}

export function getClientCount(): number { return clients.size; }