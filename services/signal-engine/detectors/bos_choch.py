"""
detectors/bos_choch.py — Break of Structure & Change of Character
SMC Trading SaaS — Phase 2

BOS  = price closes beyond the last swing high/low in the SAME trend direction
       → confirms trend continuation
CHOCH = BOS in the OPPOSITE direction of current trend
       → first signal of a potential reversal
"""

from typing import List, Optional, Tuple

from models import Candle, StructureBreak, BOSType
from detectors.liquidity_zones import find_swing_highs, find_swing_lows


# ─── Trend State ──────────────────────────────────────────────────────────────

def determine_trend(candles: List[Candle], lookback: int = 20) -> str:
    """
    Simple trend determination using Higher Highs / Higher Lows.
    Returns: "bullish" | "bearish" | "ranging"
    """
    if len(candles) < lookback:
        return "ranging"

    recent = candles[-lookback:]
    swing_highs = find_swing_highs(recent)
    swing_lows  = find_swing_lows(recent)

    if len(swing_highs) >= 2 and len(swing_lows) >= 2:
        hh = swing_highs[-1].high > swing_highs[-2].high
        hl = swing_lows[-1].low   > swing_lows[-2].low
        lh = swing_highs[-1].high < swing_highs[-2].high
        ll = swing_lows[-1].low   < swing_lows[-2].low

        if hh and hl:
            return "bullish"
        if lh and ll:
            return "bearish"

    return "ranging"


# ─── BOS / CHOCH Detection ────────────────────────────────────────────────────

def detect_bos_choch(
    candles: List[Candle],
    trend: Optional[str] = None,
    lookback: int = 3,
) -> Optional[StructureBreak]:
    """
    Check the latest candle for a BOS or CHOCH event.

    Args:
        candles:  List of closed candles (most recent last).
        trend:    Pre-computed trend string. If None, auto-computed.
        lookback: N candles each side to define a swing point.

    Returns:
        StructureBreak if detected, else None.
    """
    if len(candles) < lookback * 2 + 5:
        return None

    if trend is None:
        trend = determine_trend(candles)

    if trend == "ranging":
        return None

    last = candles[-1]

    # Use candles up to (but not including) the last one for swing detection
    # so we're looking for breaks of *previous* structure
    historical = candles[:-1]
    swing_highs = find_swing_highs(historical, n=lookback)
    swing_lows  = find_swing_lows(historical,  n=lookback)

    if not swing_highs or not swing_lows:
        return None

    last_sh = swing_highs[-1].high
    last_sl  = swing_lows[-1].low

    # ── Bullish BOS: close beyond last swing high in a bullish trend ──
    if trend == "bullish" and last.close > last_sh:
        return StructureBreak(
            type=BOSType.BOS,
            direction="bullish",
            price=last.close,
            timeframe=last.timeframe,
            pair=last.pair,
            timestamp=last.timestamp,
        )

    # ── Bearish BOS: close below last swing low in a bearish trend ──
    if trend == "bearish" and last.close < last_sl:
        return StructureBreak(
            type=BOSType.BOS,
            direction="bearish",
            price=last.close,
            timeframe=last.timeframe,
            pair=last.pair,
            timestamp=last.timestamp,
        )

    # ── Bullish CHOCH: close beyond last swing high in a BEARISH trend ──
    if trend == "bearish" and last.close > last_sh:
        return StructureBreak(
            type=BOSType.CHOCH,
            direction="bullish_reversal",
            price=last.close,
            timeframe=last.timeframe,
            pair=last.pair,
            timestamp=last.timestamp,
        )

    # ── Bearish CHOCH: close below last swing low in a BULLISH trend ──
    if trend == "bullish" and last.close < last_sl:
        return StructureBreak(
            type=BOSType.CHOCH,
            direction="bearish_reversal",
            price=last.close,
            timeframe=last.timeframe,
            pair=last.pair,
            timestamp=last.timestamp,
        )

    return None


def is_bullish_structure(sb: Optional[StructureBreak]) -> bool:
    return sb is not None and sb.direction in ("bullish", "bullish_reversal")


def is_bearish_structure(sb: Optional[StructureBreak]) -> bool:
    return sb is not None and sb.direction in ("bearish", "bearish_reversal")