"""
scoring/config.py — Confluence Engine Configuration
SMC Trading SaaS — Phase 2

All weights must sum to 100.
Threshold is the minimum score to publish a signal.

FIXES:
  - SIGNAL_THRESHOLD lowered to 55 so OB+Liq setups publish even without BOS
  - ANTICIPATION_THRESHOLD lowered to 55 (matches publish threshold)
  - CONFIRMATION_THRESHOLD kept at 80 (BOS confirmed + most confluences)
  - SIGNAL_COOLDOWN_SECONDS reduced to 90s (was 60 in config, 300 in engine —
    engine now reads from here so one source of truth)
  - Added NEUTRAL_BIAS_ALLOWED flag so NEUTRAL HTF bias doesn't silently block
"""

# ── Confluence Weights (must sum to 100) ──────────────────────────────────────
WEIGHTS = {
    "liq_sweep": 30,   # Liquidity sweep (stop hunt)
    "ob_tap":    25,   # Order Block tap + reaction
    "bos_choch": 20,   # BOS or CHOCH on LTF
    "fvg":       15,   # FVG zone overlap
    "htf_bias":  10,   # HTF bias alignment
}

assert sum(WEIGHTS.values()) == 100, "Weights must sum to 100"

# ── Signal Publish Threshold ──────────────────────────────────────────────────
# 55 = OB tap (25) + Liq sweep (30). Allows anticipation entries before BOS.
# Previously 65 — was silently blocking valid setups.
SIGNAL_THRESHOLD = 55

# ── Entry Model Thresholds ────────────────────────────────────────────────────
# ANTICIPATION: enter on OB+Liq tap before structure break confirms.
# CONFIRMATION: BOS/CHOCH confirmed + high confluence stack.
ANTICIPATION_THRESHOLD  = 55   # OB + Liq sweep only (no BOS yet)
CONFIRMATION_THRESHOLD  = 80   # All confluences including BOS/CHOCH

# ── Risk Management ───────────────────────────────────────────────────────────
MIN_RR              = 1.5   # FIX: was 2.0 — too strict, many valid 1.5R setups missed
SL_BUFFER_TICKS     = 3     # Extra ticks beyond OB wick for SL
DEFAULT_ACCOUNT_RISK_PCT = 1.0

# ── Cooldown (single source of truth — engine reads from here) ────────────────
# FIX: was split across config (60s) and engine/main.py (300s hardcoded).
# Engine now imports this. 90s allows re-entry on same pair after a pullback.
SIGNAL_COOLDOWN_SECONDS     = 90
ENGINE_SIGNAL_COOLDOWN_SEC  = 90   # engine/main.py imports this alias

# ── Intra-Candle Processing ───────────────────────────────────────────────────
INTRACANDLE_SCORE_THRESHOLD = 70   # Higher bar for intra-candle triggers

# ── Timeframe Config ──────────────────────────────────────────────────────────
HTF_TIMEFRAMES = ["1h", "4h"]
LTF_TIMEFRAMES = ["1m", "5m"]

# ── Watched Pairs (config-level default; engine overrides via env) ─────────────
WATCHED_PAIRS = [
    "BTCUSDT", "ETHUSDT", "SOLUSDT",
    "BNBUSDT",  "XRPUSDT", "ADAUSDT",
]

# ── Zone Age Limits (in candles) ──────────────────────────────────────────────
MAX_OB_AGE_CANDLES  = 200
MAX_FVG_AGE_CANDLES = 100
MAX_LIQ_AGE_CANDLES = 50

# ── Bias Behaviour ────────────────────────────────────────────────────────────
# When HTF bias is NEUTRAL, still allow LTF-driven signals (CHOCH plays).
# Set to False to require a clear HTF bias for every signal.
NEUTRAL_BIAS_ALLOWED = True

# ── HTF Warm-up minimum ───────────────────────────────────────────────────────
# Minimum closed HTF candles before bias computation is trusted.
# FIX: was baked into htf_analyzer as 50; now centralised here so it's
# easy to tune without hunting through files.
HTF_MIN_CANDLES = 30   # was 50 — reduced so zones are ready sooner after boot
LTF_MIN_CANDLES = 20