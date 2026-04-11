# FILE: services/ai-assistant/main.py
# ─────────────────────────────────────────────────────────────
# FastAPI service — AI mentor endpoints
# Called by the Node.js api-server as a proxy
# Port: 8001 (matches Dockerfile EXPOSE and docker-compose healthcheck)
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

        signal = SMCSignal(
            signal_id        = req.signal.get("signal_id", ""),
            pair             = req.signal["pair"],
            type             = req.signal["type"],
            entry            = req.signal["entry"],
            stop_loss        = req.signal["stop_loss"],
            take_profit      = req.signal["take_profit"],
            risk_reward      = req.signal["risk_reward"],
            confidence_score = req.signal["confidence_score"],
            confluences      = req.signal.get("confluences", []),
            htf_bias         = req.signal.get("htf_bias", "NEUTRAL"),
            entry_model      = req.signal.get("entry_model", "CONFIRMATION"),
            ai_explanation   = "",
            timeframe        = req.signal.get("timeframe", "5M"),
            htf_timeframe    = req.signal.get("htf_timeframe", "1H"),
            timestamp        = 0,
        )

        prompt = build_explanation_prompt(signal, ctx.skill_level)
        explanation = chat(
            system_prompt = "You are an expert SMC trading mentor. Be concise and clear.",
            messages      = [{"role": "user", "content": prompt}],
            max_tokens    = 300,
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