"""
ltf_analyzer.py — Lower Timeframe (1M/5M) Entry Trigger
SMC Trading SaaS — Phase 2

Monitors 1M/5M candles for entry signals within HTF zones.
Combines micro BOS/CHOCH with OB/FVG/Liquidity hits to produce
a SignalState ready for confluence scoring.
"""

import logging
import time
from typing import Dict, Optional

from models import (
    Candle, SignalState, SignalType, HTFBias,
    OrderBlock, FairValueGap, LiquidityZone,
)
from detectors.order_block import get_nearest_ob, is_price_in_ob
from detectors.fvg_detector import get_nearest_fvg, is_price_in_fvg
from detectors.liquidity_zones import detect_sweep
from detectors.bos_choch import detect_bos_choch, determine_trend
from candle_store import candle_store
from scoring.config import LTF_TIMEFRAMES, SIGNAL_COOLDOWN_SECONDS

logger = logging.getLogger(__name__)


class LTFAnalyzer:
    """
    Monitors LTF candles and produces SignalState objects
    when entry conditions are met inside HTF zones.
    """

    def __init__(self):
        # Cooldown tracker: pair → last_signal_timestamp
        self._last_signal: Dict[str, float] = {}

    def _is_cooling_down(self, pair: str) -> bool:
        last = self._last_signal.get(pair, 0)
        return (time.time() - last) < SIGNAL_COOLDOWN_SECONDS

    def _mark_signal(self, pair: str) -> None:
        self._last_signal[pair] = time.time()

    def check_entry(
        self,
        candle:    Candle,
        htf_zones: dict,
    ) -> Optional[SignalState]:
        """
        Main entry point. Called on every LTF candle (closed or intra-candle).

        Args:
            candle:    Latest LTF candle
            htf_zones: Output of htf_analyzer.get_active_zones(pair)

        Returns:
            SignalState if an entry condition is detected, else None
        """
        if candle.timeframe not in LTF_TIMEFRAMES:
            return None

        if self._is_cooling_down(candle.pair):
            return None

        if not candle_store.has_enough(candle.pair, candle.timeframe, minimum=20):
            return None

        candles    = candle_store.get_closed(candle.pair, candle.timeframe, n=50)
        htf_bias: HTFBias = htf_zones.get("bias", HTFBias.NEUTRAL)
        htf_obs            = htf_zones.get("obs",  [])
        htf_fvgs           = htf_zones.get("fvgs", [])
        htf_liq            = htf_zones.get("liq",  [])
        price              = candle.close

        # ── Determine signal direction from HTF bias ──
        if htf_bias == HTFBias.BULLISH:
            direction = SignalType.BUY
            dir_str   = "bullish"
        elif htf_bias == HTFBias.BEARISH:
            direction = SignalType.SELL
            dir_str   = "bearish"
        else:
            # No clear bias — still check for CHOCH reversal signals
            ltf_trend = determine_trend(candles)
            if ltf_trend == "bullish":
                direction = SignalType.BUY
                dir_str   = "bullish"
            elif ltf_trend == "bearish":
                direction = SignalType.SELL
                dir_str   = "bearish"
            else:
                return None

        # ── Check OB tap ──
        active_ob: Optional[OrderBlock] = get_nearest_ob(htf_obs, price, dir_str)
        ob_tapped = active_ob is not None and is_price_in_ob(active_ob, price)

        # ── Check FVG ──
        active_fvg: Optional[FairValueGap] = get_nearest_fvg(htf_fvgs, price, dir_str)
        inside_fvg = active_fvg is not None and is_price_in_fvg(active_fvg, price)

        # ── Check Liquidity Sweep ──
        # Build recent LTF candles for sweep detection
        recent_with_current = candles + [candle]
        swept_zones = detect_sweep(htf_liq, candle)
        liquidity_swept = len(swept_zones) > 0
        swept_level = swept_zones[0].level if swept_zones else None

        # ── Check LTF BOS/CHOCH ──
        ltf_trend  = determine_trend(candles)
        structure  = detect_bos_choch(candles, trend=ltf_trend)
        bos_choch  = structure is not None

        # ── Gate: must have at least OB tap OR liquidity sweep to proceed ──
        if not ob_tapped and not liquidity_swept:
            return None

        # ── HTF Bias Alignment ──
        htf_aligned = (
            (direction == SignalType.BUY  and htf_bias == HTFBias.BULLISH) or
            (direction == SignalType.SELL and htf_bias == HTFBias.BEARISH)
        )

        self._mark_signal(candle.pair)

        return SignalState(
            pair=candle.pair,
            direction=direction,
            timeframe=candle.timeframe,
            current_price=price,
            liquidity_swept=liquidity_swept,
            ob_tapped=ob_tapped,
            bos_or_choch=bos_choch,
            inside_fvg=inside_fvg,
            htf_aligned=htf_aligned,
            swept_level=swept_level,
            active_ob=active_ob,
            active_fvg=active_fvg,
            structure_break=structure,
        )


# Module-level singleton
ltf_analyzer = LTFAnalyzer()