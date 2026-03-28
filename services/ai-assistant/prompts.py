# # ──────────────────────────────────────────────
# # services/ai-assistant/prompts.py
# # All prompt templates for the AI mentor
# # ──────────────────────────────────────────────
# from models import UserContext, SMCSignal, TradeRecord


# # ── Layer 1: System Persona ───────────────────
# SYSTEM_PERSONA = """You are an expert Smart Money Concepts (SMC) trading mentor with 15+ years of institutional trading experience.

# STRICT RULES — never break these:
# - Only use SMC and pure price action concepts
# - NEVER mention RSI, MACD, Bollinger Bands, moving averages, or any lagging indicator
# - NEVER give financial advice or guarantee outcomes
# - Always remind users that trading involves risk
# - Keep responses concise and practical — no fluff

# SMC CONCEPTS YOU USE:
# Order Blocks (OB), Fair Value Gaps (FVG), Liquidity Pools, Break of Structure (BOS),
# Change of Character (CHOCH), Premium/Discount zones, Inducement, Mitigation,
# Market Structure, Displacement, Imbalance, Smart Money Traps"""


# def build_system_prompt(ctx: UserContext, recent_signals: list[SMCSignal]) -> str:
#     """Build the full layered system prompt for a chat session."""

#     # Layer 2: User context
#     skill_instructions = {
#         "BEGINNER": "Use simple, plain language. Define every SMC term you use. Use analogies. Avoid jargon.",
#         "INTERMEDIATE": "Assume basic SMC knowledge. Focus on execution timing and entry model nuances.",
#         "ADVANCED": "Use full institutional terminology. Discuss order flow, multi-session analysis, and playbook building.",
#     }

#     trade_summary = _format_trades(ctx.recent_trades)
#     signals_summary = _format_signals(recent_signals)

#     return f"""{SYSTEM_PERSONA}

# USER PROFILE:
# - Skill level: {ctx.skill_level}
# - Instruction style: {skill_instructions.get(ctx.skill_level, skill_instructions['BEGINNER'])}

# RECENT TRADE HISTORY (last {len(ctx.recent_trades)} trades):
# {trade_summary}

# CURRENT MARKET CONTEXT (latest signals):
# {signals_summary}"""


# def build_explanation_prompt(signal: SMCSignal, skill_level: str) -> str:
#     """Prompt to generate an AI explanation for a specific signal."""

#     style = {
#         "BEGINNER": "Use simple language and define every term. Explain like you're teaching a new trader.",
#         "INTERMEDIATE": "Focus on the entry logic, timing, and what to watch for.",
#         "ADVANCED": "Discuss institutional order flow, why smart money would be at this level, and the full playbook.",
#     }.get(skill_level, "Use simple language.")

#     return f"""Generate a clear, practical explanation for this SMC trading signal.

# SIGNAL DATA:
# - Pair: {signal.pair}
# - Direction: {signal.type}
# - Entry: {signal.entry}
# - Stop Loss: {signal.stop_loss}
# - Take Profit: {signal.take_profit}
# - Risk/Reward: {signal.risk_reward}
# - Confidence: {signal.confidence_score}%
# - Confluences: {', '.join(signal.confluences)}
# - HTF Bias: {signal.htf_bias}
# - Entry Model: {signal.entry_model}
# - Timeframe: {signal.timeframe} (HTF: {signal.htf_timeframe})

# STYLE: {style}

# Write 3-4 sentences explaining:
# 1. WHY this setup is valid (what SMC conditions aligned)
# 2. WHERE the entry is and why that level matters
# 3. WHEN this setup is invalidated (what would make you exit or avoid it)

# Be direct and practical. No fluff."""


# def build_trade_review_prompt(trade: TradeRecord, skill_level: str) -> str:
#     """Prompt to review a completed trade."""

#     outcome_context = {
#         "WIN":       "This was a winning trade. Reinforce what was done correctly.",
#         "LOSS":      "This was a losing trade. Identify the mistake category and give a specific fix.",
#         "BREAKEVEN": "This trade broke even. Analyze whether the setup was valid and what could improve next time.",
#         "PENDING":   "This trade is still open. Evaluate whether the setup remains valid.",
#     }.get(trade.outcome, "")

#     return f"""Review this SMC trade and provide mentorship feedback.

# TRADE DETAILS:
# - Pair: {trade.pair}
# - Direction: {trade.trade_type}
# - Entry: {trade.entry}
# - Stop Loss: {trade.stop_loss}
# - Take Profit: {trade.take_profit}
# - Risk/Reward: {trade.risk_reward}
# - Outcome: {trade.outcome}
# - Notes: {trade.notes or 'None provided'}

# OUTCOME CONTEXT: {outcome_context}

# Provide feedback in this structure:
# 1. SETUP VALIDITY: Was this a valid SMC setup? Why or why not?
# 2. ENTRY QUALITY: Was entry timing and placement correct?
# 3. RISK MANAGEMENT: Was the SL logically placed? Was the TP realistic?
# 4. MISTAKE CATEGORY (if loss): premature entry / counter-trend / SL too tight / chasing / other
# 5. IMPROVEMENT: One specific thing to do differently next time

# User skill level: {skill_level} — adjust language accordingly."""


# # ── Formatters ────────────────────────────────

# def _format_trades(trades: list[TradeRecord]) -> str:
#     if not trades:
#         return "No recent trades on record."
#     lines = []
#     for t in trades:
#         lines.append(
#             f"  • {t.pair} {t.trade_type} | Entry: {t.entry} | RR: {t.risk_reward} | Outcome: {t.outcome}"
#         )
#     return "\n".join(lines)


