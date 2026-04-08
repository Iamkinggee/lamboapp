import asyncio
import logging
import os
import time
import signal as _signal

from ws_client import BinanceWSClient, seed_historical
from candle_store import candle_store
from htf_analyzer import htf_analyzer
from ltf_analyzer import ltf_analyzer
from scoring.confluence_engine import score_signal
from publisher import RedisPublisher
from risk_manager import RiskManager
from models import Signal

# FIX: import cooldown constant from config — single source of truth.
# Previously engine hardcoded 300s while config said 60s. Engine was winning
# and blocking pairs for 5 minutes, silently killing re-entry signals.
from scoring.config import ENGINE_SIGNAL_COOLDOWN_SEC

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
log = logging.getLogger("engine.main")

DEFAULT_PAIRS = (
    "BTCUSDT,ETHUSDT,BNBUSDT,SOLUSDT,XRPUSDT,ADAUSDT,DOGEUSDT,AVAXUSDT,"
    "DOTUSDT,LINKUSDT,MATICUSDT,LTCUSDT,ATOMUSDT,UNIUSDT,XLMUSDT,ETCUSDT,"
    "ALGOUSDT,VETUSDT,ICPUSDT,FILUSDT,TRXUSDT,AAVEUSDT,SANDUSDT,MANAUSDT,"
    "AXSUSDT,GRTUSDT,ENJUSDT,CHZUSDT,ZECUSDT,DASHUSDT,XMRUSDT,"
    "NEARUSDT,FTMUSDT,1INCHUSDT,SNXUSDT,MKRUSDT,SUSHIUSDT,APEUSDT,"
    "OPUSDT,ARBUSDT,GMTUSDT,HBARUSDT,EGLDUSDT,FLOWUSDT,NEOUSDT,"
    "XTZUSDT,ZILUSDT,RUNEUSDT,LDOUSDT,RNDRUSDT,INJUSDT,SUIUSDT,"
    "SEIUSDT,TIAUSDT,WLDUSDT,ARKMUSDT,STXUSDT,APTUSDT,CRVUSDT,"
    "DYDXUSDT,IMXUSDT,GALAUSDT,OCEANUSDT,QNTUSDT,CELRUSDT,"
    "BANDUSDT,STORJUSDT,FETUSDT,AGIXUSDT,LRCUSDT,SKLUSDT,"
    "IOTAUSDT,DGBUSDT,KNCUSDT,ONTUSDT,ZRXUSDT,BNTUSDT,"
    "POWRUSDT,MASKUSDT,CHRUSDT,REEFUSDT,KLAYUSDT,WOOUSDT,PENDLEUSDT"
)

PAIRS            = [p.strip() for p in os.getenv("TRADING_PAIRS", DEFAULT_PAIRS).split(",") if p.strip()]
HTF_TF           = ["1h", "4h"]
LTF_TF           = ["1m", "5m"]

# FIX: MIN_RR now reads from config via env, defaulting to 1.5 (was 2.0).
# A 2.0 RR filter is too aggressive for many valid SMC setups.
MIN_RR           = float(os.getenv("MIN_RR", "1.5"))

# FIX: SIGNAL_COOLDOWN now reads from config constant, not a separate hardcoded value.
# Both engine-level and ltf_analyzer-level cooldowns are now in sync at 90s.
SIGNAL_COOLDOWN  = int(os.getenv("SIGNAL_COOLDOWN_SEC", str(ENGINE_SIGNAL_COOLDOWN_SEC)))

MIN_LTF_CANDLES  = 20
MIN_HTF_CANDLES  = 100
WS_BATCH_SIZE    = 200
SEED_CONCURRENCY = 10

risk_manager    = RiskManager(min_rr=MIN_RR)
publisher       = RedisPublisher()

# FIX: last_published is still here as a secondary engine-level guard to prevent
# the same pair from double-publishing within a single event loop tick.
# But it now uses SIGNAL_COOLDOWN (90s) instead of the old hardcoded 300s.
last_published: dict[str, float] = {}


