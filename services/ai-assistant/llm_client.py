# # FILE: services/ai-assistant/llm_client.py
# # ─────────────────────────────────────────────────────────────
# # LLM client — Groq (primary, free) + Anthropic Claude (fallback)
# # Exposes a single `chat()` function used by all endpoints in main.py
# # ─────────────────────────────────────────────────────────────

# import os
# from groq import Groq
# import anthropic

# # ── Clients (lazy init — only connect when first called) ──────
# _groq_client      = None
# _anthropic_client = None


# def _get_groq() -> Groq:
#     global _groq_client
#     if _groq_client is None:
#         api_key = os.environ.get("GROQ_API_KEY", "")
#         if not api_key:
#             raise RuntimeError("GROQ_API_KEY is not set in environment variables")
#         _groq_client = Groq(api_key=api_key)
#     return _groq_client


# def _get_anthropic() -> anthropic.Anthropic:
#     global _anthropic_client
#     if _anthropic_client is None:
#         api_key = os.environ.get("ANTHROPIC_API_KEY", "")
#         if not api_key:
#             raise RuntimeError("ANTHROPIC_API_KEY is not set — required for trade review")
#         _anthropic_client = anthropic.Anthropic(api_key=api_key)
#     return _anthropic_client


# # ── Primary function imported by main.py ─────────────────────

# def chat(
#     system_prompt: str,
#     messages: list[dict],
#     max_tokens: int = 600,
#     use_anthropic: bool = False,
# ) -> str:
#     """
#     Send a chat request to Groq (default) or Anthropic Claude (use_anthropic=True).

#     Args:
#         system_prompt:  The system/persona instruction string.
#         messages:       List of {"role": "user"/"assistant", "content": "..."} dicts.
#         max_tokens:     Maximum tokens in the response.
#         use_anthropic:  If True, route to Claude Haiku for deeper analysis.

#     Returns:
#         The AI response as a plain string.
#     """
#     if use_anthropic:
#         return _chat_anthropic(system_prompt, messages, max_tokens)
#     return _chat_groq(system_prompt, messages, max_tokens)


# def _chat_groq(system_prompt: str, messages: list[dict], max_tokens: int) -> str:
#     """Call Groq — ultra-fast, free tier, Llama 3 70B."""
#     try:
#         client = _get_groq()

#         full_messages = [{"role": "system", "content": system_prompt}] + messages

#         response = client.chat.completions.create(
#             model      = "llama-3.3-70b-versatile",   # Free tier — fastest Groq model
#             messages   = full_messages,
#             max_tokens = max_tokens,
#             temperature= 0.4,                 # Lower = more consistent SMC analysis
#         )

#         return response.choices[0].message.content.strip()

#     except Exception as e:
#         print(f"[LLM] Groq error: {e}")
#         # Attempt Anthropic fallback if Groq fails
#         print("[LLM] Falling back to Anthropic Claude...")
#         return _chat_anthropic(system_prompt, messages, max_tokens)


# def _chat_anthropic(system_prompt: str, messages: list[dict], max_tokens: int) -> str:
#     """Call Anthropic Claude Haiku — best SMC reasoning quality."""
#     try:
#         client = _get_anthropic()

#         response = client.messages.create(
#             model      = "claude-haiku-4-5-20251001",
#             max_tokens = max_tokens,
#             system     = system_prompt,
#             messages   = messages,
#         )

#         return response.content[0].text.strip()

#     except Exception as e:
#         print(f"[LLM] Anthropic error: {e}")
#         raise RuntimeError(f"All LLM providers failed. Last error: {e}")
















# FILE: services/ai-assistant/llm_client.py
# LLM client — Groq (primary) + OpenRouter (free fallback) + Anthropic (paid fallback)
# Priority: Groq → OpenRouter → Anthropic
#
# OpenRouter gives access to free models (Llama, Gemma, Mistral) via a single API key.
# No geo-restrictions — works globally including Nigeria.
# Get a free key at: https://openrouter.ai

import os
import anthropic
from groq import Groq

