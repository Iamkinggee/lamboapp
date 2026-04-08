# FILE: services/signal-engine/risk_manager.py
"""
Risk Manager
Calculates Stop Loss, Take Profit, and Risk/Reward ratio for each signal.
Signals that don't meet the minimum RR are discarded before publishing.

SL placement: 1 buffer tick beyond the order block wick or swept liquidity level.
TP placement: nearest opposing liquidity pool (default: 2.5× SL distance).
"""

import logging
import os

log = logging.getLogger("engine.risk_manager")

SL_BUFFER_PCT = float(os.getenv("SL_BUFFER_PCT", "0.001"))   # 0.1% beyond OB
DEFAULT_TP_MULT = float(os.getenv("DEFAULT_TP_MULT", "2.5")) # TP = SL × 2.5


class RiskManager:
    """Calculates and attaches SL/TP/RR to a Signal object."""

    def __init__(self, min_rr: float = 2.0):
        self.min_rr = min_rr

    def calculate_sl_tp(self, signal, htf_zones: dict):
        """
        Calculate SL/TP for a signal using HTF zone boundaries.

        Modifies the signal object in place and returns it.

        Args:
            signal:    Signal dataclass instance (entry, type already set)
            htf_zones: dict from HTFAnalyzer.get_active_zones()
                       keys: bias, obs (List[OrderBlock]), fvgs, liq

        Returns:
            The same signal with stop_loss, take_profit, risk_reward set.

        FIX: previously looked for ob_top/ob_bottom flat keys that were never
        set by get_active_zones(). Now extracts the nearest OB from the obs
        list, matching the direction of the signal.
        """
        entry  = signal.entry
        is_buy = (signal.type == "BUY" or
                  (hasattr(signal.type, "value") and signal.type.value == "BUY"))

        # ── Resolve OB boundaries from obs list ──────────────────────────────
        obs = htf_zones.get("obs", [])
        ob_bottom_val = None
        ob_top_val    = None

        if obs:
            from models import ZoneType
            target_type = ZoneType.BULLISH_OB if is_buy else ZoneType.BEARISH_OB
            # Find the nearest unmitigated OB of the right type to entry price
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

        # ── Stop Loss ────────────────────────────────────────────────────────
        if is_buy:
            # SL below the bullish OB bottom (fallback: 1% below entry)
            ob_bottom = ob_bottom_val if ob_bottom_val is not None else entry * 0.99
            sl = ob_bottom * (1.0 - SL_BUFFER_PCT)
        else:
            # SL above the bearish OB top (fallback: 1% above entry)
            ob_top = ob_top_val if ob_top_val is not None else entry * 1.01
            sl = ob_top * (1.0 + SL_BUFFER_PCT)

        sl_distance = abs(entry - sl)

        # Guard against zero-distance (malformed zone data)
        if sl_distance < 1e-10:
            sl_distance = entry * 0.01   # fallback 1% SL

        # ── Take Profit ──────────────────────────────────────────────────────
        if is_buy:
            tp = entry + (sl_distance * DEFAULT_TP_MULT)
        else:
            tp = entry - (sl_distance * DEFAULT_TP_MULT)

        # ── Risk/Reward ──────────────────────────────────────────────────────
        rr = abs(tp - entry) / sl_distance

        signal.stop_loss   = round(sl, 8)
        signal.take_profit = round(tp, 8)
        signal.risk_reward = round(rr, 2)

        log.debug(
            f"Risk calc: entry={entry:.6f} SL={sl:.6f} "
            f"TP={tp:.6f} RR=1:{rr:.2f}"
        )
        return signal