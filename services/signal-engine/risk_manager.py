"""
risk_manager.py — Risk Manager
Calculates SL + 3-level TP ladder for each signal.

TP Ladder (scalp/day trade focused):
  TP1 = SL × 2.0   (first partial exit — take 50% position off)
  TP2 = SL × 3.5   (main swing target  — take 30% off)
  TP3 = SL × 5.5+  (runner target at opposing liquidity — take 20% off)

SL placement: buffer tick beyond OB wick or swept liquidity.
TP3 targets the next significant opposing liquidity pool when available.
"""

import logging
import os

log = logging.getLogger("engine.risk_manager")

SL_BUFFER_PCT = float(os.getenv("SL_BUFFER_PCT",    "0.001"))  # 0.1% beyond OB
TP1_MULT      = float(os.getenv("TP1_MULT",          "2.0"))   # Conservative scalp
TP2_MULT      = float(os.getenv("TP2_MULT",          "3.5"))   # Main swing target
TP3_MULT      = float(os.getenv("TP3_MULT",          "5.5"))   # Runner / liquidity hunt
DEFAULT_TP_MULT = TP2_MULT  # Legacy fallback


class RiskManager:
    """Calculates and attaches SL/TP1/TP2/TP3/RR to a Signal object."""

    def __init__(self, min_rr: float = 2.0):
        self.min_rr = min_rr

    def calculate_sl_tp(self, signal, htf_zones: dict):
        """
        Compute SL + 3-tier TP ladder and attach to signal.

        SL: beyond OB wick + buffer.
        TP1: 1:TP1_MULT  — quick scalp partial.
        TP2: 1:TP2_MULT  — main target; if opposing liquidity found, uses that.
        TP3: 1:TP3_MULT  — runner targeting deepest opposing liquidity pool.

        Returns the signal with all fields set.
        """
        entry  = signal.entry
        is_buy = (signal.type == "BUY" or
                  (hasattr(signal.type, "value") and signal.type.value == "BUY"))

        # ── Resolve OB boundaries ─────────────────────────────────────────────
        obs = htf_zones.get("obs", [])
        ob_bottom_val = None
        ob_top_val    = None

        if obs:
            from models import ZoneType
            target_type = ZoneType.BULLISH_OB if is_buy else ZoneType.BEARISH_OB
            relevant = [
                ob for ob in obs
                if ob.type == target_type and not getattr(ob, "mitigated", False)
            ]
            if relevant:
                nearest = min(relevant, key=lambda ob: abs(
                    ((ob.top + ob.bottom) / 2) - entry
                ))
                ob_bottom_val = nearest.bottom
                ob_top_val    = nearest.top

        # ── Stop Loss ─────────────────────────────────────────────────────────
        if is_buy:
            ob_bottom = ob_bottom_val if ob_bottom_val is not None else entry * 0.99
            sl = ob_bottom * (1.0 - SL_BUFFER_PCT)
        else:
            ob_top = ob_top_val if ob_top_val is not None else entry * 1.01
            sl = ob_top * (1.0 + SL_BUFFER_PCT)

        sl_distance = abs(entry - sl)
        if sl_distance < 1e-10:
            sl_distance = entry * 0.01

        # ── Opposing liquidity target for TP3 ────────────────────────────────
        liq_zones  = htf_zones.get("liq", [])
        liq_target = self._find_opposing_liquidity(entry, is_buy, liq_zones, sl_distance)

        # ── TP Ladder ─────────────────────────────────────────────────────────
        if is_buy:
            tp1 = entry + sl_distance * TP1_MULT
            tp2 = entry + sl_distance * TP2_MULT
            # TP3: use liquidity target if it gives better RR than TP3_MULT
            tp3_default = entry + sl_distance * TP3_MULT
            tp3 = liq_target if (liq_target and liq_target > tp2) else tp3_default
        else:
            tp1 = entry - sl_distance * TP1_MULT
            tp2 = entry - sl_distance * TP2_MULT
            tp3_default = entry - sl_distance * TP3_MULT
            tp3 = liq_target if (liq_target and liq_target < tp2) else tp3_default

        rr1 = abs(tp1 - entry) / sl_distance
        rr2 = abs(tp2 - entry) / sl_distance
        rr3 = abs(tp3 - entry) / sl_distance

        # ── Assign ────────────────────────────────────────────────────────────
        signal.stop_loss      = round(sl,  8)
        signal.take_profit_1  = round(tp1, 8)
        signal.take_profit_2  = round(tp2, 8)
        signal.take_profit_3  = round(tp3, 8)
        signal.rr_1           = round(rr1, 2)
        signal.rr_2           = round(rr2, 2)
        signal.rr_3           = round(rr3, 2)
        # Legacy fields
        signal.take_profit    = signal.take_profit_2
        signal.risk_reward    = signal.rr_2

        log.debug(
            f"Risk calc: entry={entry:.6f} SL={sl:.6f} "
            f"TP1={tp1:.6f}(1:{rr1:.1f}) "
            f"TP2={tp2:.6f}(1:{rr2:.1f}) "
            f"TP3={tp3:.6f}(1:{rr3:.1f})"
        )
        return signal

    def _find_opposing_liquidity(
        self,
        entry:      float,
        is_buy:     bool,
        liq_zones,
        sl_distance: float,
    ) -> float | None:
        """
        Find the nearest unswept opposing liquidity pool beyond minimum TP2 distance.
        For BUY: look for equal highs above entry.
        For SELL: look for equal lows below entry.
        """
        from models import ZoneType
        min_distance = sl_distance * TP2_MULT  # must be at least as far as TP2

        candidates = []
        for zone in liq_zones:
            if getattr(zone, "swept", False):
                continue
            zone_type = zone.type.value if hasattr(zone.type, "value") else str(zone.type)
            level = zone.level
            if is_buy and zone_type == ZoneType.EQUAL_HIGHS.value:
                if level > entry + min_distance:
                    candidates.append(level)
            elif not is_buy and zone_type == ZoneType.EQUAL_LOWS.value:
                if level < entry - min_distance:
                    candidates.append(level)

        if not candidates:
            return None

        # Return nearest qualifying level
        if is_buy:
            return min(candidates)
        else:
            return max(candidates)