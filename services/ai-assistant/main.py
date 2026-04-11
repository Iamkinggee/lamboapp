# FILE: services/ai-assistant/main.py
# ─────────────────────────────────────────────────────────────
# FastAPI service — AI mentor endpoints
# Called by the Node.js api-server as a proxy
# Port: 8001 (matches Dockerfile EXPOSE and docker-compose healthcheck)
#
# FIXES:
#   - timeframe default corrected from "5M" → "15m" (entry TF)
#   - htf_timeframe default corrected from "1H" → "4h" (primary bias TF)
#   - TP ladder fields (take_profit_1/2/3, rr_1/2/3) now parsed and
#     forwarded to build_explanation_prompt for accurate analysis
#   - is_anticipatory flag passed through so prompt knows signal type
# ─────────────────────────────────────────────────────────────

import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

from db import get_user_context, get_recent_signals
from llm_client import chat
from prompts import (
    build_system_prompt,
    build_explanation_prompt,
    build_trade_review_prompt,
)
from models import SMCSignal, TradeRecord

app = FastAPI(title="SMC AI Mentor", version="1.0.0")


# ── Request/Response schemas ──────────────────

class ChatRequest(BaseModel):
    user_id: str
    message: str


class ChatResponse(BaseModel):
    response: str


class ExplainRequest(BaseModel):
    user_id: str
    signal: dict


class ExplainResponse(BaseModel):
    explanation: str


class TradeReviewRequest(BaseModel):
    user_id: str
    trade: dict


class TradeReviewResponse(BaseModel):
    review: str


# ── Endpoints ────────────────────────────────

@app.get("/health")
def health():
    """
    Docker healthcheck target.
    Must return 200 OK — checked every 10s by docker-compose.
    """
    return {"status": "ok", "service": "smc-ai-assistant"}


@app.post("/chat", response_model=ChatResponse)
async def mentor_chat(req: ChatRequest):
    """
    Main AI mentor chat endpoint.
    Builds full layered context and responds to user message.
    """
    try:
        ctx            = get_user_context(req.user_id)
        recent_signals = get_recent_signals(n=3)

        system = build_system_prompt(ctx, recent_signals)

        # Build messages: history + new user message
        messages = ctx.chat_history + [{"role": "user", "content": req.message}]

        response = chat(system_prompt=system, messages=messages, max_tokens=600)

        return ChatResponse(response=response)

    except Exception as e:
        print(f"[AI] /chat error: {e}")
        raise HTTPException(status_code=500, detail="AI service error")


@app.post("/explain", response_model=ExplainResponse)
async def explain_signal(req: ExplainRequest):
    """
    Generate a plain-language explanation for a specific signal.
    Called at signal publish time and on demand from the app.
    """
    try:
        ctx = get_user_context(req.user_id)

        # FIX: defaults updated to match signal engine output:
        #   timeframe    → "15m"  (entry candle)
        #   htf_timeframe → "4h"  (primary bias TF; 1H also used)
        signal = SMCSignal(
            signal_id        = req.signal.get("signal_id", ""),
            pair             = req.signal["pair"],
            type             = req.signal["type"],
            entry            = req.signal["entry"],
            stop_loss        = req.signal["stop_loss"],
            # Use TP2 as the primary TP (main swing target); fall back to legacy field
            take_profit      = req.signal.get("take_profit_2") or req.signal.get("take_profit", 0),
            # RR from TP2 (main target); fall back to legacy
            risk_reward      = req.signal.get("rr_2") or req.signal.get("risk_reward", 0),
            confidence_score = req.signal["confidence_score"],
            confluences      = req.signal.get("confluences", []),
            htf_bias         = req.signal.get("htf_bias", "NEUTRAL"),
            entry_model      = req.signal.get("entry_model", "CONFIRMATION"),
            ai_explanation   = "",
            # FIX: was "5M" — entry timeframe is always 15m
            timeframe        = req.signal.get("timeframe", "15m"),
            # FIX: was "1H" — primary HTF is 4H (1H also used for bias)
            htf_timeframe    = req.signal.get("htf_timeframe", "4h"),
            timestamp        = req.signal.get("timestamp", 0),
        )

        # FIX: pass full TP ladder + anticipatory flag to prompt builder
        tp_ladder = {
            "take_profit_1": req.signal.get("take_profit_1", 0),
            "take_profit_2": req.signal.get("take_profit_2", 0),
            "take_profit_3": req.signal.get("take_profit_3", 0),
            "rr_1":          req.signal.get("rr_1", 0),
            "rr_2":          req.signal.get("rr_2", 0),
            "rr_3":          req.signal.get("rr_3", 0),
        }
        is_anticipatory = req.signal.get("is_anticipatory", False)
        pre_signal_note = req.signal.get("pre_signal_note", "")

        prompt = build_explanation_prompt(
            signal,
            ctx.skill_level,
            tp_ladder=tp_ladder,
            is_anticipatory=is_anticipatory,
            pre_signal_note=pre_signal_note,
        )
        explanation = chat(
            system_prompt = "You are an expert SMC trading mentor. Be concise, specific, and analytical.",
            messages      = [{"role": "user", "content": prompt}],
            max_tokens    = 350,
        )

        return ExplainResponse(explanation=explanation)

    except Exception as e:
        print(f"[AI] /explain error: {e}")
        raise HTTPException(status_code=500, detail="AI service error")


@app.post("/review", response_model=TradeReviewResponse)
async def review_trade(req: TradeReviewRequest):
    """
    Review a completed trade and give mentorship feedback.
    """
    try:
        ctx = get_user_context(req.user_id)

        trade = TradeRecord(
            pair         = req.trade["pair"],
            trade_type   = req.trade["trade_type"],
            entry        = req.trade["entry"],
            stop_loss    = req.trade["stop_loss"],
            take_profit  = req.trade["take_profit"],
            risk_reward  = req.trade["risk_reward"],
            outcome      = req.trade["outcome"],
            notes        = req.trade.get("notes"),
        )

        prompt = build_trade_review_prompt(trade, ctx.skill_level)
        review = chat(
            system_prompt = "You are an expert SMC trading mentor. Give specific, actionable feedback.",
            messages      = [{"role": "user", "content": prompt}],
            max_tokens    = 500,
            use_anthropic = True,   # Use Claude for deeper trade analysis
        )

        return TradeReviewResponse(review=review)

    except Exception as e:
        print(f"[AI] /review error: {e}")
        raise HTTPException(status_code=500, detail="AI service error")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)