# def _format_signals(signals: list[SMCSignal]) -> str:
#     if not signals:
#         return "No recent signals available."
#     lines = []
#     for s in signals:
#         lines.append(
#             f"  • {s.pair} {s.type} | Score: {s.confidence_score}% | "
#             f"Confluences: {', '.join(s.confluences)} | HTF: {s.htf_bias}"
#         )
#     return "\n".join(lines)














# FILE: services/ai-assistant/prompts.py
# ─────────────────────────────────────────────────────────────
# Layered prompt architecture — builds system + user prompts
# for chat, signal explanation, and trade review endpoints
# ─────────────────────────────────────────────────────────────

from models import SMCSignal, TradeRecord, UserContext


# ── Helper formatters ─────────────────────────────────────────

def _format_signals(signals: list[dict]) -> str:
    if not signals:
        return "No recent signals available."
    lines = []
    for s in signals:
        lines.append(
            f"- {s.get('pair')} {s.get('type')} | "
            f"Confidence: {s.get('confidence_score')}% | "
            f"Confluences: {', '.join(s.get('confluences', []))} | "
            f"HTF Bias: {s.get('htf_bias')}"
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
            f"RR: {t.risk_reward} | Outcome: {t.outcome}"
        )
    return "\n".join(lines)


def _skill_instruction(skill_level: str) -> str:
    instructions = {
        "BEGINNER": (
            "The user is a beginner. Use simple language. "
            "Define all SMC terms when first used. Use analogies. "
            "Avoid institutional jargon. Keep explanations short and friendly."
        ),
        "INTERMEDIATE": (
            "The user has basic SMC knowledge. Focus on execution timing, "
            "entry model nuances, and confluence combinations. "
            "No need to define basic terms."
        ),
        "ADVANCED": (
            "The user is experienced. Use full institutional SMC terminology. "
            "Discuss order flow, session analysis, multi-timeframe confluence, "
            "and playbook building. Be precise and concise."
        ),
    }
    return instructions.get(skill_level, instructions["BEGINNER"])


# ── Prompt builders called by main.py ─────────────────────────

def build_system_prompt(ctx: UserContext, recent_signals: list[dict]) -> str:
    """
    Builds the full 4-layer system prompt for the /chat endpoint.
    Layer 1: Persona  |  Layer 2: User context  |  Layer 3: Market context
    """
    win_rate_str = f"{int(ctx.win_rate * 100)}%" if ctx.win_rate is not None else "unknown"

    return f"""You are an expert Smart Money Concepts (SMC) trading mentor.

STRICT RULES:
- Only use SMC and pure price action concepts.
- Never mention RSI, MACD, Bollinger Bands, or any lagging indicator.
- Never give financial advice or guarantee outcomes.
- Always explain your reasoning using market structure logic.

SKILL LEVEL INSTRUCTION:
{_skill_instruction(ctx.skill_level)}

USER PROFILE:
- Skill level: {ctx.skill_level}
- Recent win rate: {win_rate_str}
- Recent trades:
{_format_trades(ctx.recent_trades)}

CURRENT MARKET CONTEXT (last 3 signals from the engine):
{_format_signals(recent_signals)}

Respond helpfully, specifically, and concisely. If the user asks about a concept,
explain it clearly. If they ask about a trade, give structured feedback.
Do not pad responses with unnecessary filler text."""


def build_explanation_prompt(signal: SMCSignal, skill_level: str) -> str:
    """
    Prompt to generate a plain-language explanation for a single signal.
    Used by the /explain endpoint, called at signal publish time.
    """
    skill_note = _skill_instruction(skill_level)

    return f"""Explain this SMC trading signal in plain language.

SIGNAL DETAILS:
- Pair: {signal.pair}
- Direction: {signal.type}
- Entry: {signal.entry}
- Stop Loss: {signal.stop_loss}
- Take Profit: {signal.take_profit}
- Risk/Reward: {signal.risk_reward}
- Confidence Score: {signal.confidence_score}%
- Confluences: {', '.join(signal.confluences)}
- HTF Bias: {signal.htf_bias}
- Entry Model: {signal.entry_model}
- Timeframe: {signal.timeframe} (HTF: {signal.htf_timeframe})

SKILL LEVEL: {skill_level}
{skill_note}

Write 3-5 sentences that:
1. Explain WHY this signal was generated (what SMC setup triggered it)
2. Explain WHERE the SL and TP are placed and why
3. State ONE condition that would invalidate this setup

Be specific. Do not use generic filler. Use the actual price levels provided."""


def build_trade_review_prompt(trade: TradeRecord, skill_level: str) -> str:
    """
    Prompt to review a completed trade and provide mentorship feedback.
    Used by the /review endpoint — routes to Claude for deeper analysis.
    """
    skill_note = _skill_instruction(skill_level)

    notes_section = f"\nUser notes: {trade.notes}" if trade.notes else ""

    return f"""Review this completed trade from an SMC perspective and provide mentorship feedback.

TRADE DETAILS:
- Pair: {trade.pair}
- Direction: {trade.trade_type}
- Entry: {trade.entry}
- Stop Loss: {trade.stop_loss}
- Take Profit: {trade.take_profit}
- Risk/Reward: {trade.risk_reward}
- Outcome: {trade.outcome}{notes_section}

SKILL LEVEL: {skill_level}
{skill_note}

Structure your feedback as follows:
1. ENTRY QUALITY — Was the entry placement valid from an SMC perspective?
2. RISK MANAGEMENT — Was the SL/TP logical relative to structure?
3. MISTAKE IDENTIFIED — If outcome was a loss, what was the likely error?
   (Options: premature entry, counter-trend trade, SL too tight, overleveraged, ignored HTF bias)
4. IMPROVEMENT — One specific actionable thing to do differently next time.

Be direct and specific. Use actual price levels in your analysis."""