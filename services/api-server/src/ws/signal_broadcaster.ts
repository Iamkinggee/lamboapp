// ============================================================
// FILE: services/api-server/src/ws/signal_broadcaster.ts
// PURPOSE: WebSocket broadcaster — streams live signals to
//          all authenticated mobile clients AND triggers push
//          notifications for users not currently connected.
//
// ARCHITECTURE NOTE:
//   Signals enter the system via ONE path only:
//     Python Engine → POST /internal/signal
//       → broadcastSignal()          (WebSocket delivery)
//       → sendSignalPushNotifications() (push delivery)
//
//   The Redis subscriber (subscriber.ts) is intentionally NOT
//   wired to broadcastSignal(). It exists only as a passive bus
//   for any future internal listeners. Wiring it to broadcast
//   caused every signal to fire twice — once from the HTTP route
//   and once from the Redis pub/sub message.
// ============================================================

import { WebSocket } from 'ws';
import { SMCSignal, WSEvent, WSClientEvent } from '../models/signal';

interface ConnectedClient {
  ws:              WebSocket;
  userId:          string;
  subscribedPairs: Set<string>;
  lastPong:        number;
  authenticated:   boolean;
}

const clients = new Map<string, ConnectedClient>();

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
}

function handleClientMessage(connectionId: string, msg: WSClientEvent): void {
  const client = clients.get(connectionId);
  if (!client) return;

  if (msg.type === 'auth') {
    client.authenticated = true;
    client.lastPong = Date.now();
    sendToClient(connectionId, { event: 'auth_ok', data: { ts: Date.now() } });
    console.log(`[WS] Auth OK: ${client.userId} (${connectionId})`);
    return;
  }

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
      if (client.authenticated) {
        sendToClient(connectionId, { event: 'ping', data: { ts: now } });
      }
    }
  }, PING_INTERVAL_MS);
}

// ── Init ──────────────────────────────────────────────────────────────────────
let initialized = false;

export function initBroadcaster(): void {
  if (initialized) {
    console.warn('[WS] initBroadcaster() called more than once — skipping');
    return;
  }
  initialized = true;

  // ✅ NO signalBus listener here.
  // broadcastSignal() is called directly by /internal/signal route.
  // Adding a signalBus listener here caused every signal to broadcast twice:
  //   once from the HTTP route and once from the Redis pub/sub message.

  startPingLoop();
  console.log('[WS] Broadcaster initialized');
}

export function getClientCount(): number { return clients.size; }