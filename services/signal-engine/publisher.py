# FILE: services/signal-engine/publisher.py
# Publishes SMC signals to Redis + backend HTTP.
# Now fetches a real AI explanation from the ai-assistant service
# before publishing, replacing the blank ai_explanation placeholder.

import asyncio
import logging
import os
import json

import httpx
import redis.asyncio as aioredis

log = logging.getLogger("engine.publisher")

REDIS_URL        = os.getenv("UPSTASH_REDIS_URL", "redis://localhost:6379")
CHANNEL          = "signals:live"
BACKEND_URL      = os.getenv("BACKEND_URL", "http://13.40.3.171:3001")
AI_SERVICE_URL   = os.getenv("AI_SERVICE_URL", "http://localhost:8001")
INTERNAL_SECRET  = os.getenv("INTERNAL_SECRET", "your-internal-secret")

# Synthetic user_id used when fetching explanation at publish time.
# The AI service uses this to look up skill level (falls back to INTERMEDIATE).
SYSTEM_USER_ID = "system"


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

        self._http_client = httpx.AsyncClient(timeout=15.0)

        try:
            resp = await self._http_client.get(f"{BACKEND_URL}/health")
            if resp.status_code == 200:
                log.info(f"✅ Backend connected: {BACKEND_URL}")
            else:
                log.warning(f"⚠️  Backend responded {resp.status_code}")
        except Exception as e:
            log.warning(f"⚠️  Backend not reachable at startup: {e}")

    async def _fetch_ai_explanation(self, signal) -> str:
        """
        Call the AI assistant /explain endpoint to generate a real analysis.
        Returns the explanation string, or "" on failure so the signal
        still publishes without blocking.
        """
        if self._http_client is None:
            return ""

        body = {
            "user_id": SYSTEM_USER_ID,
            "signal": {
                "signal_id":        getattr(signal, "signal_id", ""),
                "pair":             signal.pair,
                "type":             signal.type.value if hasattr(signal.type, "value") else signal.type,
                "entry":            signal.entry,
                "stop_loss":        signal.stop_loss,
                "take_profit":      signal.take_profit,
                "risk_reward":      signal.risk_reward,
                "confidence_score": signal.confidence_score,
                "confluences":      signal.confluences if isinstance(signal.confluences, list) else list(signal.confluences),
                "htf_bias":         signal.htf_bias.value if hasattr(signal.htf_bias, "value") else signal.htf_bias,
                "entry_model":      signal.entry_model.value if hasattr(signal.entry_model, "value") else signal.entry_model,
                "timeframe":        signal.timeframe,
                "htf_timeframe":    getattr(signal, "htf_timeframe", "4h"),
            },
        }

        try:
            resp = await self._http_client.post(
                f"{AI_SERVICE_URL}/explain",
                json=body,
                timeout=20.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                explanation = data.get("explanation", "")
                log.info(f"✅ AI explanation fetched for {signal.pair} ({len(explanation)} chars)")
                return explanation
            else:
                log.warning(f"⚠️  AI service returned {resp.status_code} for {signal.pair}")
                return ""
        except httpx.TimeoutException:
            log.warning(f"⚠️  AI explain timed out for {signal.pair} — publishing without explanation")
            return ""
        except Exception as e:
            log.warning(f"⚠️  AI explain failed for {signal.pair}: {e}")
            return ""

    async def publish(self, signal) -> None:
        """
        Publish a Signal object:
        1. Fetch real AI explanation (non-blocking fallback on failure)
        2. Redis Pub/Sub — real-time delivery
        3. Redis sorted set — history cache
        4. HTTP POST to backend — saves to Supabase + triggers FCM push
        """
        if self._client is None:
            log.error("Redis client not connected — call connect() first")
            return

        # FIX: Fetch real AI explanation BEFORE publishing.
        # Previous code sent ai_explanation="" (empty / placeholder).
        ai_explanation = await self._fetch_ai_explanation(signal)
        signal.ai_explanation = ai_explanation

        payload = signal.to_json()

        # Redis Pub/Sub delivery
        await self._client.publish(CHANNEL, payload)

        # Persist to sorted set keyed by timestamp (ms)
        await self._client.zadd("signals:history", {payload: signal.timestamp})
        await self._client.zremrangebyrank("signals:history", 0, -501)

        log.info(
            f"📡 Published to Redis: {signal.pair} {signal.type} "
            f"conf={signal.confidence_score}% RR={signal.risk_reward} "
            f"ai={len(ai_explanation) > 0}"
        )

        # HTTP POST → backend → Supabase + FCM push
        await self._emit_to_backend(signal)

    async def _emit_to_backend(self, signal) -> None:
        """POST signal to Node.js backend which saves to Supabase and sends FCM."""
        if self._http_client is None:
            log.warning("HTTP client not initialised — skipping backend emit")
            return

        try:
            body = {
                "pair":             signal.pair,
                "type":             signal.type.value if hasattr(signal.type, "value") else signal.type,
                "entry":            signal.entry,
                "stop_loss":        signal.stop_loss,
                "take_profit":      signal.take_profit,
                "risk_reward":      signal.risk_reward,
                "confidence_score": signal.confidence_score,
                "confluences":      signal.confluences if isinstance(signal.confluences, list) else list(signal.confluences),
                "htf_bias":         signal.htf_bias.value if hasattr(signal.htf_bias, "value") else signal.htf_bias,
                "entry_model":      signal.entry_model.value if hasattr(signal.entry_model, "value") else signal.entry_model,
                "timeframe":        signal.timeframe,
                "htf_timeframe":    getattr(signal, "htf_timeframe", "4h"),
                "ai_explanation":   signal.ai_explanation,  # now always a real explanation
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