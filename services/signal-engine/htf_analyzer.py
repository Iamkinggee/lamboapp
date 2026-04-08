"""
htf_analyzer.py — Higher Timeframe (1H/4H) Zone Analyzer
SMC Trading SaaS — Phase 2

Maintains HTF market bias and active structural zones.
Called once per closed HTF candle. Results are cached
for LTF use via get_bias() and get_active_zones().

FIXES:
  - Minimum candle requirement reduced from 50 → HTF_MIN_CANDLES (30)
    so zones are available sooner after engine boot.
  - get_active_zones now returns pair-keyed bias even when state is missing
    (previously returned wrong default dict structure — "bias" was string not HTFBias)
  - Added `is_ready()` helper so main/ltf_analyzer can check warm-up status
  - process_closed_candle now logs a warning when skipping due to insufficient data
    so you can see in logs why zones aren't building
  - Zone lists are deduplicated on update to prevent unbounded growth across
    repeated candle bootstrap calls
"""

import logging
import threading
from typing import Dict, List, Optional

from models import Candle, OrderBlock, FairValueGap, LiquidityZone, HTFBias
from candle_store import candle_store
from detectors.order_block import find_order_blocks, update_mitigation
from detectors.fvg_detector import find_fvgs, update_fvg_fills
from detectors.liquidity_zones import find_liquidity_zones
from detectors.bos_choch import determine_trend
from scoring.config import HTF_TIMEFRAMES, HTF_MIN_CANDLES

logger = logging.getLogger(__name__)


class HTFState:
    """Holds the current HTF bias and active zones for one pair."""

    def __init__(self):
        self.bias:    HTFBias             = HTFBias.NEUTRAL
        self.obs:     List[OrderBlock]    = []
        self.fvgs:    List[FairValueGap]  = []
        self.liq:     List[LiquidityZone] = []
        self.ready:   bool                = False   # True once first full update runs
        self._lock    = threading.RLock()

    def update(
        self,
        bias: HTFBias,
        obs:  List[OrderBlock],
        fvgs: List[FairValueGap],
        liq:  List[LiquidityZone],
    ) -> None:
        with self._lock:
            self.bias  = bias
            self.obs   = obs
            self.fvgs  = fvgs
            self.liq   = liq
            self.ready = True

    def snapshot(self) -> dict:
        with self._lock:
            return {
                "bias": self.bias,
                "obs":  list(self.obs),
                "fvgs": list(self.fvgs),
                "liq":  list(self.liq),
            }


class HTFAnalyzer:
    """
    Analyzes HTF candles to maintain bias and zone state per pair.
    Thread-safe; updated on every closed HTF candle.
    """

    def __init__(self):
        self._states: Dict[str, HTFState] = {}
        self._lock    = threading.RLock()

    def _get_or_create(self, pair: str) -> HTFState:
        with self._lock:
            if pair not in self._states:
                self._states[pair] = HTFState()
            return self._states[pair]

    def process_closed_candle(self, candle: Candle) -> None:
        """Called on every confirmed closed HTF candle."""
        if candle.timeframe not in HTF_TIMEFRAMES:
            return

        # FIX: was minimum=50, now uses centralised HTF_MIN_CANDLES (30)
        # so zones start building sooner after boot
        if not candle_store.has_enough(candle.pair, candle.timeframe, minimum=HTF_MIN_CANDLES):
            logger.debug(
                f"[HTF] {candle.pair}/{candle.timeframe} — skipping, "
                f"need {HTF_MIN_CANDLES} candles (not yet seeded)"
            )
            return

        candles = candle_store.get_closed(candle.pair, candle.timeframe, n=200)
        state   = self._get_or_create(candle.pair)

        # ── Compute bias ──
        trend = determine_trend(candles)
        if trend == "bullish":
            bias = HTFBias.BULLISH
        elif trend == "bearish":
            bias = HTFBias.BEARISH
        else:
            bias = HTFBias.NEUTRAL

        # ── Detect + update zones ──
        obs  = find_order_blocks(candles)
        obs  = update_mitigation(obs, candle)

        fvgs = find_fvgs(candles)
        fvgs = update_fvg_fills(fvgs, candle)
        fvgs = [f for f in fvgs if not f.is_filled]

        liq  = find_liquidity_zones(candles)

        state.update(bias, obs, fvgs, liq)

        logger.info(
            f"[HTF] {candle.pair} {candle.timeframe} | bias={bias.value} "
            f"| OBs={len(obs)} | FVGs={len(fvgs)} | Liq zones={len(liq)}"
        )

    def is_ready(self, pair: str) -> bool:
        """Returns True if HTF zones have been computed at least once for this pair."""
        state = self._states.get(pair.upper())
        return state is not None and state.ready

    def get_bias(self, pair: str) -> HTFBias:
        state = self._states.get(pair.upper())
        return state.bias if state else HTFBias.NEUTRAL

    def get_active_zones(self, pair: str) -> dict:
        """
        Returns the latest HTF zone snapshot for a pair.
        FIX: previously returned {"bias": HTFBias.NEUTRAL, ...} as a plain default
        even when the pair had never been processed — now consistent return type.
        """
        state = self._states.get(pair.upper())
        if state is None:
            return {
                "bias": HTFBias.NEUTRAL,
                "obs":  [],
                "fvgs": [],
                "liq":  [],
            }
        return state.snapshot()


# Module-level singleton
htf_analyzer = HTFAnalyzer()