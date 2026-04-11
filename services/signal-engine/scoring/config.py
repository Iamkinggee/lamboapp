"""
scoring/config.py — Confluence Engine Configuration

Timeframes:
  HTF: 1H + 4H for bias
  LTF: 15m for entries (removed 1m — too noisy; 3m/5m — too fast for clean structure)

TP Ladder:
  TP1 = 1:2.0  (scalp partial)
  TP2 = 1:3.5  (main target)
  TP3 = 1:5.5+ (runner)
"""

# ── Confluence Weights (must sum to 100) ──────────────────────────────────────
WEIGHTS = {
    "liq_sweep": 30,
    "ob_tap":    25,
    "bos_choch": 20,
    "fvg":       15,
    "htf_bias":  10,
}

assert sum(WEIGHTS.values()) == 100, "Weights must sum to 100"

# ── Signal Thresholds ─────────────────────────────────────────────────────────
SIGNAL_THRESHOLD        = 50   # OB(25) + Liq(30) — anticipation entries
ANTICIPATION_THRESHOLD  = 50
CONFIRMATION_THRESHOLD  = 80   # Full stack including BOS/CHOCH

# ── Risk Management ───────────────────────────────────────────────────────────
MIN_RR              = 2.0   # Based on TP2 (main target)
SL_BUFFER_TICKS     = 3
DEFAULT_ACCOUNT_RISK_PCT = 1.0

# ── TP Ladder Multipliers ─────────────────────────────────────────────────────
TP1_MULT = 2.0    # Scalp — 50% of position
TP2_MULT = 3.5    # Main swing — 30% of position
TP3_MULT = 5.5    # Runner — 20% of position, targets opposing liquidity

# ── Cooldown ─────────────────────────────────────────────────────────────────
# 15m candles close every 900s. Cooldown must span at least one full candle
# to prevent re-firing on consecutive closes at the same zone.
SIGNAL_COOLDOWN_SECONDS     = 900   # 15 minutes — one full 15m candle
ENGINE_SIGNAL_COOLDOWN_SEC  = 900

# Anticipatory cooldown: half a candle (7.5 min) — still well-gated
ANTICIPATORY_COOLDOWN_SEC   = 450   # 7.5 minutes

# ── Intra-Candle Processing ───────────────────────────────────────────────────
INTRACANDLE_SCORE_THRESHOLD = 70

# ── Timeframe Config ──────────────────────────────────────────────────────────
HTF_TIMEFRAMES = ["1h", "4h"]   # Bias + structural zones
LTF_TIMEFRAMES = ["15m"]        # Entry timeframe — clean structure, less noise

# ── Zone Age Limits ───────────────────────────────────────────────────────────
MAX_OB_AGE_CANDLES  = 200
MAX_FVG_AGE_CANDLES = 100
MAX_LIQ_AGE_CANDLES = 50

# ── Bias Behaviour ────────────────────────────────────────────────────────────
NEUTRAL_BIAS_ALLOWED = True

# ── HTF Warm-up ───────────────────────────────────────────────────────────────
HTF_MIN_CANDLES = 30
LTF_MIN_CANDLES = 20

# ── Dedup Window ──────────────────────────────────────────────────────────────
# Prevents engine from firing same (pair + direction + entry_zone) twice
# within one candle window. Must match SIGNAL_COOLDOWN_SECONDS.
DEDUP_WINDOW_SEC = 900   # 15 minutes — same as cooldown