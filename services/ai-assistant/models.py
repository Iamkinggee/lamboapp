# # ──────────────────────────────────────────────
# # services/ai-assistant/models.py
# # Shared data models for the AI service
# # ──────────────────────────────────────────────
# from dataclasses import dataclass, field
# from typing import Optional


# @dataclass
# class SMCSignal:
#     signal_id: str
#     pair: str
#     type: str                  # BUY | SELL
#     entry: float
#     stop_loss: float
#     take_profit: float
#     risk_reward: float
#     confidence_score: int
#     confluences: list[str]
#     htf_bias: str              # BULLISH | BEARISH | NEUTRAL
#     entry_model: str           # ANTICIPATION | CONFIRMATION
#     ai_explanation: str
#     timeframe: str
#     htf_timeframe: str
#     timestamp: int


# @dataclass
# class TradeRecord:
#     pair: str
#     trade_type: str            # BUY | SELL
#     entry: float
#     stop_loss: float
#     take_profit: float
#     risk_reward: float
#     outcome: str               # WIN | LOSS | PENDING | BREAKEVEN
#     notes: Optional[str] = None


# @dataclass
# class UserContext:
#     user_id: str
#     skill_level: str           # BEGINNER | INTERMEDIATE | ADVANCED
#     recent_trades: list[TradeRecord] = field(default_factory=list)
#     chat_history: list[dict] = field(default_factory=list)
#     recent_signals: list[SMCSignal] = field(default_factory=list)














# FILE: services/ai-assistant/models.py
# ─────────────────────────────────────────────────────────────
# Pydantic data models shared across main.py, prompts.py, db.py
# ─────────────────────────────────────────────────────────────

from pydantic import BaseModel
from typing import Optional


class SMCSignal(BaseModel):
    """Represents a single published SMC trading signal."""
    signal_id:        str
    pair:             str                    # e.g. "BTCUSDT"
    type:             str                    # "BUY" or "SELL"
    entry:            float
    stop_loss:        float
    take_profit:      float
    risk_reward:      float                  # e.g. 2.2
    confidence_score: int                    # 0-100
    confluences:      list[str]              # e.g. ["Liquidity Sweep", "OB Tap"]
    htf_bias:         str                    # "BULLISH" | "BEARISH" | "NEUTRAL"
    entry_model:      str                    # "ANTICIPATION" | "CONFIRMATION"
    ai_explanation:   str                    # Pre-generated explanation text
    timeframe:        str                    # e.g. "5M"
    htf_timeframe:    str                    # e.g. "1H"
    timestamp:        int                    # Unix ms


class TradeRecord(BaseModel):
    """Represents a trade logged by the user for review."""
    pair:        str                         # e.g. "ETHUSDT"
    trade_type:  str                         # "BUY" | "SELL"
    entry:       float
    stop_loss:   float
    take_profit: float
    risk_reward: float
    outcome:     str                         # "WIN" | "LOSS" | "PENDING" | "BREAKEVEN"
    notes:       Optional[str] = None        # Optional user notes


class UserContext(BaseModel):
    """User profile + history injected into every AI prompt."""
    user_id:      str
    skill_level:  str                        # "BEGINNER" | "INTERMEDIATE" | "ADVANCED"
    chat_history: list[dict]                 # Last N {"role":..,"content":..} messages
    recent_trades: list[TradeRecord] = []    # Last 5 trades for context
    win_rate:     Optional[float] = None     # e.g. 0.62 = 62%