# FILE: services/ai-assistant/prompts.py
# ─────────────────────────────────────────────────────────────
# Layered prompt architecture for the SMC AI mentor
#
# FIXES (aligned with signal engine changes):
#   - build_explanation_prompt: references "1H and 4H" bias (not single TF)
#   - Entry timeframe explicitly stated as "15m" in analysis context
#   - Entry model descriptions corrected:
#       CONFIRMATION  = BOS/CHOCH confirmed on 15m — higher win rate
#       ANTICIPATION  = pre-BOS entry at OB/FVG — tighter SL, earlier fill
#   - TP ladder (TP1/TP2/TP3) now included in signal analysis prompt
#   - Anticipatory signals get dedicated analysis section
#   - _format_signals helper updated to show entry TF + HTF bias correctly
# ─────────────────────────────────────────────────────────────

from models import SMCSignal, TradeRecord, UserContext


# ── Helper formatters ─────────────────────────────────────────

def _format_signals(signals: list[dict]) -> str:
    if not signals:
        return "No recent signals available."
    lines = []
    for s in signals:
        htf   = s.get("htf_bias", "NEUTRAL")
        confs = ", ".join(s.get("confluences", []))
        entry_tf = s.get("timeframe", "15m")
        # Show TP2 as primary target (main swing), fall back to legacy tp
        tp    = s.get("take_profit_2") or s.get("take_profit", "?")
        rr    = s.get("rr_2") or s.get("risk_reward", "?")
        lines.append(
            f"- {s.get('pair')} {s.get('type')} | "
            f"Entry TF: {entry_tf} | 1H/4H Bias: {htf} | "
            f"Entry: {s.get('entry')} | SL: {s.get('stop_loss')} | "
            f"TP2: {tp} (1:{rr}) | "
            f"Confidence: {s.get('confidence_score')}% | "
            f"Confluences: {confs or 'None'}"
        )
    return "\n".join(lines)


def _format_trades(trades: list[TradeRecord]) -> str:
    if not trades:
        return "No recent trades logged."
    lines = []
    for t in trades:
        lines.append(
            f"- {t.pair} {t.trade_type} | Entry: {t.entry} | "
            f"SL: {t.stop_loss} | TP: {t.take_profit} | "
            f"RR: 1:{t.risk_reward} | Outcome: {t.outcome}"
        )
    return "\n".join(lines)


def _skill_instruction(skill_level: str) -> str:
    instructions = {
        "BEGINNER": (
            "The user is a beginner trader. Use clear, simple language. "
            "Define every SMC term when first used (e.g. explain what an Order Block is). "
            "Use analogies. Avoid heavy jargon. Keep explanations friendly and encouraging."
        ),
        "INTERMEDIATE": (
            "The user has solid SMC fundamentals. Focus on execution timing, "
            "confluence stacking, entry model precision (anticipation vs confirmation), "
            "and risk management nuances. No need to define basic terms."
        ),
        "ADVANCED": (
            "The user is an experienced trader. Use full institutional SMC terminology. "
            "Discuss order flow, session-based liquidity, multi-timeframe confluence, "
            "displacement, and trade playbook construction. Be precise and analytical."
        ),
    }
    return instructions.get(skill_level, instructions["BEGINNER"])


# ── Chat system prompt ────────────────────────────────────────

