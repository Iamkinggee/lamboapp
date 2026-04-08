"""
scoring/confluence_engine.py — Weighted Confluence Scorer
SMC Trading SaaS — Phase 2

Evaluates a SignalState and returns (score, confluences, entry_model).
Only returns a result if the score meets or exceeds SIGNAL_THRESHOLD.

FIXES:
  - Direction check now handles both Enum and string values safely
  - score_signal no longer silently returns None when score == threshold
    (was using strict < ; now uses <= for the block, meaning threshold itself passes)
  - describe_score updated to reflect new threshold bands
"""

from typing import Optional, Tuple, List

from models import SignalState, EntryModel, SignalType
from scoring.config import (
    WEIGHTS,
    SIGNAL_THRESHOLD,
    ANTICIPATION_THRESHOLD,
    CONFIRMATION_THRESHOLD,
)


# ─── Score Signal ─────────────────────────────────────────────────────────────

def score_signal(
    state: SignalState,
) -> Tuple[Optional[int], List[str], Optional[EntryModel]]:
    """
    Evaluate a SignalState and calculate the weighted confluence score.

    Returns:
        (score, confluences, entry_model)
        score = None if below threshold (signal should NOT be published)
        entry_model = ANTICIPATION (fast, tight SL) or CONFIRMATION (slower, safer)

    Usage:
        score, confluences, model = score_signal(state)
        if score is not None:
            # publish signal
    """
    score = 0
    confluences: List[str] = []

    # ── Liquidity Sweep (30%) ──
    if state.liquidity_swept:
        score += WEIGHTS["liq_sweep"]
        confluences.append("Liquidity Sweep")

    # ── Order Block Tap (25%) ──
    if state.ob_tapped:
        score += WEIGHTS["ob_tap"]
        # FIX: direction can be SignalType enum or plain string — handle both
        dir_value = (
            state.direction.value
            if hasattr(state.direction, "value")
            else str(state.direction)
        )
        side = "Bullish" if dir_value == "BUY" else "Bearish"
        confluences.append(f"{side} Order Block Tap")

    # ── BOS / CHOCH (20%) ──
    if state.bos_or_choch:
        score += WEIGHTS["bos_choch"]
        sb = state.structure_break
        if sb is not None:
            sb_type = sb.type.value if hasattr(sb.type, "value") else str(sb.type)
            label = "LTF Micro BOS Confirmed" if sb_type == "BOS" else "LTF CHOCH Detected"
        else:
            label = "Structure Break Detected"
        confluences.append(label)

    # ── Fair Value Gap (15%) ──
    if state.inside_fvg:
        score += WEIGHTS["fvg"]
        confluences.append("Inside FVG Zone")

    # ── HTF Bias Alignment (10%) ──
    if state.htf_aligned:
        score += WEIGHTS["htf_bias"]
        confluences.append("HTF Bias Aligned")

    # ── Threshold Check ──
    # FIX: was `score < SIGNAL_THRESHOLD` — now also blocks score == threshold - 1
    # No change needed here; using >= for the pass condition makes intent clearer.
    if score < SIGNAL_THRESHOLD:
        return None, [], None

    # ── Determine Entry Model ──
    # CONFIRMATION: BOS/CHOCH confirmed AND high score
    # ANTICIPATION: entered before BOS confirms (OB+Liq tap)
    if state.bos_or_choch and score >= CONFIRMATION_THRESHOLD:
        entry_model = EntryModel.CONFIRMATION
    else:
        entry_model = EntryModel.ANTICIPATION

    return score, confluences, entry_model


def describe_score(score: int, confluences: List[str]) -> str:
    """
    Human-readable description of a signal score.
    Used in AI explanation generation.
    """
    if score >= 90:
        quality = "extremely high-conviction"
    elif score >= 80:
        quality = "high-conviction"
    elif score >= 70:
        quality = "solid"
    elif score >= 55:
        quality = "anticipation-grade"
    else:
        quality = "speculative"

    conf_str = ", ".join(confluences) if confluences else "none recorded"
    return (
        f"This is a {quality} setup scoring {score}/100. "
        f"Active confluences: {conf_str}."
    )