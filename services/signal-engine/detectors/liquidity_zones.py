"""
detectors/liquidity_zones.py — Liquidity Zone Detection
SMC Trading SaaS — Phase 2

Detects clusters of equal highs (buy-side liquidity) and
equal lows (sell-side liquidity) that institutions target for fills.

Equal High/Low = swing points within TOLERANCE_PCT of each other
across a rolling LOOKBACK_CANDLES window.
"""

from typing import List, Optional, Tuple

from models import Candle, LiquidityZone, ZoneType


# ─── Constants ────────────────────────────────────────────────────────────────

TOLERANCE_PCT   = 0.05   # Max % difference to be considered "equal"
LOOKBACK        = 20     # Candles to look back for clustering
SWING_N         = 3      # N candles each side to define a swing point
MIN_CLUSTER     = 2      # Minimum touches to form a valid liquidity pool
SWEEP_PCT       = 0.10   # Price must close beyond level by >= 0.1% to be swept


# ─── Swing Detection Helpers ──────────────────────────────────────────────────

def find_swing_highs(candles: List[Candle], n: int = SWING_N) -> List[Candle]:
    """Return candles that are local swing highs (highest high within N candles each side)."""
    swings = []
    for i in range(n, len(candles) - n):
        c = candles[i]
        left  = candles[i - n : i]
        right = candles[i + 1 : i + n + 1]
        if all(c.high >= x.high for x in left) and all(c.high >= x.high for x in right):
            swings.append(c)
    return swings


def find_swing_lows(candles: List[Candle], n: int = SWING_N) -> List[Candle]:
    """Return candles that are local swing lows (lowest low within N candles each side)."""
    swings = []
    for i in range(n, len(candles) - n):
        c = candles[i]
        left  = candles[i - n : i]
        right = candles[i + 1 : i + n + 1]
        if all(c.low <= x.low for x in left) and all(c.low <= x.low for x in right):
            swings.append(c)
    return swings


# ─── Cluster Builder ──────────────────────────────────────────────────────────

def _cluster_levels(levels: List[float], tolerance_pct: float) -> List[Tuple[float, int]]:
    """
    Group closely-spaced price levels into clusters.
    Returns list of (average_level, touch_count).
    """
    if not levels:
        return []

    sorted_levels = sorted(levels)
    clusters: List[Tuple[float, int]] = []
    current_group = [sorted_levels[0]]

    for level in sorted_levels[1:]:
        ref = current_group[0]
        if abs(level - ref) / ref * 100 <= tolerance_pct:
            current_group.append(level)
        else:
            if len(current_group) >= MIN_CLUSTER:
                avg = sum(current_group) / len(current_group)
                clusters.append((avg, len(current_group)))
            current_group = [level]

    # Don't forget the last group
    if len(current_group) >= MIN_CLUSTER:
        avg = sum(current_group) / len(current_group)
        clusters.append((avg, len(current_group)))

    return clusters


# ─── Main Detection ───────────────────────────────────────────────────────────

def find_liquidity_zones(
    candles: List[Candle],
    lookback: int = LOOKBACK,
    tolerance_pct: float = TOLERANCE_PCT,
) -> List[LiquidityZone]:
    """
    Detect equal-high and equal-low liquidity pools
    from the last `lookback` closed candles.
    """
    if len(candles) < lookback:
        return []

    recent = candles[-lookback:]
    pair   = candles[-1].pair
    tf     = candles[-1].timeframe

    zones: List[LiquidityZone] = []

    # ── Buy-side liquidity (equal highs) ──
    swing_highs = find_swing_highs(recent)
    high_levels = [c.high for c in swing_highs]
    high_clusters = _cluster_levels(high_levels, tolerance_pct)

    for level, count in high_clusters:
        zones.append(LiquidityZone(
            type=ZoneType.EQUAL_HIGHS,
            level=level,
            pair=pair,
            timeframe=tf,
            touch_count=count,
        ))

    # ── Sell-side liquidity (equal lows) ──
    swing_lows = find_swing_lows(recent)
    low_levels = [c.low for c in swing_lows]
    low_clusters = _cluster_levels(low_levels, tolerance_pct)

    for level, count in low_clusters:
        zones.append(LiquidityZone(
            type=ZoneType.EQUAL_LOWS,
            level=level,
            pair=pair,
            timeframe=tf,
            touch_count=count,
        ))

    return zones


def detect_sweep(
    zones: List[LiquidityZone],
    latest_candle: Candle,
    sweep_pct: float = SWEEP_PCT,
) -> List[LiquidityZone]:
    """
    Check if the latest candle has swept any liquidity zone.
    Sweep = price wick passes through the level but candle closes back inside.

    Returns list of swept zones (for use in confluence scoring).
    """
    swept = []
    for zone in zones:
        if zone.swept:
            continue

        level = zone.level

        if zone.type == ZoneType.EQUAL_HIGHS:
            # Wick pierced the level (high above it) but close didn't stay above
            wick_swept = latest_candle.high > level
            close_below = latest_candle.close < level * (1 + sweep_pct / 100)
            if wick_swept and close_below:
                zone.swept = True
                swept.append(zone)

        elif zone.type == ZoneType.EQUAL_LOWS:
            # Wick pierced the level (low below it) but close recovered above
            wick_swept = latest_candle.low < level
            close_above = latest_candle.close > level * (1 - sweep_pct / 100)
            if wick_swept and close_above:
                zone.swept = True
                swept.append(zone)

    return swept


def get_nearest_liquidity(
    zones: List[LiquidityZone],
    price: float,
    direction: str,
) -> Optional[LiquidityZone]:
    """
    Find the nearest unswept liquidity target in the signal direction.
    Used by risk_manager.py to calculate Take Profit levels.
    direction: "bullish" → target equal highs above
               "bearish" → target equal lows below
    """
    if direction == "bullish":
        targets = [z for z in zones
                   if z.type == ZoneType.EQUAL_HIGHS
                   and not z.swept
                   and z.level > price]
        return min(targets, key=lambda z: z.level) if targets else None
    else:
        targets = [z for z in zones
                   if z.type == ZoneType.EQUAL_LOWS
                   and not z.swept
                   and z.level < price]
        return max(targets, key=lambda z: z.level) if targets else None