def build_system_prompt(ctx: UserContext, recent_signals: list[dict]) -> str:
    """
    Builds the full 4-layer system prompt for the /chat endpoint.
    Layer 1: Persona  |  Layer 2: User profile  |  Layer 3: Trade history  |  Layer 4: Market context
    """
    win_rate_str = f"{int(ctx.win_rate * 100)}%" if ctx.win_rate is not None else "unknown"

    return f"""You are an expert Smart Money Concepts (SMC) trading mentor with deep institutional trading knowledge.

SIGNAL ENGINE CONTEXT (so you can reference it accurately):
- Entry timeframe: 15m (15-minute candles only — 1m/3m/5m are excluded as too noisy)
- Directional bias timeframes: 1H and 4H (both must align for highest conviction)
- Entry models: CONFIRMATION (BOS/CHOCH confirmed on 15m) or ANTICIPATION (pre-BOS at OB/FVG)
- TP ladder: TP1 ~1:2 (50% exit), TP2 ~1:3.5 main target (30% exit), TP3 ~1:5.5 runner (20%)
- Minimum confidence to publish: 55% (anticipatory), 80% (confirmed)

STRICT RULES:
- Only reference SMC and pure price action concepts. Never mention RSI, MACD, Bollinger Bands, moving averages, or any lagging indicator.
- Never give financial advice or guarantee trade outcomes. Always note that trading carries risk.
- Be specific and use the actual numbers from signals/trades in your responses — do not be generic.
- If the user references a signal or trade in their watchlist context, address it directly.
- Do not repeat context back to the user verbatim. Use it silently to inform your answer.

SKILL LEVEL ADAPTATION:
{_skill_instruction(ctx.skill_level)}

USER PROFILE:
- Skill level: {ctx.skill_level}
- Recent win rate: {win_rate_str} (last {len(ctx.recent_trades)} trades)

RECENT TRADE HISTORY:
{_format_trades(ctx.recent_trades)}

LIVE MARKET SIGNALS (from the signal engine right now):
{_format_signals(recent_signals)}

Respond helpfully and specifically. Reference actual prices and levels when available.
If the user asks about a specific coin or signal from their context, provide concrete analysis.
Do not pad responses. Keep answers focused and actionable."""


# ── Signal explanation prompt ─────────────────────────────────

def build_explanation_prompt(
    signal: SMCSignal,
    skill_level: str,
    tp_ladder: dict = None,
    is_anticipatory: bool = False,
    pre_signal_note: str = "",
) -> str:
    """
    Generates a detailed, real AI analysis for a specific signal.
    Uses actual price levels — no hardcoded or placeholder text.

    FIX: now receives full TP ladder and anticipatory flag so the
    analysis correctly reflects the 3-tier exit strategy and whether
    this is a pre-BOS or confirmed entry.
    """
    skill_note = _skill_instruction(skill_level)
    tp_ladder  = tp_ladder or {}

    # FIX: corrected entry model descriptions
    if signal.entry_model == "CONFIRMATION":
        entry_model_label = (
            "CONFIRMATION — BOS/CHOCH confirmed on the 15m timeframe. "
            "Structure has broken, smart money intent is clear. Higher win rate entry."
        )
    else:
        entry_model_label = (
            "ANTICIPATION — Entry before BOS/CHOCH confirmation, at the OB or FVG. "
            "Tighter stop loss, earlier fill, lower win rate. Reduce position size by 30-50%."
        )

    sl_distance = abs(signal.entry - signal.stop_loss)
    confluence_list = ", ".join(signal.confluences) if signal.confluences else "price action structure"

    # Build TP ladder section
    tp1 = tp_ladder.get("take_profit_1", 0)
    tp2 = tp_ladder.get("take_profit_2", 0) or signal.take_profit
    tp3 = tp_ladder.get("take_profit_3", 0)
    rr1 = tp_ladder.get("rr_1", 0)
    rr2 = tp_ladder.get("rr_2", 0) or signal.risk_reward
    rr3 = tp_ladder.get("rr_3", 0)

    tp_section = f"""TP LADDER (3-tier exit strategy):
- TP1: {tp1 or 'N/A'} (1:{rr1 if rr1 else '~2.0'}) — Exit 50% of position here (scalp)
- TP2: {tp2 or 'N/A'} (1:{rr2 if rr2 else '~3.5'}) — Exit 30% here (main swing target) ★
- TP3: {tp3 or 'N/A'} (1:{rr3 if rr3 else '~5.5'}) — Trail SL, exit final 20% at liquidity pool"""

    anticipatory_section = ""
    if is_anticipatory:
        anticipatory_section = f"""
⚠ ANTICIPATORY SIGNAL:
{pre_signal_note or 'Price is approaching the zone. BOS/CHOCH not yet confirmed on 15m.'}
Analysis should note that this is a pre-confirmation entry and traders should reduce size or wait for the 15m BOS before entering with full size.
"""

    return f"""You are an SMC trading mentor. Analyse this signal and write a clear, specific explanation for a trader.

SIGNAL DATA:
- Pair:               {signal.pair}
- Direction:          {signal.type} ({'Bullish' if signal.type == 'BUY' else 'Bearish'})
- Entry Timeframe:    {signal.timeframe} (15-minute candle entries only)
- 1H & 4H Bias:       {signal.htf_bias} (both higher timeframes confirm direction)
- Entry Price:        {signal.entry}
- Stop Loss:          {signal.stop_loss}  (distance: {sl_distance:.4f})
- Entry Model:        {entry_model_label}
- Confidence Score:   {signal.confidence_score}%
- Confluences:        {confluence_list}

{tp_section}
{anticipatory_section}
SKILL LEVEL: {skill_level}
{skill_note}

Write a structured analysis with these 4 parts. Be specific — use the actual price levels above:

1. SETUP RATIONALE — Why does this signal make sense? What SMC structure triggered it on the 15m? How do the 1H and 4H bias support the direction?

2. KEY LEVELS — Explain where the entry, SL, and TP2 (main target) are placed and WHY from an SMC perspective (e.g. SL below the last swing low / OB, TP2 targets the next liquidity pool or opposing OB).

3. RISK/REWARD — Comment on the 1:{rr2} TP2 ratio and the 3-tier exit plan. Is this a solid setup or marginal? What does the {signal.confidence_score}% confidence score reflect in terms of confluence stacking?

4. INVALIDATION — What price action on the 15m would invalidate this setup? What would signal that smart money has absorbed supply/demand elsewhere?

Keep the total response under 220 words. No bullet points — write in short, clear paragraphs. Do not use generic filler phrases — be analytical and direct."""


