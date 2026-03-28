"""
scoring/config.py — Confluence Engine Configuration
SMC Trading SaaS — Phase 2

All weights must sum to 100.
Threshold is the minimum score to publish a signal.
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
SIGNAL_THRESHOLD = 65    # Minimum score to publish to Redis

# ── Entry Model Thresholds ────────────────────────────────────────────────────
ANTICIPATION_THRESHOLD  = 65   # OB + Liq sweep only (no BOS confirmation)
CONFIRMATION_THRESHOLD  = 80   # All confluences including BOS/CHOCH

# ── Risk Management ───────────────────────────────────────────────────────────
MIN_RR              = 2.0   # Minimum Risk:Reward ratio to publish
SL_BUFFER_TICKS     = 3     # Extra ticks beyond OB wick for SL
DEFAULT_ACCOUNT_RISK_PCT = 1.0   # Default 1% account risk per trade

# ── Intra-Candle Processing ───────────────────────────────────────────────────
SIGNAL_COOLDOWN_SECONDS = 60   # Minimum seconds between signals for same pair
INTRACANDLE_SCORE_THRESHOLD = 70  # Higher bar for intra-candle triggers

# ── Timeframe Config ──────────────────────────────────────────────────────────
HTF_TIMEFRAMES = ["1h", "4h"]
LTF_TIMEFRAMES = ["1m", "5m"]
WATCHED_PAIRS  = [
    "BTCUSDT", "ETHUSDT", "SOLUSDT",
    "BNBUSDT", "XRPUSDT", "ADAUSDT",
]

# ── Zone Age Limits (in candles) ──────────────────────────────────────────────
MAX_OB_AGE_CANDLES  = 200
MAX_FVG_AGE_CANDLES = 100
MAX_LIQ_AGE_CANDLES = 50