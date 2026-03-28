# FILE: services/signal-engine/candle_store.py
"""
In-Memory Candle Store — ring buffer per (pair, timeframe).
Stores last N candles for fast access by detectors.
"""

from dataclasses import dataclass
from collections import deque
from typing import Optional


BUFFER_SIZE = 500  # keep last 500 candles per stream


@dataclass
class Candle:
    pair:       str
    timeframe:  str
    open_time:  int
    open:       float
    high:       float
    low:        float
    close:      float
    volume:     float
    close_time: int
    is_closed:  bool = False

    @property
    def body(self) -> float:
        return abs(self.close - self.open)

    @property
    def is_bullish(self) -> bool:
        return self.close >= self.open

    @property
    def is_bearish(self) -> bool:
        return self.close < self.open

    @property
    def upper_wick(self) -> float:
        return self.high - max(self.open, self.close)

    @property
    def lower_wick(self) -> float:
        return min(self.open, self.close) - self.low


class CandleStore:
    def __init__(self, buffer_size: int = BUFFER_SIZE):
        self._store: dict[str, deque] = {}
        self._buffer_size = buffer_size

    def _key(self, pair: str, tf: str) -> str:
        return f"{pair}:{tf}"

    def upsert(self, candle: Candle):
        """Add or update latest candle in the ring buffer."""
        k = self._key(candle.pair, candle.timeframe)
        if k not in self._store:
            self._store[k] = deque(maxlen=self._buffer_size)

        buf = self._store[k]
        if buf and buf[-1].open_time == candle.open_time:
            buf[-1] = candle  # update intra-candle
        else:
            buf.append(candle)

    def upsert_from_kline(self, msg: dict) -> "Candle":
        """Parse a Binance kline WebSocket message and upsert."""
        k = msg["k"]
        candle = Candle(
            pair       = msg["s"],
            timeframe  = k["i"],
            open_time  = k["t"],
            open       = float(k["o"]),
            high       = float(k["h"]),
            low        = float(k["l"]),
            close      = float(k["c"]),
            volume     = float(k["v"]),
            close_time = k["T"],
            is_closed  = k["x"],
        )
        self.upsert(candle)
        return candle

    def get(self, pair: str, tf: str, n: Optional[int] = None) -> list:
        """Return last N candles for a (pair, tf) stream."""
        k = self._key(pair, tf)
        buf = self._store.get(k, deque())
        candles = list(buf)
        return candles[-n:] if n else candles

    def get_closed(self, pair: str, tf: str, n: Optional[int] = None) -> list:
        """Return only closed candles."""
        return [c for c in self.get(pair, tf, n) if c.is_closed]

    def latest(self, pair: str, tf: str) -> Optional["Candle"]:
        """Return the most recent candle."""
        candles = self.get(pair, tf)
        return candles[-1] if candles else None

    def count(self, pair: str, tf: str) -> int:
        """Return number of candles stored for a (pair, tf) stream."""
        return len(self._store.get(self._key(pair, tf), []))

    def has_enough(self, pair: str, tf: str, minimum: int = 20) -> bool:
        """
        Returns True if there are at least `minimum` closed candles
        for this (pair, timeframe). Used by analyzers before running
        detection logic to avoid processing on insufficient data.
        """
        return len(self.get_closed(pair, tf)) >= minimum