# ── Trade review prompt ───────────────────────────────────────

def build_trade_review_prompt(trade: TradeRecord, skill_level: str) -> str:
    """
    Reviews a completed trade and provides structured mentorship feedback.
    Routes to Claude via use_anthropic=True in main.py for deeper analysis.
    """
    skill_note = _skill_instruction(skill_level)
    notes_section = f"\nUser notes: {trade.notes}" if trade.notes else ""

    outcome_framing = {
        "WIN":       "This was a winning trade. Reinforce what was done correctly and identify what could be improved further.",
        "LOSS":      "This was a losing trade. Identify the most likely error category and give one specific, actionable fix.",
        "BREAKEVEN": "This trade broke even. Evaluate whether the setup was valid, and what could improve execution next time.",
        "PENDING":   "This trade is still open. Evaluate whether the original setup rationale still holds at the current structure.",
    }.get(trade.outcome, "")

    return f"""Review this completed SMC trade and provide structured mentorship feedback.

TRADE DETAILS:
- Pair:          {trade.pair}
- Direction:     {trade.trade_type}
- Entry:         {trade.entry}
- Stop Loss:     {trade.stop_loss}
- Take Profit:   {trade.take_profit}
- Risk/Reward:   1:{trade.risk_reward}
- Outcome:       {trade.outcome}{notes_section}

ENGINE CONTEXT: Entry was on the 15m timeframe. Bias determined by 1H and 4H alignment.
TP ladder: TP1 (50% at 1:2), TP2 main (30% at 1:3.5), TP3 runner (20% at 1:5.5+).

OUTCOME CONTEXT: {outcome_framing}

SKILL LEVEL: {skill_level}
{skill_note}

Structure your feedback exactly as follows:

1. ENTRY QUALITY — Was this entry valid from an SMC perspective on the 15m? Was price at a premium/discount? Did the 1H and 4H bias support the direction?

2. RISK MANAGEMENT — Was the SL placed behind a valid structural level? Was the TP realistic (liquidity target, previous high/low, opposing OB)? Was the 3-tier exit plan followed?

3. MISTAKE IDENTIFIED (if loss) — Choose one: premature entry | counter-trend trade | SL too tight | overleveraged | ignored 1H/4H bias | chased price | entered on wrong TF. Explain briefly.

4. ONE IMPROVEMENT — One specific, actionable change to make on the next similar setup.

Use the actual price levels ({trade.entry}, {trade.stop_loss}, {trade.take_profit}) in your feedback. Be direct — no filler."""