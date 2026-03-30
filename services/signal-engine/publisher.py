# # FILE: services/signal-engine/publisher.py
# """
# Redis Pub/Sub Publisher
# Publishes SMC signals to the 'signals:live' channel.
# Also maintains a sorted-set history cache for the REST API.
# """

# import asyncio
# import logging
# import os

# import redis.asyncio as aioredis

# log = logging.getLogger("engine.publisher")

# REDIS_URL = os.getenv("UPSTASH_REDIS_URL", "redis://localhost:6379")
# CHANNEL   = "signals:live"


# class RedisPublisher:
#     """Handles all Redis writes for the signal engine."""

#     def __init__(self):
#         self._client = None

#     async def connect(self):
#         """Open and verify the Redis connection."""
#         self._client = aioredis.from_url(
#             REDIS_URL,
#             decode_responses=True,
#             socket_timeout=10,
#             socket_connect_timeout=10,
#         )
#         await self._client.ping()
#         log.info(f"✅ Redis connected: {REDIS_URL[:50]}...")

#     async def publish(self, signal) -> None:
#         """
#         Publish a Signal object to Redis.
#         - Pub/Sub channel: real-time delivery to Node.js
#         - Sorted set: history cache for REST /signals endpoint
#         """
#         if self._client is None:
#             log.error("Redis client not connected — call connect() first")
#             return

#         payload = signal.to_json()

#         # Live pub/sub delivery
#         await self._client.publish(CHANNEL, payload)

#         # Persist to sorted set keyed by timestamp (ms)
#         await self._client.zadd("signals:history", {payload: signal.timestamp})

#         # Keep only last 500 signals
#         await self._client.zremrangebyrank("signals:history", 0, -501)

#         log.info(f"📡 Published: {signal.pair} {signal.type} "
#                  f"conf={signal.confidence_score}% RR={signal.risk_reward}")

#     async def heartbeat(self, stop: asyncio.Event) -> None:
#         """Write a heartbeat key every 30s so ops can monitor liveness."""
#         while not stop.is_set():
#             try:
#                 if self._client:
#                     await self._client.set("engine:heartbeat", "alive", ex=60)
#             except Exception as exc:
#                 log.warning(f"Heartbeat write failed: {exc}")
#             await asyncio.sleep(30)

#     async def close(self) -> None:
#         """Gracefully close the Redis connection."""
#         if self._client:
#             await self._client.aclose()
#             self._client = None
#             log.info("Redis connection closed")














# FILE: services/signal-engine/publisher.py

import asyncio
import logging
import os
import json

import httpx
import redis.asyncio as aioredis

log = logging.getLogger("engine.publisher")

REDIS_URL       = os.getenv("UPSTASH_REDIS_URL", "redis://localhost:6379")
CHANNEL         = "signals:live"
BACKEND_URL     = os.getenv("BACKEND_URL", "http://13.40.3.171:3001")
INTERNAL_SECRET = os.getenv("INTERNAL_SECRET", "your-internal-secret")


class RedisPublisher:
    """Handles all Redis writes and backend HTTP emission for the signal engine."""

    def __init__(self):
        self._client      = None
        self._http_client = None

    async def connect(self):
        """Open and verify the Redis connection and HTTP client."""
        self._client = aioredis.from_url(
            REDIS_URL,
            decode_responses=True,
            socket_timeout=10,
            socket_connect_timeout=10,
        )
        await self._client.ping()
        log.info(f"✅ Redis connected: {REDIS_URL[:50]}...")

        self._http_client = httpx.AsyncClient(timeout=10.0)

        # Verify backend is reachable
        try:
            resp = await self._http_client.get(f"{BACKEND_URL}/health")
            if resp.status_code == 200:
                log.info(f"✅ Backend connected: {BACKEND_URL}")
            else:
                log.warning(f"⚠️  Backend responded {resp.status_code}")
        except Exception as e:
            log.warning(f"⚠️  Backend not reachable at startup: {e}")

    async def publish(self, signal) -> None:
        """
        Publish a Signal object:
        1. Redis Pub/Sub — real-time delivery
        2. Redis sorted set — history cache
        3. HTTP POST to backend — triggers FCM push notifications
        """
        if self._client is None:
            log.error("Redis client not connected — call connect() first")
            return

        payload = signal.to_json()

        # 1. Live pub/sub delivery
        await self._client.publish(CHANNEL, payload)

        # 2. Persist to sorted set keyed by timestamp (ms)
        await self._client.zadd("signals:history", {payload: signal.timestamp})
        await self._client.zremrangebyrank("signals:history", 0, -501)

        log.info(
            f"📡 Published to Redis: {signal.pair} {signal.type} "
            f"conf={signal.confidence_score}% RR={signal.risk_reward}"
        )

        # 3. HTTP POST → backend → FCM push
        await self._emit_to_backend(signal)

    async def _emit_to_backend(self, signal) -> None:
        """POST signal to Node.js backend which saves to Supabase and sends FCM."""
        if self._http_client is None:
            log.warning("HTTP client not initialised — skipping backend emit")
            return

        try:
            # Build payload matching your backend's expected shape
            body = {
                "pair":             signal.pair,
                "type":             signal.type,
                "entry":            signal.entry,
                "stop_loss":        signal.stop_loss,
                "take_profit":      signal.take_profit,
                "risk_reward":      signal.risk_reward,
                "confidence_score": signal.confidence_score,
                "confluences":      signal.confluences if isinstance(signal.confluences, list) else list(signal.confluences),
                "htf_bias":         signal.htf_bias,
                "entry_model":      signal.entry_model,
                "timeframe":        signal.timeframe,
                "htf_timeframe":    getattr(signal, "htf_timeframe", "4h"),
                "ai_explanation":   getattr(signal, "ai_explanation", ""),
            }

            resp = await self._http_client.post(
                f"{BACKEND_URL}/internal/signal",
                json=body,
                headers={
                    "Content-Type":      "application/json",
                    "x-internal-secret": INTERNAL_SECRET,
                },
            )

            if resp.status_code == 200:
                data = resp.json()
                log.info(
                    f"✅ Backend received signal — "
                    f"pushed to {data.get('pushed', 0)} device(s)"
                )
            else:
                log.warning(
                    f"⚠️  Backend returned {resp.status_code}: {resp.text[:200]}"
                )

        except httpx.TimeoutException:
            log.error("Backend emit timed out — signal saved to Redis but FCM skipped")
        except httpx.RequestError as e:
            log.error(f"Backend emit failed (network): {e}")
        except Exception as e:
            log.error(f"Backend emit unexpected error: {e}", exc_info=True)

    async def heartbeat(self, stop: asyncio.Event) -> None:
        """Write a heartbeat key every 30s so ops can monitor liveness."""
        while not stop.is_set():
            try:
                if self._client:
                    await self._client.set("engine:heartbeat", "alive", ex=60)
                    log.debug("Heartbeat written")
            except Exception as exc:
                log.warning(f"Heartbeat write failed: {exc}")
            await asyncio.sleep(30)

    async def close(self) -> None:
        """Gracefully close all connections."""
        if self._client:
            await self._client.aclose()
            self._client = None
            log.info("Redis connection closed")
        if self._http_client:
            await self._http_client.aclose()
            self._http_client = None
            log.info("HTTP client closed")