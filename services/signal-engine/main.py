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
from models import Signal, EntryModel, HTFBias
from scoring.config import (
    ENGINE_SIGNAL_COOLDOWN_SEC,
    ANTICIPATION_THRESHOLD,
    CONFIRMATION_THRESHOLD,
)

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
LTF_TF           = ["3m", "5m"]   # 3m added for tighter entries

MIN_RR           = float(os.getenv("MIN_RR", "2.0"))   # Minimum RR to publish (TP2-based)
SIGNAL_COOLDOWN  = int(os.getenv("SIGNAL_COOLDOWN_SEC", str(ENGINE_SIGNAL_COOLDOWN_SEC)))

MIN_LTF_CANDLES  = 20
MIN_HTF_CANDLES  = 100
WS_BATCH_SIZE    = 200
SEED_CONCURRENCY = 10

risk_manager    = RiskManager(min_rr=MIN_RR)
publisher       = RedisPublisher()

# Two-tier cooldown tracking:
#   last_published[pair]      → last CONFIRMATORY signal
#   last_anticipatory[pair]   → last ANTICIPATORY (early warning) signal
last_published:    dict[str, float] = {}
last_anticipatory: dict[str, float] = {}

# Dedup: track (pair, entry_model, round(entry, 4)) to prevent exact duplicates
# within a short window even if cooldown hasn't expired
_recent_sigs: dict[str, float] = {}
DEDUP_WINDOW = 30.0   # seconds — ignore identical (pair+entry) within 30s


def _dedup_key(pair: str, entry: float, model: str) -> str:
    return f"{pair}:{model}:{round(entry, 4)}"


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
        now       = time.time()

        # ── ANTICIPATORY SIGNAL (early warning before BOS) ───────────────────
        # Fires when: HTF OB touched + liq swept, BOS NOT yet confirmed.
        # Cooldown: half the normal cooldown so traders get early alerts.
        anticipatory_cooldown = SIGNAL_COOLDOWN // 2
        if now - last_anticipatory.get(pair, 0) >= anticipatory_cooldown:
            ant_state = ltf_analyzer.check_anticipatory(candle, htf_zones)
            if ant_state is not None:
                result = score_signal(ant_state)
                score, confluences, _ = result[0], result[1], result[2] if len(result) > 2 else None
                if score is not None and score >= ANTICIPATION_THRESHOLD:
                    htf_bias = htf_analyzer.get_bias(pair)
                    sig = Signal.from_state(ant_state, score, confluences, pair, tf, htf_bias, EntryModel.ANTICIPATION)
                    sig.is_anticipatory = True
                    sig.pre_signal_note = (
                        f"⚠️ EARLY ALERT: {pair} approaching HTF {'OB' if ant_state.ob_tapped else 'FVG'} "
                        f"zone. Awaiting BOS/CHOCH confirmation on {tf}. "
                        f"HTF bias: {htf_bias.value if hasattr(htf_bias, 'value') else htf_bias}. "
                        f"{'Liq swept — high probability reversal zone.' if ant_state.liquidity_swept else 'Watch for liquidity sweep.'}"
                    )
                    sig = risk_manager.calculate_sl_tp(sig, htf_zones)
                    # Only publish if TP1 RR is already decent
                    if sig.rr_1 >= 1.8:
                        dk = _dedup_key(pair, sig.entry, "ANT")
                        if now - _recent_sigs.get(dk, 0) >= DEDUP_WINDOW:
                            await publisher.publish(sig)
                            last_anticipatory[pair] = now
                            _recent_sigs[dk] = now
                            log.info(f"📡 ANTICIPATORY: {pair} {sig.type} conf={score}% TP1=1:{sig.rr_1} TP2=1:{sig.rr_2} TP3=1:{sig.rr_3}")

        # ── CONFIRMATORY SIGNAL (BOS/CHOCH confirmed entry) ──────────────────
        if now - last_published.get(pair, 0) < SIGNAL_COOLDOWN:
            log.debug(f"[{pair}] Cooldown active — skipping confirmatory")
            return

        ltf_state = ltf_analyzer.check_entry(candle, htf_zones)
        if not ltf_state:
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
            return

        htf_bias = htf_analyzer.get_bias(pair)
        sig = Signal.from_state(ltf_state, score, confluences, pair, tf, htf_bias, entry_model)
        sig = risk_manager.calculate_sl_tp(sig, htf_zones)

        # Require minimum RR2 (main target) for confirmatory signals
        if sig.rr_2 < MIN_RR:
            log.debug(f"[{pair}] Rejected — RR2 {sig.rr_2:.2f} < {MIN_RR}")
            return

        # Dedup check
        model_str = entry_model.value if hasattr(entry_model, "value") else str(entry_model)
        dk = _dedup_key(pair, sig.entry, model_str)
        if now - _recent_sigs.get(dk, 0) < DEDUP_WINDOW:
            log.debug(f"[{pair}] Dedup — identical signal within {DEDUP_WINDOW}s")
            return

        await publisher.publish(sig)
        last_published[pair] = now
        _recent_sigs[dk] = now
        ltf_analyzer.mark_signal(pair)

        log.info(
            f"📡 CONFIRMED: {pair} {sig.type} conf={score}% "
            f"TP1=1:{sig.rr_1} TP2=1:{sig.rr_2} TP3=1:{sig.rr_3}"
        )

    except AttributeError as exc:
        log.critical(f"[on_kline] AttributeError: {exc}", exc_info=True)
    except Exception as exc:
        log.error(f"[on_kline] Error for {candle.pair}/{candle.timeframe}: {exc}", exc_info=True)


async def seed_all(pairs):
    sem = asyncio.Semaphore(SEED_CONCURRENCY)
    completed = 0
    total = len(pairs) * len(HTF_TF + LTF_TF)

    async def seed_one(pair, tf):
        nonlocal completed
        depth = {"4h": 500, "1h": 500, "5m": 300, "3m": 200, "1m": 200}.get(tf, 200)
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
    count = 0
    for pair in pairs:
        for tf in HTF_TF:
            if not candle_store.has_enough(pair, tf, minimum=MIN_HTF_CANDLES):
                continue
            candles = candle_store.get_closed(pair, tf, n=500)
            if not candles:
                continue
            for candle in candles:
                htf_analyzer.process_closed_candle(candle)
            count += 1

    log.info(f"✅ HTF zones bootstrapped: {count} pair/tf combos")


async def main() -> None:
    log.info("═══════════════════════════════════════════════════")
    log.info(f"  SMC Signal Engine — {len(PAIRS)} pairs")
    log.info(f"  LTF: {LTF_TF}  HTF: {HTF_TF}")
    log.info(f"  Backend: {os.getenv('BACKEND_URL', 'http://localhost:8001')}")
    log.info(f"  Min RR (TP2): {MIN_RR}  |  Cooldown: {SIGNAL_COOLDOWN}s")
    log.info(f"  TP Ladder: 1:2.0 / 1:3.5 / 1:5.5+")
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