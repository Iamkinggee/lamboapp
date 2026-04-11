"""
detectors/order_block.py — Order Block Detection
SMC Trading SaaS — Phase 2

Identifies institutional Order Blocks:
  - Bullish OB: last bearish candle before a strong bullish impulse
  - Bearish OB: last bullish candle before a strong bearish impulse

OB is only valid if:
  1. The following impulse body >= impulse_mult x average body (last 10 candles)
  2. The OB has NOT been fully mitigated (price closed 50%+ into the zone)

FIXES:
  - Empty window crash: candles[window_start:i] is empty when i==0,
    causing mean() to raise StatisticsError. Now guarded with `if not window: continue`
  - Zero avg_body guard: doji-heavy windows produced threshold=0, passing
    every candle as an impulse. Now skipped with `if avg_body == 0: continue`
"""

from statistics import mean
from typing import List, Optional

from models import Candle, OrderBlock, ZoneType


# ─── Constants ────────────────────────────────────────────────────────────────

IMPULSE_MULT      = 1.5    # Impulse body must be >= 1.5x avg body
AVG_BODY_LOOKBACK = 10     # Candles used to calculate average body
MAX_OB_AGE        = 200    # Discard OBs older than N candles
OB_MITIGATION_PCT = 0.50   # 50% penetration = mitigated
MAX_OB_DISTANCE_PCT = 3.0  # FIX: was 0.5% — too tight. 3% captures realistic OB approaches.


# ─── Core Functions ───────────────────────────────────────────────────────────

def find_order_blocks(
    candles: List[Candle],
    impulse_mult: float = IMPULSE_MULT,
) -> List[OrderBlock]:
    if len(candles) < AVG_BODY_LOOKBACK + 2:
        return []

    obs: List[OrderBlock] = []

    for i in range(len(candles) - 1):
        window_start = max(0, i - AVG_BODY_LOOKBACK)
        window = candles[window_start:i]

        if not window:
            continue

        avg_body = mean(abs(c.close - c.open) for c in window)

        if avg_body == 0:
            continue

        threshold = avg_body * impulse_mult

        c      = candles[i]
        c_next = candles[i + 1]
        next_body = abs(c_next.close - c_next.open)

        if next_body < threshold:
            continue

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
    active = []
    for ob in obs:
        if ob.mitigated:
            continue

        mid = ob.midpoint

        if ob.type == ZoneType.BULLISH_OB:
            if latest_candle.close < mid:
                ob.mitigated = True
                continue
        else:
            if latest_candle.close > mid:
                ob.mitigated = True
                continue

        if ob.is_price_inside(latest_candle.low) or ob.is_price_inside(latest_candle.high):
            ob.touch_count += 1

        active.append(ob)

    return active


def get_nearest_ob(
    obs: List[OrderBlock],
    price: float,
    direction: str,
    max_distance_pct: float = MAX_OB_DISTANCE_PCT,
) -> Optional[OrderBlock]:
    target_type = ZoneType.BULLISH_OB if direction == "bullish" else ZoneType.BEARISH_OB

    candidates = [ob for ob in obs if ob.type == target_type and not ob.mitigated]

    if not candidates:
        return None

    def distance(ob: OrderBlock) -> float:
        if price > ob.top:
            return ((price - ob.top) / price) * 100
        elif price < ob.bottom:
            return ((ob.bottom - price) / price) * 100
        else:
            return 0.0

    within_range = [ob for ob in candidates if distance(ob) <= max_distance_pct]

    if not within_range:
        return None

    return min(within_range, key=lambda ob: distance(ob))


def is_price_in_ob(ob: OrderBlock, price: float) -> bool:
    return ob.bottom <= price <= ob.top
