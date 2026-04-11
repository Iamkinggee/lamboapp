# FILE: services/signal-engine/main.py
# FIX: seed_historical now lives in ws_client.py
# FIX: Removed duplicate candle_store imports
# FIX: Uses module-level singletons correctly

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

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("engine.main")

PAIRS           = os.getenv("TRADING_PAIRS", "BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT").split(",")
HTF_TF          = ["1h", "4h"]
LTF_TF          = ["15m"]
MIN_RR          = float(os.getenv("MIN_RR", "2.0"))
SIGNAL_COOLDOWN = int(os.getenv("SIGNAL_COOLDOWN_SEC", "60"))
MIN_CANDLES     = int(os.getenv("MIN_CANDLES", "20"))

risk_manager = RiskManager(min_rr=MIN_RR)
publisher    = RedisPublisher()
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

        if not candle_store.has_enough(pair, tf, minimum=MIN_CANDLES):
            return

        htf_zones = htf_analyzer.get_active_zones(pair)
        if not htf_zones.get("obs") and not htf_zones.get("liq"):
            return

        ltf_state = ltf_analyzer.check_entry(candle, htf_zones)
        if not ltf_state:
            return

        score, confluences, entry_model = score_signal(ltf_state)
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

    except Exception as exc:
        log.error(f"Error in on_kline: {exc}", exc_info=True)


async def main() -> None:
    log.info("SMC Signal Engine starting")
    log.info(f"Pairs: {', '.join(PAIRS)}")

    await publisher.connect()

    log.info("Seeding historical candles...")
    for pair in PAIRS:
        for tf in HTF_TF + LTF_TF:
            await seed_historical(candle_store, pair, tf, limit=200)
    log.info("Historical candles seeded")

    for pair in PAIRS:
        for tf in HTF_TF:
            if candle_store.has_enough(pair, tf, minimum=MIN_CANDLES):
                candles = candle_store.get_closed(pair, tf, n=1)
                if candles:
                    htf_analyzer.process_closed_candle(candles[-1])

    stop = asyncio.Event()

    def _shutdown(signum, frame):
        log.info("Shutdown signal received")
        stop.set()

    _signal.signal(_signal.SIGINT,  _shutdown)
    _signal.signal(_signal.SIGTERM, _shutdown)

    client = BinanceWSClient(pairs=PAIRS, timeframes=HTF_TF + LTF_TF)

    ws_task        = asyncio.create_task(client.start(on_kline))
    heartbeat_task = asyncio.create_task(publisher.heartbeat(stop))
    stop_task      = asyncio.create_task(stop.wait())

    done, pending = await asyncio.wait(
        [ws_task, heartbeat_task, stop_task],
        return_when=asyncio.FIRST_COMPLETED,
    )

    for task in pending:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    client.stop()
    await publisher.close()
    log.info("Engine stopped cleanly.")


if __name__ == "__main__":
    asyncio.run(main())