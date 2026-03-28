"""
models.py — Signal Engine Data Models
SMC Trading SaaS — Phase 2
All core dataclasses for candles, zones, and signals.
"""

from dataclasses import dataclass, field
from typing import Optional, List
from enum import Enum
import time
import uuid


# ─── Enums ────────────────────────────────────────────────────────────────────

class Timeframe(str, Enum):
    M1  = "1m"
    M5  = "5m"
    M15 = "15m"
    H1  = "1h"
    H4  = "4h"

class SignalType(str, Enum):
    BUY  = "BUY"
    SELL = "SELL"

class EntryModel(str, Enum):
    ANTICIPATION = "ANTICIPATION"   # OB tap — tighter SL, better RR
    CONFIRMATION  = "CONFIRMATION"   # BOS/CHOCH confirmed — higher win rate

class ZoneType(str, Enum):
    BULLISH_OB   = "bullish_ob"
    BEARISH_OB   = "bearish_ob"
    BULLISH_FVG  = "bullish_fvg"
    BEARISH_FVG  = "bearish_fvg"
    EQUAL_HIGHS  = "equal_highs"
    EQUAL_LOWS   = "equal_lows"

class HTFBias(str, Enum):
    BULLISH = "BULLISH"
    BEARISH = "BEARISH"
    NEUTRAL = "NEUTRAL"

class BOSType(str, Enum):
    BOS   = "BOS"
    CHOCH = "CHOCH"


# ─── Candle ───────────────────────────────────────────────────────────────────

@dataclass
class Candle:
    pair:       str
    timeframe:  str
    open:       float
    high:       float
    low:        float
    close:      float
    volume:     float
    timestamp:  int           # Unix ms open time
    is_closed:  bool = False  # True = confirmed close, False = live/intra

    @property
    def body_size(self) -> float:
        return abs(self.close - self.open)

    @property
    def is_bullish(self) -> bool:
        return self.close > self.open

    @property
    def is_bearish(self) -> bool:
        return self.close < self.open

    @property
    def upper_wick(self) -> float:
        return self.high - max(self.open, self.close)

    @property
    def lower_wick(self) -> float:
        return min(self.open, self.close) - self.low


# ─── Zones ────────────────────────────────────────────────────────────────────

@dataclass
class OrderBlock:
    type:       ZoneType
    top:        float
    bottom:     float
    timeframe:  str
    timestamp:  int
    pair:       str
    mitigated:  bool = False
    touch_count: int = 0

    @property
    def midpoint(self) -> float:
        return (self.top + self.bottom) / 2

    def is_price_inside(self, price: float) -> bool:
        return self.bottom <= price <= self.top

    def mitigation_level(self, price: float) -> float:
        """Returns 0.0–1.0 how deep price has penetrated the OB."""
        if self.type == ZoneType.BULLISH_OB:
            depth = self.top - price
            return max(0.0, depth / (self.top - self.bottom))
        else:
            depth = price - self.bottom
            return max(0.0, depth / (self.top - self.bottom))


@dataclass
class FairValueGap:
    type:       ZoneType
    top:        float
    bottom:     float
    timeframe:  str
    timestamp:  int
    pair:       str
    fill_pct:   float = 0.0   # 0–100%

    @property
    def is_filled(self) -> bool:
        return self.fill_pct >= 100.0

    @property
    def gap_size(self) -> float:
        return self.top - self.bottom

    def update_fill(self, candle: "Candle") -> None:
        if self.type == ZoneType.BULLISH_FVG:
            if candle.low <= self.bottom:
                self.fill_pct = 100.0
            elif candle.low < self.top:
                filled = self.top - candle.low
                self.fill_pct = min(100.0, (filled / self.gap_size) * 100)
        else:
            if candle.high >= self.top:
                self.fill_pct = 100.0
            elif candle.high > self.bottom:
                filled = candle.high - self.bottom
                self.fill_pct = min(100.0, (filled / self.gap_size) * 100)


@dataclass
class LiquidityZone:
    type:        ZoneType       # EQUAL_HIGHS or EQUAL_LOWS
    level:       float
    pair:        str
    timeframe:   str
    touch_count: int = 1
    swept:       bool = False
    timestamp:   int = field(default_factory=lambda: int(time.time() * 1000))


@dataclass
class StructureBreak:
    type:        BOSType
    direction:   str             # "bullish" | "bearish" | "bullish_reversal" | "bearish_reversal"
    price:       float
    timeframe:   str
    pair:        str
    timestamp:   int = field(default_factory=lambda: int(time.time() * 1000))


# ─── Signal State (input to scorer) ──────────────────────────────────────────

@dataclass
class SignalState:
    """Snapshot of confluences detected for scoring."""
    pair:              str
    direction:         SignalType
    timeframe:         str
    current_price:     float
    liquidity_swept:   bool = False
    ob_tapped:         bool = False
    bos_or_choch:      bool = False
    inside_fvg:        bool = False
    htf_aligned:       bool = False
    swept_level:       Optional[float] = None
    active_ob:         Optional[OrderBlock] = None
    active_fvg:        Optional[FairValueGap] = None
    structure_break:   Optional[StructureBreak] = None


# ─── Final Signal (published to Redis + API) ─────────────────────────────────

@dataclass
class Signal:
    pair:             str
    type:             SignalType
    entry:            float
    stop_loss:        float
    take_profit:      float
    risk_reward:      float
    confidence_score: int
    confluences:      List[str]
    htf_bias:         HTFBias
    entry_model:      EntryModel
    timeframe:        str
    htf_timeframe:    str
    ai_explanation:   str = ""
    signal_id:        str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp:        int = field(default_factory=lambda: int(time.time() * 1000))

    def to_dict(self) -> dict:
        return {
            "signal_id":        self.signal_id,
            "pair":             self.pair,
            "type":             self.type.value,
            "entry":            self.entry,
            "stop_loss":        self.stop_loss,
            "take_profit":      self.take_profit,
            "risk_reward":      round(self.risk_reward, 2),
            "confidence_score": self.confidence_score,
            "confluences":      self.confluences,
            "htf_bias":         self.htf_bias.value,
            "entry_model":      self.entry_model.value,
            "timeframe":        self.timeframe,
            "htf_timeframe":    self.htf_timeframe,
            "ai_explanation":   self.ai_explanation,
            "timestamp":        self.timestamp,
        }

    def to_json(self) -> str:
        import json
        return json.dumps(self.to_dict())