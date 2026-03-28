"""
scoring/confluence_engine.py — Weighted Confluence Scorer
SMC Trading SaaS — Phase 2

Evaluates a SignalState and returns (score, confluences, entry_model).
Only returns a result if the score meets or exceeds SIGNAL_THRESHOLD.
"""

from typing import Optional, Tuple, List

from models import SignalState, EntryModel
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
        confluences.append(
            f"{'Bullish' if state.direction.value == 'BUY' else 'Bearish'} Order Block Tap"
        )

    # ── BOS / CHOCH (20%) ──
    if state.bos_or_choch:
        score += WEIGHTS["bos_choch"]
        sb = state.structure_break
        label = "LTF Micro BOS Confirmed" if sb and sb.type.value == "BOS" else "LTF CHOCH Detected"
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
    if score < SIGNAL_THRESHOLD:
        return None, [], None

    # ── Determine Entry Model ──
    # Confirmation = BOS/CHOCH confirmed AND score >= 80%
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
    else:
        quality = "moderate"

    conf_str = ", ".join(confluences)
    return (
        f"This is a {quality} setup scoring {score}/100. "
        f"Active confluences: {conf_str}."
    )