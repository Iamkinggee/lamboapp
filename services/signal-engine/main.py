"""
models.py — Signal Engine Data Models
SMC Trading SaaS — Phase 2

UPDATES:
  - Signal now carries take_profit_1/2/3 with rr_1/2/3 (TP ladder: 1:2, 1:3.5, 1:5+)
  - is_anticipatory flag: fires BEFORE BOS — warns trader of a developing setup
  - pre_signal_note: describes why the early alert triggered
  - from_state() factory method retained
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
    ANTICIPATION = "ANTICIPATION"   # OB tap — fires BEFORE BOS — tighter SL
    CONFIRMATION  = "CONFIRMATION"  # BOS/CHOCH confirmed — higher win rate

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
    timestamp:  int
    is_closed:  bool = False

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
    fill_pct:   float = 0.0

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
    type:        ZoneType
    level:       float
    pair:        str
    timeframe:   str
    touch_count: int = 1
    swept:       bool = False
    timestamp:   int = field(default_factory=lambda: int(time.time() * 1000))


@dataclass
class StructureBreak:
    type:        BOSType
    direction:   str
    price:       float
    timeframe:   str
    pair:        str
    timestamp:   int = field(default_factory=lambda: int(time.time() * 1000))


# ─── Signal State ─────────────────────────────────────────────────────────────

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
    # Anticipatory: zones touched, BOS not yet confirmed — early warning signal
    is_anticipatory:   bool = False


# ─── Final Signal ─────────────────────────────────────────────────────────────

@dataclass
class Signal:
    pair:             str
    type:             SignalType
    entry:            float
    stop_loss:        float

    # TP Ladder
    # TP1 ~1:2    — first partial exit (scalp, 50% position)
    # TP2 ~1:3.5  — main target (swing, 30% position)
    # TP3 ~1:5+   — runner (liquidity pool hunt, 20% position)
    take_profit_1:    float = 0.0
    take_profit_2:    float = 0.0
    take_profit_3:    float = 0.0
    rr_1:             float = 0.0
    rr_2:             float = 0.0
    rr_3:             float = 0.0

    # Legacy single TP kept for backwards compat — mirrors TP2
    take_profit:      float = 0.0
    risk_reward:      float = 0.0

    confidence_score: int = 0
    confluences:      List[str] = field(default_factory=list)
    htf_bias:         HTFBias = HTFBias.NEUTRAL
    entry_model:      EntryModel = EntryModel.ANTICIPATION
    timeframe:        str = "15m"
    htf_timeframe:    str = "4h"
    ai_explanation:   str = ""

    # Anticipatory vs confirmatory
    is_anticipatory:  bool = False
    pre_signal_note:  str = ""

    signal_id:        str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp:        int = field(default_factory=lambda: int(time.time() * 1000))

    def to_dict(self) -> dict:
        type_val    = self.type.value    if hasattr(self.type,     "value") else self.type
        bias_val    = self.htf_bias.value if hasattr(self.htf_bias, "value") else self.htf_bias
        model_val   = self.entry_model.value if hasattr(self.entry_model, "value") else self.entry_model
        return {
            "signal_id":        self.signal_id,
            "pair":             self.pair,
            "type":             type_val,
            "entry":            self.entry,
            "stop_loss":        self.stop_loss,
            "take_profit_1":    self.take_profit_1,
            "take_profit_2":    self.take_profit_2,
            "take_profit_3":    self.take_profit_3,
            "rr_1":             round(self.rr_1, 2),
            "rr_2":             round(self.rr_2, 2),
            "rr_3":             round(self.rr_3, 2),
            # Legacy — TP2 is the "main" target
            "take_profit":      self.take_profit_2 if self.take_profit_2 else self.take_profit,
            "risk_reward":      round(self.rr_2 if self.rr_2 else self.risk_reward, 2),
            "confidence_score": self.confidence_score,
            "confluences":      self.confluences,
            "htf_bias":         bias_val,
            "entry_model":      model_val,
            "timeframe":        self.timeframe,
            "htf_timeframe":    self.htf_timeframe,
            "ai_explanation":   self.ai_explanation,
            "is_anticipatory":  self.is_anticipatory,
            "pre_signal_note":  self.pre_signal_note,
            "timestamp":        self.timestamp,
        }

    def to_json(self) -> str:
        import json
        return json.dumps(self.to_dict())

    @classmethod
    def from_state(
        cls,
        state,
        score: int,
        confluences: list,
        pair: str,
        tf: str,
        htf_bias,
        entry_model,
    ) -> "Signal":
        return cls(
            pair=pair,
            type=state.direction,
            entry=state.current_price,
            stop_loss=0.0,
            confidence_score=score,
            confluences=confluences,
            htf_bias=htf_bias,
            entry_model=entry_model,
            timeframe=tf,
            htf_timeframe="4h",
            is_anticipatory=getattr(state, "is_anticipatory", False),
        )