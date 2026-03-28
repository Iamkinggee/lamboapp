# FILE: services/signal-engine/ws_client.py


import asyncio
import json
import logging
import time
from typing import Callable, Awaitable, List

import httpx
import websockets
from websockets.exceptions import ConnectionClosed

from models import Candle
from candle_store import CandleStore

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────
BINANCE_WS_BASE   = "wss://stream.binance.com:443/stream"
BINANCE_REST_BASE = "https://api1.binance.com/api/v3"
RECONNECT_BASE    = 1
RECONNECT_MAX     = 30
PING_INTERVAL     = 20

# Binance interval string map (our internal → Binance format)
TF_MAP = {
    "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m",
    "30m": "30m", "1h": "1h", "2h": "2h", "4h": "4h",
    "6h": "6h", "8h": "8h", "12h": "12h", "1d": "1d",
}


# ── Candle parser (REST kline row) ────────────────────────────
def _parse_rest_kline(row: list, pair: str, tf: str) -> Candle:
    """Parse a single Binance REST klines array row into a Candle."""
    return Candle(
        pair      = pair.upper(),
        timeframe = tf,
        timestamp = int(row[0]),       # open time ms
        open      = float(row[1]),
        high      = float(row[2]),
        low       = float(row[3]),
        close     = float(row[4]),
        volume    = float(row[5]),
        is_closed = True,              # REST data = historical = always closed
    )


# ── Candle parser (WebSocket kline frame) ────────────────────
def parse_kline(raw: dict) -> Candle:
    """Convert raw Binance kline WebSocket event to a Candle."""
    k = raw["k"]
    return Candle(
        pair      = k["s"],
        timeframe = k["i"],
        open      = float(k["o"]),
        high      = float(k["h"]),
        low       = float(k["l"]),
        close     = float(k["c"]),
        volume    = float(k["v"]),
        timestamp = int(k["t"]),
        is_closed = bool(k["x"]),
    )


# ── Stream URL builder ────────────────────────────────────────
def build_stream_url(pairs: List[str], timeframes: List[str]) -> str:
    streams = [
        f"{pair.lower()}@kline_{tf}"
        for pair in pairs
        for tf in timeframes
    ]
    return f"{BINANCE_WS_BASE}?streams={'/'.join(streams)}"


# ── seed_historical — seeds CandleStore from Binance REST ─────
async def seed_historical(
    store: CandleStore,
    pair: str,
    tf: str,
    limit: int = 200,
) -> None:
    """
    Fetch historical klines from Binance REST API and seed the CandleStore.
    Called once at startup before WebSocket streams begin.

    Args:
        store:  The CandleStore instance to populate
        pair:   Trading pair e.g. "BTCUSDT"
        tf:     Timeframe string e.g. "1h", "5m"
        limit:  Number of historical candles to fetch (max 1000)
    """
    binance_tf = TF_MAP.get(tf, tf)
    url = f"{BINANCE_REST_BASE}/klines"
    params = {
        "symbol":   pair.upper(),
        "interval": binance_tf,
        "limit":    min(limit, 1000),
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            rows = resp.json()

        count = 0
        for row in rows:
            candle = _parse_rest_kline(row, pair, tf)
            store.upsert(candle)
            count += 1

        logger.info(f"[Seed] {pair} {tf}: loaded {count} candles")

    except httpx.HTTPStatusError as e:
        logger.error(f"[Seed] Binance REST error for {pair} {tf}: {e.response.status_code}")
    except httpx.RequestError as e:
        logger.error(f"[Seed] Network error seeding {pair} {tf}: {e}")
    except Exception as e:
        logger.error(f"[Seed] Unexpected error for {pair} {tf}: {e}", exc_info=True)


# ── WebSocket Client ──────────────────────────────────────────
class BinanceWSClient:
    """
    Connects to Binance combined kline streams and fires
    an async callback on every closed (or live) candle.

    Usage:
        client = BinanceWSClient(pairs=["BTCUSDT"], timeframes=["1m","1h"])
        await client.start(on_candle_callback)
    """

    def __init__(
        self,
        pairs:      List[str],
        timeframes: List[str],
        on_kline:   Callable[[Candle], Awaitable[None]] = None,
    ):
        self.pairs      = [p.upper() for p in pairs]
        self.timeframes = timeframes
        self._on_kline  = on_kline      # optional — can also pass to start()
        self._running   = False
        self._reconnect_delay = RECONNECT_BASE

    async def start(
        self,
        callback: Callable[[Candle], Awaitable[None]] = None,
    ) -> None:
        """
        Start the WebSocket connection with automatic reconnect.
        Calls callback(candle) for every received candle.
        """
        cb = callback or self._on_kline
        if cb is None:
            raise ValueError("BinanceWSClient.start() requires a callback")

        self._running = True
        url = build_stream_url(self.pairs, self.timeframes)

        logger.info(
            f"Connecting to Binance | pairs={self.pairs} | tfs={self.timeframes}"
        )

        while self._running:
            try:
                async with websockets.connect(
                    url,
                    ping_interval=PING_INTERVAL,
                    ping_timeout=10,
                    close_timeout=5,
                ) as ws:
                    self._reconnect_delay = RECONNECT_BASE
                    logger.info("✅ Binance WebSocket connected")

                    async for raw_msg in ws:
                        if not self._running:
                            break
                        try:
                            msg  = json.loads(raw_msg)
                            data = msg.get("data", {})
                            if data.get("e") != "kline":
                                continue
                            candle = parse_kline(data)
                            await cb(candle)
                        except (KeyError, ValueError, json.JSONDecodeError) as e:
                            logger.warning(f"Message parse error: {e}")
                            continue

            except ConnectionClosed as e:
                logger.warning(
                    f"WebSocket closed: {e} — reconnecting in {self._reconnect_delay}s"
                )
            except OSError as e:
                logger.error(
                    f"Connection failed: {e} — reconnecting in {self._reconnect_delay}s"
                )
            except Exception as e:
                logger.error(
                    f"Unexpected WS error: {e} — reconnecting in {self._reconnect_delay}s"
                )

            if not self._running:
                break

            await asyncio.sleep(self._reconnect_delay)
            self._reconnect_delay = min(self._reconnect_delay * 2, RECONNECT_MAX)

        logger.info("BinanceWSClient stopped.")

    def stop(self) -> None:
        self._running = False