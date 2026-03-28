# # ──────────────────────────────────────────────
# # services/ai-assistant/db.py
# # Supabase queries for the AI service
# # ──────────────────────────────────────────────
# import os
# from supabase import create_client, Client
# from models import UserContext, TradeRecord, SMCSignal

# _client: Client | None = None


# def get_client() -> Client:
#     global _client
#     if _client is None:
#         _client = create_client(
#             os.environ["SUPABASE_URL"],
#             os.environ["SUPABASE_SERVICE_ROLE_KEY"],
#         )
#     return _client


# def get_user_context(user_id: str, n_trades: int = 5, n_chat: int = 20) -> UserContext:
#     db = get_client()

#     # Skill level
#     prefs = db.table("user_preferences") \
#         .select("skill_level") \
#         .eq("user_id", user_id) \
#         .maybe_single() \
#         .execute()

#     skill_level = prefs.data["skill_level"] if prefs.data else "BEGINNER"

#     # Recent trades
#     trades_resp = db.table("trades") \
#         .select("pair, trade_type, entry, stop_loss, take_profit, risk_reward, outcome, notes") \
#         .eq("user_id", user_id) \
#         .order("created_at", desc=True) \
#         .limit(n_trades) \
#         .execute()

#     trades = [
#         TradeRecord(
#             pair=t["pair"],
#             trade_type=t["trade_type"],
#             entry=t["entry"],
#             stop_loss=t["stop_loss"],
#             take_profit=t["take_profit"],
#             risk_reward=t["risk_reward"],
#             outcome=t["outcome"],
#             notes=t.get("notes"),
#         )
#         for t in (trades_resp.data or [])
#     ]

#     # Chat history
#     chat_resp = db.table("chat_history") \
#         .select("chat_role, content") \
#         .eq("user_id", user_id) \
#         .order("created_at", desc=True) \
#         .limit(n_chat) \
#         .execute()

#     # Reverse to chronological order
#     chat = [
#         {"role": m["chat_role"], "content": m["content"]}
#         for m in reversed(chat_resp.data or [])
#     ]

#     return UserContext(
#         user_id=user_id,
#         skill_level=skill_level,
#         recent_trades=trades,
#         chat_history=chat,
#     )


# def get_recent_signals(n: int = 3) -> list[SMCSignal]:
#     db = get_client()
#     resp = db.table("signals") \
#         .select("*") \
#         .order("signal_time", desc=True) \
#         .limit(n) \
#         .execute()

#     return [
#         SMCSignal(
#             signal_id=s["id"],
#             pair=s["pair"],
#             type=s["signal_type"],
#             entry=s["entry"],
#             stop_loss=s["stop_loss"],
#             take_profit=s["take_profit"],
#             risk_reward=s["risk_reward"],
#             confidence_score=s["confidence_score"],
#             confluences=s["confluences"],
#             htf_bias=s["htf_bias"],
#             entry_model=s["entry_model"],
#             ai_explanation=s.get("ai_explanation", ""),
#             timeframe=s["signal_tf"],
#             htf_timeframe=s["htf_tf"],
#             timestamp=0,
#         )
#         for s in (resp.data or [])
#     ]

















# FILE: services/ai-assistant/db.py
# ─────────────────────────────────────────────────────────────
# Data access layer — Supabase (user data) + Redis (live signals)
# All clients are lazy-initialized to avoid import-time crashes
# ─────────────────────────────────────────────────────────────

import os
import json
from supabase import create_client, Client
import redis

from models import UserContext, TradeRecord

# ── Lazy clients ──────────────────────────────────────────────
_supabase_client: Client | None = None
_redis_client: redis.Redis | None = None


def _get_supabase() -> Client:
    global _supabase_client
    if _supabase_client is None:
        url = os.environ.get("SUPABASE_URL", "")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
        _supabase_client = create_client(url, key)
    return _supabase_client


def _get_redis() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379")
        _redis_client = redis.from_url(redis_url, decode_responses=True)
    return _redis_client


# ── Public functions called by main.py ───────────────────────

def get_user_context(user_id: str) -> UserContext:
    """
    Fetch user profile, chat history, and recent trades from Supabase.
    Returns a UserContext with safe defaults if data is missing.
    """
    try:
        sb = _get_supabase()

        # Fetch user profile
        user_row = (
            sb.table("users")
            .select("skill_level")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        skill_level = (user_row.data or {}).get("skill_level", "BEGINNER")

        # Fetch last 20 chat messages
        chat_rows = (
            sb.table("chat_messages")
            .select("role, content")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(20)
            .execute()
        )
        # Reverse so oldest message is first (correct chronological order for LLM)
        chat_history = list(reversed([
            {"role": r["role"], "content": r["content"]}
            for r in (chat_rows.data or [])
        ]))

        # Fetch last 5 trades
        trade_rows = (
            sb.table("trades")
            .select("pair, trade_type, entry, stop_loss, take_profit, risk_reward, outcome, notes")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(5)
            .execute()
        )
        recent_trades = [TradeRecord(**r) for r in (trade_rows.data or [])]

        # Calculate win rate
        win_rate = None
        if recent_trades:
            wins = sum(1 for t in recent_trades if t.outcome == "WIN")
            win_rate = round(wins / len(recent_trades), 2)

        return UserContext(
            user_id       = user_id,
            skill_level   = skill_level,
            chat_history  = chat_history,
            recent_trades = recent_trades,
            win_rate      = win_rate,
        )

    except Exception as e:
        print(f"[DB] get_user_context error for {user_id}: {e}")
        # Return safe default so the app doesn't crash if DB is unreachable
        return UserContext(
            user_id      = user_id,
            skill_level  = "BEGINNER",
            chat_history = [],
        )


def get_recent_signals(n: int = 3) -> list[dict]:
    """
    Fetch the last N signals from Redis pub/sub cache.
    Returns empty list if Redis is unavailable.
    """
    try:
        r = _get_redis()
        raw_signals = r.lrange("signals:history", 0, n - 1)
        return [json.loads(s) for s in raw_signals]
    except Exception as e:
        print(f"[DB] get_recent_signals error: {e}")
        return []