"""
detectors/fvg_detector.py — Fair Value Gap (FVG) Detection
SMC Trading SaaS — Phase 2

Detects 3-candle price imbalances where price moved too fast,
leaving an unfilled gap that price is expected to return to fill.

  Bullish FVG: candle[i].low > candle[i-2].high
  Bearish FVG: candle[i].high < candle[i-2].low
"""

from typing import List, Optional

from models import Candle, FairValueGap, ZoneType


# ─── Constants ────────────────────────────────────────────────────────────────

MIN_GAP_PCT = 0.02   # Minimum FVG size as % of price (filter noise)


# ─── Core Functions ───────────────────────────────────────────────────────────

def find_fvgs(candles: List[Candle]) -> List[FairValueGap]:
    """
    Scan confirmed closed candles and return all detected FVGs.
    Uses the 3-candle pattern: candle[i-2], candle[i-1] (impulse), candle[i].
    """
    if len(candles) < 3:
        return []

    fvgs: List[FairValueGap] = []

    for i in range(2, len(candles)):
        c0 = candles[i - 2]   # First candle of the pattern
        c1 = candles[i - 1]   # Impulse candle (middle)
        c2 = candles[i]       # Third candle

        # ── Bullish FVG ──
        # Gap exists between c0 high and c2 low — bullish momentum
        if c2.low > c0.high:
            gap_size = c2.low - c0.high
            gap_pct  = (gap_size / c0.high) * 100

            if gap_pct >= MIN_GAP_PCT:
                fvg = FairValueGap(
                    type=ZoneType.BULLISH_FVG,
                    top=c2.low,      # Top of the gap = bottom of c2
                    bottom=c0.high,  # Bottom of gap = high of c0
                    timeframe=c1.timeframe,
                    timestamp=c1.timestamp,
                    pair=c1.pair,
                )
                fvgs.append(fvg)

        # ── Bearish FVG ──
        # Gap exists between c0 low and c2 high — bearish momentum
        elif c2.high < c0.low:
            gap_size = c0.low - c2.high
            gap_pct  = (gap_size / c0.low) * 100

            if gap_pct >= MIN_GAP_PCT:
                fvg = FairValueGap(
                    type=ZoneType.BEARISH_FVG,
                    top=c0.low,      # Top of gap = low of c0
                    bottom=c2.high,  # Bottom of gap = high of c2
                    timeframe=c1.timeframe,
                    timestamp=c1.timestamp,
                    pair=c1.pair,
                )
                fvgs.append(fvg)

    return fvgs


def update_fvg_fills(fvgs: List[FairValueGap], latest_candle: Candle) -> List[FairValueGap]:
    """
    Update fill percentage for each FVG based on latest candle.
    Remove fully-filled FVGs from the list.
    """
    active = []
    for fvg in fvgs:
        fvg.update_fill(latest_candle)
        if not fvg.is_filled:
            active.append(fvg)
    return active


def is_price_in_fvg(fvg: FairValueGap, price: float) -> bool:
    """Check if current price is inside an FVG zone."""
    return fvg.bottom <= price <= fvg.top


def get_nearest_fvg(
    fvgs: List[FairValueGap],
    price: float,
    direction: str,
    max_distance_pct: float = 0.3,
) -> Optional[FairValueGap]:
    """
    Find nearest unfilled FVG in the given direction.
    direction: "bullish" | "bearish"
    """
    target_type = ZoneType.BULLISH_FVG if direction == "bullish" else ZoneType.BEARISH_FVG

    candidates = [
        f for f in fvgs
        if f.type == target_type and not f.is_filled
    ]

    if not candidates:
        return None

    def distance(fvg: FairValueGap) -> float:
        if price > fvg.top:
            return ((price - fvg.top) / price) * 100
        elif price < fvg.bottom:
            return ((fvg.bottom - price) / price) * 100
        else:
            return 0.0  # Inside the FVG

    within_range = [f for f in candidates if distance(f) <= max_distance_pct]

    if not within_range:
        return None

    return min(within_range, key=lambda f: distance(f))