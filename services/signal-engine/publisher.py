# FILE: services/signal-engine/publisher.py
"""
Redis Pub/Sub Publisher
Publishes SMC signals to the 'signals:live' channel.
Also maintains a sorted-set history cache for the REST API.
"""

import asyncio
import logging
import os

import redis.asyncio as aioredis

log = logging.getLogger("engine.publisher")

REDIS_URL = os.getenv("UPSTASH_REDIS_URL", "redis://localhost:6379")
CHANNEL   = "signals:live"


class RedisPublisher:
    """Handles all Redis writes for the signal engine."""

    def __init__(self):
        self._client = None

    async def connect(self):
        """Open and verify the Redis connection."""
        self._client = aioredis.from_url(
            REDIS_URL,
            decode_responses=True,
            socket_timeout=10,
            socket_connect_timeout=10,
        )
        await self._client.ping()
        log.info(f"✅ Redis connected: {REDIS_URL[:50]}...")

    async def publish(self, signal) -> None:
        """
        Publish a Signal object to Redis.
        - Pub/Sub channel: real-time delivery to Node.js
        - Sorted set: history cache for REST /signals endpoint
        """
        if self._client is None:
            log.error("Redis client not connected — call connect() first")
            return

        payload = signal.to_json()

        # Live pub/sub delivery
        await self._client.publish(CHANNEL, payload)

        # Persist to sorted set keyed by timestamp (ms)
        await self._client.zadd("signals:history", {payload: signal.timestamp})

        # Keep only last 500 signals
        await self._client.zremrangebyrank("signals:history", 0, -501)

        log.info(f"📡 Published: {signal.pair} {signal.type} "
                 f"conf={signal.confidence_score}% RR={signal.risk_reward}")

    async def heartbeat(self, stop: asyncio.Event) -> None:
        """Write a heartbeat key every 30s so ops can monitor liveness."""
        while not stop.is_set():
            try:
                if self._client:
                    await self._client.set("engine:heartbeat", "alive", ex=60)
            except Exception as exc:
                log.warning(f"Heartbeat write failed: {exc}")
            await asyncio.sleep(30)

    async def close(self) -> None:
        """Gracefully close the Redis connection."""
        if self._client:
            await self._client.aclose()
            self._client = None
            log.info("Redis connection closed")