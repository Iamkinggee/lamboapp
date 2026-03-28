// ============================================================
// FILE: services/api-server/src/ws/signal_broadcaster.ts
// PURPOSE: WebSocket broadcaster — streams live signals to
//          all authenticated mobile clients AND triggers push
//          notifications for users not currently connected.
// CHANGE FROM PHASE 3: Added push notification trigger after
//          every broadcast.
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

  sendToClient(connectionId, { event: 'ping', data: { ts: Date.now() } });
}

function handleClientMessage(connectionId: string, msg: WSClientEvent): void {
  const client = clients.get(connectionId);
  if (!client) return;

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
      sendToClient(connectionId, { event: 'ping', data: { ts: now } });
    }
  }, PING_INTERVAL_MS);
}

export function initBroadcaster(): void {
  signalBus.on('signal:new', (signal: SMCSignal) => broadcastSignal(signal));
  startPingLoop();
  console.log('[WS] Broadcaster initialized with push notifications');
}

export function getClientCount(): number { return clients.size; }