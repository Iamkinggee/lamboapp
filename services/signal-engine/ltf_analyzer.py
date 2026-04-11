"""
ltf_analyzer.py — Lower Timeframe (1M/5M) Entry Trigger
SMC Trading SaaS — Phase 2

Monitors 1M/5M candles for entry signals within HTF zones.
Combines micro BOS/CHOCH with OB/FVG/Liquidity hits to produce
a SignalState ready for confluence scoring.

FIXES:
  - _mark_signal() was called BEFORE score_signal() in engine/main.py, meaning
    a failed score would still consume the cooldown window and block the pair.
    Fixed: cooldown is now marked inside check_entry ONLY after a valid
    SignalState is returned. The engine must NOT call _mark_signal separately.
    NOTE: mark_signal() is now a public method so engine can call it post-publish.

  - NEUTRAL HTF bias now falls through to LTF trend detection (CHOCH plays)
    instead of silently returning None. Controlled by NEUTRAL_BIAS_ALLOWED config.

  - HTF warm-up guard added: if htf_analyzer.is_ready(pair) is False, skip
    LTF processing to avoid noisy signals against an unknown bias.

  - Sweep detection: detect_sweep was called with only the current candle but
    works correctly — confirmed no bug here.

  - Minimum LTF candle count now reads from config (LTF_MIN_CANDLES) not hardcoded.
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
from htf_analyzer import htf_analyzer
from scoring.config import (
    LTF_TIMEFRAMES,
    SIGNAL_COOLDOWN_SECONDS,
    NEUTRAL_BIAS_ALLOWED,
    LTF_MIN_CANDLES,
)

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

    def mark_signal(self, pair: str) -> None:
        """
        Mark a signal as published for cooldown tracking.
        FIX: previously called _mark_signal inside check_entry before the score
        was evaluated, wasting the cooldown window on rejected setups.
        Now called by engine/main.py AFTER a signal is successfully published.
        """
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
            SignalState if an entry condition is detected, else None.
            Cooldown is NOT marked here — engine marks it after publish.
        """
        if candle.timeframe not in LTF_TIMEFRAMES:
            return None

        if self._is_cooling_down(candle.pair):
            return None

        # FIX: skip pairs whose HTF zones haven't been computed yet.
        # Without this, we'd fire LTF signals against a NEUTRAL bias
        # purely because the engine hasn't bootstrapped this pair yet.
        if not htf_analyzer.is_ready(candle.pair):
            logger.debug(f"[LTF] {candle.pair} — HTF not ready yet, skipping")
            return None

        # FIX: read minimum from config (was hardcoded as 20)
        if not candle_store.has_enough(candle.pair, candle.timeframe, minimum=LTF_MIN_CANDLES):
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
            # FIX: NEUTRAL bias — only proceed if NEUTRAL_BIAS_ALLOWED is True
            # and LTF structure gives us a clear direction (CHOCH plays)
            if not NEUTRAL_BIAS_ALLOWED:
                return None

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
        swept_zones     = detect_sweep(htf_liq, candle)
        liquidity_swept = len(swept_zones) > 0
        swept_level     = swept_zones[0].level if swept_zones else None

        # ── Check LTF BOS/CHOCH ──
        ltf_trend = determine_trend(candles)
        structure = detect_bos_choch(candles, trend=ltf_trend)
        bos_choch = structure is not None

        # ── Gate: must have at least OB tap OR liquidity sweep to proceed ──
        # This prevents noise signals from FVG+bias alone.
        if not ob_tapped and not liquidity_swept:
            logger.debug(
                f"[LTF] {candle.pair}/{candle.timeframe} — no OB tap or liq sweep, skip"
            )
            return None

        # ── HTF Bias Alignment ──
        htf_aligned = (
            (direction == SignalType.BUY  and htf_bias == HTFBias.BULLISH) or
            (direction == SignalType.SELL and htf_bias == HTFBias.BEARISH)
        )

        # NOTE: do NOT call self.mark_signal() here.
        # Engine calls ltf_analyzer.mark_signal(pair) after successful publish.

        logger.info(
            f"[LTF] {candle.pair}/{candle.timeframe} ✅ Entry condition met | "
            f"dir={dir_str} ob={ob_tapped} fvg={inside_fvg} "
            f"liq={liquidity_swept} bos={bos_choch} htf_aligned={htf_aligned}"
        )

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

    def check_anticipatory(
        self,
        candle:    Candle,
        htf_zones: dict,
    ) -> Optional[SignalState]:
        """
        Anticipatory entry detector — fires BEFORE BOS/CHOCH is confirmed.

        Triggers when:
          - Price taps an HTF OB OR enters an FVG
          - HTF bias is clear (BULLISH or BEARISH)
          - BOS/CHOCH is NOT yet confirmed (that's what makes it anticipatory)

        Returns a SignalState with is_anticipatory=True, or None.
        The engine publishes this as an EARLY ALERT signal, giving traders
        time to prepare limit orders before the move plays out.
        """
        if candle.timeframe not in LTF_TIMEFRAMES:
            return None

        if not htf_analyzer.is_ready(candle.pair):
            return None

        if not candle_store.has_enough(candle.pair, candle.timeframe, minimum=LTF_MIN_CANDLES):
            return None

        candles    = candle_store.get_closed(candle.pair, candle.timeframe, n=50)
        htf_bias   = htf_zones.get("bias", HTFBias.NEUTRAL)
        htf_obs    = htf_zones.get("obs",  [])
        htf_fvgs   = htf_zones.get("fvgs", [])
        htf_liq    = htf_zones.get("liq",  [])
        price      = candle.close

        # Require clear HTF bias for anticipatory signals
        if htf_bias == HTFBias.BULLISH:
            direction = SignalType.BUY
            dir_str   = "bullish"
        elif htf_bias == HTFBias.BEARISH:
            direction = SignalType.SELL
            dir_str   = "bearish"
        else:
            return None

        # Zone checks
        active_ob  = get_nearest_ob(htf_obs, price, dir_str)
        ob_tapped  = active_ob is not None and is_price_in_ob(active_ob, price)

        active_fvg = get_nearest_fvg(htf_fvgs, price, dir_str)
        inside_fvg = active_fvg is not None and is_price_in_fvg(active_fvg, price)

        swept_zones     = detect_sweep(htf_liq, candle)
        liquidity_swept = len(swept_zones) > 0
        swept_level     = swept_zones[0].level if swept_zones else None

        # Must have OB tap OR FVG to trigger an anticipatory alert
        if not ob_tapped and not inside_fvg:
            return None

        # Verify BOS is NOT yet confirmed — if it is, let check_entry() handle it
        ltf_trend     = determine_trend(candles)
        structure     = detect_bos_choch(candles, trend=ltf_trend)
        bos_confirmed = structure is not None
        if bos_confirmed:
            return None

        htf_aligned = (
            (direction == SignalType.BUY  and htf_bias == HTFBias.BULLISH) or
            (direction == SignalType.SELL and htf_bias == HTFBias.BEARISH)
        )

        logger.info(
            f"[ANTICIPATORY] {candle.pair}/{candle.timeframe} ⚠️ "
            f"dir={dir_str} ob={ob_tapped} fvg={inside_fvg} "
            f"liq={liquidity_swept} bos=pending htf_aligned={htf_aligned}"
        )

        return SignalState(
            pair=candle.pair,
            direction=direction,
            timeframe=candle.timeframe,
            current_price=price,
            liquidity_swept=liquidity_swept,
            ob_tapped=ob_tapped,
            bos_or_choch=False,       # explicitly False — not yet confirmed
            inside_fvg=inside_fvg,
            htf_aligned=htf_aligned,
            swept_level=swept_level,
            active_ob=active_ob,
            active_fvg=active_fvg,
            structure_break=None,
            is_anticipatory=True,
        )


# Module-level singleton
ltf_analyzer = LTFAnalyzer()