"""
detectors/order_block.py — Order Block Detection
SMC Trading SaaS — Phase 2

Identifies institutional Order Blocks:
  - Bullish OB: last bearish candle before a strong bullish impulse
  - Bearish OB: last bullish candle before a strong bearish impulse

OB is only valid if:
  1. The following impulse body ≥ impulse_mult × average body (last 10 candles)
  2. The OB has NOT been fully mitigated (price closed 50%+ into the zone)
"""

from statistics import mean
from typing import List, Optional

from models import Candle, OrderBlock, ZoneType


# ─── Constants ────────────────────────────────────────────────────────────────

IMPULSE_MULT    = 1.5   # Impulse body must be >= 1.5x avg body
AVG_BODY_LOOKBACK = 10  # Candles used to calculate average body
MAX_OB_AGE      = 200   # Discard OBs older than N candles
OB_MITIGATION_PCT = 0.50  # 50% penetration = mitigated


# ─── Core Functions ───────────────────────────────────────────────────────────

def find_order_blocks(
    candles: List[Candle],
    impulse_mult: float = IMPULSE_MULT,
) -> List[OrderBlock]:
    """
    Scan candles and return a list of unmitigated Order Blocks.
    Only confirmed closed candles should be passed in.
    """
    if len(candles) < AVG_BODY_LOOKBACK + 2:
        return []

    obs: List[OrderBlock] = []

    for i in range(len(candles) - 1):
        window_start = max(0, i - AVG_BODY_LOOKBACK)
        avg_body = mean(
            abs(c.close - c.open) for c in candles[window_start:i]
        ) if i > 0 else abs(candles[0].close - candles[0].open)

        threshold = avg_body * impulse_mult

        c      = candles[i]
        c_next = candles[i + 1]
        next_body = abs(c_next.close - c_next.open)

        if next_body < threshold:
            continue   # Impulse not strong enough

        # ── Bullish OB: bearish candle followed by strong bullish impulse ──
        if c.is_bearish and c_next.is_bullish:
            ob = OrderBlock(
                type=ZoneType.BULLISH_OB,
                top=c.high,
                bottom=c.low,
                timeframe=c.timeframe,
                timestamp=c.timestamp,
                pair=c.pair,
            )
            obs.append(ob)

        # ── Bearish OB: bullish candle followed by strong bearish impulse ──
        elif c.is_bullish and c_next.is_bearish:
            ob = OrderBlock(
                type=ZoneType.BEARISH_OB,
                top=c.high,
                bottom=c.low,
                timeframe=c.timeframe,
                timestamp=c.timestamp,
                pair=c.pair,
            )
            obs.append(ob)

    return obs


def update_mitigation(obs: List[OrderBlock], latest_candle: Candle) -> List[OrderBlock]:
    """
    Check each OB against the latest candle.
    Mark as mitigated if price has penetrated 50%+ of the zone.
    Returns only unmitigated OBs.
    """
    active = []
    for ob in obs:
        if ob.mitigated:
            continue

        mid = ob.midpoint

        if ob.type == ZoneType.BULLISH_OB:
            # Mitigated if price closes below the 50% level of OB
            if latest_candle.close < mid:
                ob.mitigated = True
                continue
        else:  # BEARISH_OB
            # Mitigated if price closes above the 50% level of OB
            if latest_candle.close > mid:
                ob.mitigated = True
                continue

        # Track touches for strength scoring
        if ob.is_price_inside(latest_candle.low) or ob.is_price_inside(latest_candle.high):
            ob.touch_count += 1

        active.append(ob)

    return active


def get_nearest_ob(
    obs: List[OrderBlock],
    price: float,
    direction: str,
    max_distance_pct: float = 0.5,
) -> Optional[OrderBlock]:
    """
    Find the nearest valid OB to current price within max_distance_pct.
    direction: "bullish" | "bearish"
    Returns None if no valid OB is close enough.
    """
    target_type = ZoneType.BULLISH_OB if direction == "bullish" else ZoneType.BEARISH_OB

    candidates = [ob for ob in obs if ob.type == target_type and not ob.mitigated]

    if not candidates:
        return None

    def distance(ob: OrderBlock) -> float:
        # Distance from price to nearest edge of the OB
        if price > ob.top:
            return ((price - ob.top) / price) * 100
        elif price < ob.bottom:
            return ((ob.bottom - price) / price) * 100
        else:
            return 0.0  # Price is inside the OB

    within_range = [ob for ob in candidates if distance(ob) <= max_distance_pct]

    if not within_range:
        return None

    return min(within_range, key=lambda ob: distance(ob))


def is_price_in_ob(ob: OrderBlock, price: float) -> bool:
    """Quick check: is price currently touching or inside an OB?"""
    return ob.bottom <= price <= ob.top