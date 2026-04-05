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

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
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
MIN_RR           = float(os.getenv("MIN_RR", "2.0"))
SIGNAL_COOLDOWN  = int(os.getenv("SIGNAL_COOLDOWN_SEC", "300"))
MIN_LTF_CANDLES  = 50
MIN_HTF_CANDLES  = 100
WS_BATCH_SIZE    = 200
SEED_CONCURRENCY = 10

risk_manager    = RiskManager(min_rr=MIN_RR)
publisher       = RedisPublisher()
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
        ltf_state = ltf_analyzer.check_entry(candle, htf_zones)
        if not ltf_state:
            return

        result = score_signal(ltf_state)
        score      = result[0]
        confluences = result[1]
        entry_model = result[2] if len(result) > 2 else None

        if score is None:
            return

        now = time.time()
        if now - last_published.get(pair, 0) < SIGNAL_COOLDOWN:
            return

        htf_bias = htf_analyzer.get_bias(pair)
        sig = Signal.from_state(ltf_state, score, confluences, pair, tf, htf_bias, entry_model)
        sig = risk_manager.calculate_sl_tp(sig, htf_zones)

        if sig.risk_reward < MIN_RR:
            return

        await publisher.publish(sig)
        last_published[pair] = now
        log.info(f"📡 Signal fired: {pair} {sig.type} conf={score}% RR={sig.risk_reward}")

    except Exception as exc:
        log.error(f"Error in on_kline: {exc}", exc_info=True)


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

    await asyncio.gather(*[seed_one(p, tf) for p in pairs for tf in HTF_TF + LTF_TF], return_exceptions=True)


async def bootstrap_htf(pairs):
    count = 0
    for pair in pairs:
        for tf in HTF_TF:
            if candle_store.has_enough(pair, tf, minimum=MIN_HTF_CANDLES):
                candles = candle_store.get_closed(pair, tf, n=500)
                if candles:
                    htf_analyzer.process_closed_candle(candles[-1])
                    count += 1
    log.info(f"✅ HTF zones bootstrapped: {count} pair/tf combos")


async def main() -> None:
    log.info("═══════════════════════════════════════════════════")
    log.info(f"  SMC Signal Engine — {len(PAIRS)} pairs")
    log.info(f"  Backend: {os.getenv('BACKEND_URL', 'http://localhost:3001')}")
    log.info(f"  Min RR: {MIN_RR}  |  Cooldown: {SIGNAL_COOLDOWN}s")
    log.info("═══════════════════════════════════════════════════")

    await publisher.connect()

    log.info(f"⏳ Seeding {len(PAIRS)} pairs × {len(HTF_TF+LTF_TF)} tfs = {len(PAIRS)*len(HTF_TF+LTF_TF)} calls...")
    await seed_all(PAIRS)
    log.info("✅ Seeding complete")

    log.info("⏳ Bootstrapping HTF zones...")
    await bootstrap_htf(PAIRS)

    stop = asyncio.Event()

    def _shutdown(s, f):
        log.info("Shutdown received")
        stop.set()

    _signal.signal(_signal.SIGINT, _shutdown)
    _signal.signal(_signal.SIGTERM, _shutdown)

    batches = [PAIRS[i:i+WS_BATCH_SIZE] for i in range(0, len(PAIRS), WS_BATCH_SIZE)]
    log.info(f"🚀 Starting {len(batches)} WS connection(s) for {len(PAIRS)} pairs — LIVE")

    clients  = [BinanceWSClient(pairs=b, timeframes=HTF_TF+LTF_TF) for b in batches]
    ws_tasks = [asyncio.create_task(c.start(on_kline)) for c in clients]
    hb_task  = asyncio.create_task(publisher.heartbeat(stop))
    st_task  = asyncio.create_task(stop.wait())

    done, pending = await asyncio.wait(ws_tasks + [hb_task, st_task], return_when=asyncio.FIRST_COMPLETED)

    for task in pending:
        task.cancel()
        try: await task
        except asyncio.CancelledError: pass

    for c in clients: c.stop()
    await publisher.close()
    log.info("Engine stopped.")


if __name__ == "__main__":
    asyncio.run(main())