async def on_kline(candle) -> None:
    try:
        pair = candle.pair
        tf   = candle.timeframe

        if not candle.is_closed:
            return

        if tf in HTF_TF:
            htf_analyzer.process_closed_candle(candle)
            return

        if tf not in LTF_TF:
            return

        if not candle_store.has_enough(pair, tf, minimum=MIN_LTF_CANDLES):
            return

        htf_zones = htf_analyzer.get_active_zones(pair)
        bias      = htf_zones.get("bias")

        log.debug(
            f"[{pair}/{tf}] price={candle.close} bias={bias} "
            f"OBs={len(htf_zones.get('obs', []))} FVGs={len(htf_zones.get('fvgs', []))} "
            f"Liq={len(htf_zones.get('liq', []))}"
        )

        # FIX: engine-level cooldown check — keeps the per-pair publish rate sane
        # without relying solely on ltf_analyzer's internal cooldown.
        now = time.time()
        if now - last_published.get(pair, 0) < SIGNAL_COOLDOWN:
            log.debug(f"[{pair}] Engine-level cooldown active — skipping")
            return

        ltf_state = ltf_analyzer.check_entry(candle, htf_zones)

        if not ltf_state:
            log.debug(f"[{pair}/{tf}] ltf_state=None — no entry condition")
            return

        log.info(
            f"[{pair}/{tf}] ✅ Entry hit | dir={ltf_state.direction} "
            f"ob={ltf_state.ob_tapped} fvg={ltf_state.inside_fvg} "
            f"liq={ltf_state.liquidity_swept} bos={ltf_state.bos_or_choch}"
        )

        result      = score_signal(ltf_state)
        score       = result[0]
        confluences = result[1]
        entry_model = result[2] if len(result) > 2 else None

        if score is None:
            log.debug(f"[{pair}/{tf}] score=None — rejected by confluence engine")
            return

        htf_bias = htf_analyzer.get_bias(pair)
        sig = Signal.from_state(ltf_state, score, confluences, pair, tf, htf_bias, entry_model)
        sig = risk_manager.calculate_sl_tp(sig, htf_zones)

        if sig.risk_reward < MIN_RR:
            log.debug(f"[{pair}] Signal rejected — RR {sig.risk_reward:.2f} < {MIN_RR}")
            return

        await publisher.publish(sig)

        # FIX: mark cooldown AFTER successful publish, not before scoring.
        # Previously ltf_analyzer._mark_signal() was called inside check_entry()
        # which consumed the cooldown even when the score failed threshold.
        last_published[pair] = now
        ltf_analyzer.mark_signal(pair)  # sync ltf_analyzer's internal tracker too

        log.info(f"📡 Signal fired: {pair} {sig.type} conf={score}% RR={sig.risk_reward:.2f}")

    except AttributeError as exc:
        # AttributeError usually means a missing method on a model class.
        # Log with full traceback so it is immediately visible in the logs.
        log.critical(f"[on_kline] AttributeError — likely missing model method: {exc}", exc_info=True)
    except Exception as exc:
        log.error(f"[on_kline] Unexpected error for {candle.pair}/{candle.timeframe}: {exc}", exc_info=True)


async def seed_all(pairs):
    sem = asyncio.Semaphore(SEED_CONCURRENCY)
    completed = 0
    total = len(pairs) * len(HTF_TF + LTF_TF)

    async def seed_one(pair, tf):
        nonlocal completed
        depth = {"4h": 500, "1h": 500, "5m": 300, "1m": 200}.get(tf, 200)
        async with sem:
            await seed_historical(candle_store, pair, tf, limit=depth)
        completed += 1
        if completed % 50 == 0 or completed == total:
            log.info(f"  Seeding: {completed}/{total} ({int(completed/total*100)}%)")

    await asyncio.gather(
        *[seed_one(p, tf) for p in pairs for tf in HTF_TF + LTF_TF],
        return_exceptions=True
    )


async def bootstrap_htf(pairs):
    """
    Process ALL historical HTF candles so that order blocks, FVGs and
    liquidity zones are fully built before going live.
    """
    count = 0
    for pair in pairs:
        for tf in HTF_TF:
            if not candle_store.has_enough(pair, tf, minimum=MIN_HTF_CANDLES):
                log.debug(f"[bootstrap] Skipping {pair}/{tf} — not enough candles")
                continue
            candles = candle_store.get_closed(pair, tf, n=500)
            if not candles:
                continue
            for candle in candles:
                htf_analyzer.process_closed_candle(candle)
            count += 1
            log.debug(f"[bootstrap] {pair}/{tf} — processed {len(candles)} candles")

    log.info(f"✅ HTF zones bootstrapped: {count} pair/tf combos")


async def main() -> None:
    log.info("═══════════════════════════════════════════════════")
    log.info(f"  SMC Signal Engine — {len(PAIRS)} pairs")
    log.info(f"  Backend: {os.getenv('BACKEND_URL', 'http://localhost:8001')}")
    log.info(f"  Min RR: {MIN_RR}  |  Cooldown: {SIGNAL_COOLDOWN}s")
    log.info("═══════════════════════════════════════════════════")

    await publisher.connect()

    log.info(f"⏳ Seeding {len(PAIRS)} pairs × {len(HTF_TF+LTF_TF)} tfs...")
    await seed_all(PAIRS)
    log.info("✅ Seeding complete")

    log.info("⏳ Bootstrapping HTF zones...")
    await bootstrap_htf(PAIRS)
    log.info("✅ Bootstrap complete — engine going live")

    stop = asyncio.Event()

    def _shutdown(s, f):
        log.info("Shutdown received")
        stop.set()

    _signal.signal(_signal.SIGINT,  _shutdown)
    _signal.signal(_signal.SIGTERM, _shutdown)

    batches  = [PAIRS[i:i+WS_BATCH_SIZE] for i in range(0, len(PAIRS), WS_BATCH_SIZE)]
    log.info(f"🚀 Starting {len(batches)} WS connection(s) — LIVE")

    clients  = [BinanceWSClient(pairs=b, timeframes=HTF_TF+LTF_TF) for b in batches]
    ws_tasks = [asyncio.create_task(c.start(on_kline)) for c in clients]
    hb_task  = asyncio.create_task(publisher.heartbeat(stop))
    st_task  = asyncio.create_task(stop.wait())

    done, pending = await asyncio.wait(
        ws_tasks + [hb_task, st_task],
        return_when=asyncio.FIRST_COMPLETED
    )

    for task in pending:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    for c in clients:
        c.stop()
    await publisher.close()
    log.info("Engine stopped.")


if __name__ == "__main__":
    asyncio.run(main())