# ── Clients (lazy init) ───────────────────────────────────────
_groq_client      = None
_anthropic_client = None


def _get_groq() -> Groq:
    global _groq_client
    if _groq_client is None:
        api_key = os.environ.get("GROQ_API_KEY", "")
        if not api_key:
            raise RuntimeError("GROQ_API_KEY is not set")
        _groq_client = Groq(api_key=api_key)
    return _groq_client


def _get_anthropic() -> anthropic.Anthropic:
    global _anthropic_client
    if _anthropic_client is None:
        api_key = os.environ.get("ANTHROPIC_API_KEY", "")
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is not set")
        _anthropic_client = anthropic.Anthropic(api_key=api_key)
    return _anthropic_client


# ── Primary function ──────────────────────────────────────────

def chat(
    system_prompt: str,
    messages: list[dict],
    max_tokens: int = 600,
    use_anthropic: bool = False,
) -> str:
    """
    Send a chat request. Priority: Groq → OpenRouter → Anthropic.

    Args:
        system_prompt:  System/persona instruction string.
        messages:       List of {"role": "user"/"assistant", "content": "..."} dicts.
        max_tokens:     Maximum tokens in the response.
        use_anthropic:  If True, route directly to Claude (for deep analysis).

    Returns:
        AI response as a plain string.
    """
    if use_anthropic:
        return _chat_anthropic(system_prompt, messages, max_tokens)
    return _chat_groq(system_prompt, messages, max_tokens)


def _chat_groq(system_prompt: str, messages: list[dict], max_tokens: int) -> str:
    """Primary: Groq — ultra-fast, free tier, Llama 3 70B."""
    try:
        client = _get_groq()
        full_messages = [{"role": "system", "content": system_prompt}] + messages
        response = client.chat.completions.create(
            model       = "llama-3.3-70b-versatile",
            messages    = full_messages,
            max_tokens  = max_tokens,
            temperature = 0.4,
        )
        return response.choices[0].message.content.strip()

    except Exception as e:
        print(f"[LLM] Groq error: {e} — trying OpenRouter fallback")
        return _chat_openrouter(system_prompt, messages, max_tokens)


def _chat_openrouter(system_prompt: str, messages: list[dict], max_tokens: int) -> str:
    """
    Fallback 1: OpenRouter — free tier, works globally including Nigeria.
    Uses Llama 3.1 8B free model. Falls back to Anthropic if unavailable.
    Get your free key at: https://openrouter.ai
    """
    try:
        import httpx

        api_key = os.environ.get("OPENROUTER_API_KEY", "")
        if not api_key:
            raise RuntimeError("OPENROUTER_API_KEY is not set")

        full_messages = [{"role": "system", "content": system_prompt}] + messages

        response = httpx.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type":  "application/json",
                "HTTP-Referer":  "https://lamboapp.io",
                "X-Title":       "LamboApp SMC AI",
            },
            json={
                "model":       "meta-llama/llama-3.1-8b-instruct:free",
                "messages":    full_messages,
                "max_tokens":  max_tokens,
                "temperature": 0.4,
            },
            timeout=30.0,
        )

        if response.status_code == 200:
            data = response.json()
            return data["choices"][0]["message"]["content"].strip()
        else:
            raise RuntimeError(f"OpenRouter returned {response.status_code}: {response.text[:200]}")

    except Exception as e:
        print(f"[LLM] OpenRouter error: {e} — trying Anthropic fallback")
        return _chat_anthropic(system_prompt, messages, max_tokens)


def _chat_anthropic(system_prompt: str, messages: list[dict], max_tokens: int) -> str:
    """Fallback 2: Anthropic Claude Haiku — best reasoning quality (paid)."""
    try:
        client = _get_anthropic()
        response = client.messages.create(
            model      = "claude-haiku-4-5-20251001",
            max_tokens = max_tokens,
            system     = system_prompt,
            messages   = messages,
        )
        return response.content[0].text.strip()

    except Exception as e:
        print(f"[LLM] Anthropic error: {e}")
        raise RuntimeError(f"All LLM providers failed. Last error: {e}")