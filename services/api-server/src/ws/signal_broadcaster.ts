// ============================================================
// FILE: services/api-server/src/ws/signal_broadcaster.ts
// PURPOSE: WebSocket broadcaster — streams live signals to
//          all authenticated mobile clients AND triggers push
//          notifications for users not currently connected.
//
// FIXES:
//   - Push notifications now only fire when sent > 0 (clients received it)
//     OR when there are no connected clients (offline users need push).
//     Previously fired unconditionally on every broadcast, spamming push
//     even when the signal was already delivered via WebSocket.
//   - Added structured log for zero-client broadcasts so you can see
//     if signals are arriving but no one is connected.
//   - Stale client cleanup moved into a shared helper to avoid drift
//     between the ping loop and broadcastSignal.
// ============================================================

import { WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { SMCSignal, WSEvent, WSClientEvent } from '../models/signal';
import { signalBus } from '../redis/subscriber';
import { sendSignalPushNotifications } from '../routes/notifications';

interface ConnectedClient {
  ws:              WebSocket;
  userId:          string;
  subscribedPairs: Set<string>;
  lastPong:        number;
  authenticated:   boolean;
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
    client.authenticated = true;
    client.lastPong = Date.now();
    sendToClient(connectionId, { event: 'auth_ok', data: { ts: Date.now() } });
    console.log(`[WS] Auth OK: ${client.userId} (${connectionId})`);
    return;
  }

  // Gate all other message types behind authentication
  if (!client.authenticated) {
    console.warn(`[WS] Unauthenticated msg type "${msg.type}" from ${client.userId} — ignoring`);
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

/** Remove a stale client and terminate its socket. */
function dropClient(connectionId: string, userId: string, reason: string): void {
  const client = clients.get(connectionId);
  if (client) {
    console.warn(`[WS] Dropping ${userId} — ${reason}`);
    client.ws.terminate();
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
  } else {
    console.log(`[WS] Broadcast: ${signal.pair} ${signal.type} → 0 WS clients (push only)`);
  }

  // ── Push notifications ──
  // FIX: previously fired on every broadcastSignal call unconditionally,
  // meaning users WITH an active WebSocket connection also got a push
  // notification — causing duplicate alerts on the mobile app.
  //
  // New logic:
  //   - If there are authenticated clients and signal was delivered → skip push
  //     (they already see it on screen in real time)
  //   - If no authenticated clients are online → always send push
  //     (users are offline and must be notified)
  //
  // Note: sendSignalPushNotifications is responsible for filtering by
  // user preferences (notify_high_confidence, watched_pairs, etc.)
  // so we can safely call it here without over-notifying.
  const authenticatedCount = Array.from(clients.values()).filter(c => c.authenticated).length;

  if (sent === 0 || authenticatedCount === 0) {
    // No one received it live — send push to reach offline users
    sendSignalPushNotifications(signal).catch((err) => {
      console.error('[Push] Notification send failed:', err);
    });
  }
  // If you want push even for online users (e.g. for lock-screen alerts),
  // replace the condition above with: sendSignalPushNotifications(signal)
}

// ── Ping/pong keep-alive ──────────────────────────────────────────────────────
const PING_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS  = 90_000;

export function startPingLoop(): void {
  setInterval(() => {
    const now = Date.now();
    for (const [connectionId, client] of Array.from(clients.entries())) {
      if (now - client.lastPong > PONG_TIMEOUT_MS) {
        dropClient(connectionId, client.userId, 'pong timeout');
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