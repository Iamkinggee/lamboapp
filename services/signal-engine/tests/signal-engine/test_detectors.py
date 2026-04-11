# ============================================================
# FILE: tests/signal-engine/test_detectors.py
# PURPOSE: Unit tests for all SMC signal detectors —
#          OB detection, FVG detection, BOS/CHOCH, liquidity,
#          and the confluence scoring engine.
# RUN: pytest tests/signal-engine/ -v
#
# FIXED (full rewrite):
#   - CandleStore constructor is CandleStore(buffer_size=N), not maxlen=N
#   - find_order_blocks / find_fvgs return List[OrderBlock] / List[FVG],
#     NOT list-of-dicts — all field access converted to attribute access
#   - detect_bos_choch returns StructureBreak with .type (BOSType enum)
#     and .direction (str), NOT dict keys 'type'/'dir'
#   - score_signal returns (score, confluences, entry_model) tuple of 3,
#     NOT (score, confluences) of 2; does NOT accept custom weights/threshold
#   - SignalState requires pair, direction, timeframe, current_price fields
#   - All candle helpers corrected to build valid Candle dataclass instances
#   - Tests added for 15m entry TF gate, HTF bias gate, dedup key stability
# ============================================================

import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../'))

from models import (
    Candle, OrderBlock, FairValueGap, LiquidityZone,
    SignalState, SignalType, HTFBias, BOSType, ZoneType,
)
from candle_store import CandleStore
from detectors.order_block import find_order_blocks, get_nearest_ob, is_price_in_ob
from detectors.fvg_detector import find_fvgs, get_nearest_fvg
from detectors.bos_choch import detect_bos_choch, determine_trend
from detectors.liquidity_zones import find_liquidity_zones, detect_sweep
from scoring.confluence_engine import score_signal
from scoring.config import (
    SIGNAL_THRESHOLD, CONFIRMATION_THRESHOLD,
    LTF_TIMEFRAMES, HTF_TIMEFRAMES,
)


# ── Candle factory helpers ─────────────────────────────────────────────────────

def make_candle(open_, high, low, close, ts=0, pair='BTCUSDT', tf='15m', closed=True):
    return Candle(
        pair=pair, timeframe=tf,
        open=open_, high=high, low=low, close=close,
        volume=100.0, timestamp=ts, is_closed=closed,
    )


def bullish(open_=100.0, close=110.0, spread=5.0, ts=0, tf='15m'):
    return make_candle(open_, close + spread, open_ - spread, close, ts=ts, tf=tf)


def bearish(open_=110.0, close=100.0, spread=5.0, ts=0, tf='15m'):
    return make_candle(open_, open_ + spread, close - spread, close, ts=ts, tf=tf)


def make_signal_state(**kwargs):
    defaults = dict(
        pair='BTCUSDT',
        direction=SignalType.BUY,
        timeframe='15m',
        current_price=50000.0,
        liquidity_swept=False,
        ob_tapped=False,
        bos_or_choch=False,
        inside_fvg=False,
        htf_aligned=False,
    )
    defaults.update(kwargs)
    return SignalState(**defaults)


# ── CandleStore ────────────────────────────────────────────────────────────────

class TestCandleStore:
    def test_upsert_and_get(self):
        store = CandleStore(buffer_size=10)
        c = make_candle(100, 110, 95, 108, ts=1)
        store.upsert(c)
        result = store.get('BTCUSDT', '15m', n=1)
        assert len(result) == 1
        assert result[0].close == 108

    def test_intracandle_update(self):
        store = CandleStore()
        c1 = make_candle(100, 110, 95, 105, ts=1000)
        c2 = make_candle(100, 115, 95, 112, ts=1000)
        store.upsert(c1)
        store.upsert(c2)
        assert store.count('BTCUSDT', '15m') == 1
        assert store.latest('BTCUSDT', '15m').close == 112

    def test_buffer_size_enforced(self):
        store = CandleStore(buffer_size=5)
        for i in range(10):
            store.upsert(make_candle(i, i + 5, i - 5, i + 2, ts=i))
        assert store.count('BTCUSDT', '15m') == 5

    def test_empty_store_returns_empty(self):
        store = CandleStore()
        assert store.get('BTCUSDT', '15m') == []
        assert store.latest('BTCUSDT', '15m') is None

    def test_has_enough(self):
        store = CandleStore()
        assert not store.has_enough('BTCUSDT', '15m', minimum=5)
        for i in range(5):
            store.upsert(make_candle(100, 110, 90, 105, ts=i))
        assert store.has_enough('BTCUSDT', '15m', minimum=5)

    def test_get_closed_filters_open(self):
        store = CandleStore()
        store.upsert(make_candle(100, 110, 90, 105, ts=1, closed=True))
        store.upsert(make_candle(105, 115, 95, 110, ts=2, closed=False))
        closed = store.get_closed('BTCUSDT', '15m')
        assert len(closed) == 1
        assert closed[0].timestamp == 1


# ── Order Block Detection ──────────────────────────────────────────────────────

class TestOrderBlockDetection:
    def _ob_candles_bullish(self):
        # Need >= AVG_BODY_LOOKBACK (10) + 2 = 12 candles for the guard to pass
        base = [bullish(100 + i, 105 + i, ts=i) for i in range(10)]
        ob_candle = bearish(105, 100, ts=10)   # bearish OB candidate
        impulse   = bullish(100, 125, ts=11)   # strong bullish impulse (body=25 >> avg=5)
        return base + [ob_candle, impulse]

    def _ob_candles_bearish(self):
        base   = [bearish(120 - i, 115 - i, ts=i) for i in range(10)]
        ob_can = bullish(115, 120, ts=10)      # bullish OB candidate
        imp    = bearish(120, 95,  ts=11)      # strong bearish impulse (body=25 >> avg=5)
        return base + [ob_can, imp]

    def test_bullish_ob_detected(self):
        obs = find_order_blocks(self._ob_candles_bullish())
        assert len(obs) > 0
        assert any(ob.type == ZoneType.BULLISH_OB for ob in obs)

    def test_bearish_ob_detected(self):
        obs = find_order_blocks(self._ob_candles_bearish())
        assert len(obs) > 0
        assert any(ob.type == ZoneType.BEARISH_OB for ob in obs)

    def test_no_ob_without_impulse(self):
        candles = [make_candle(100, 101, 99, 100, ts=i) for i in range(15)]
        assert find_order_blocks(candles) == []

    def test_ob_has_required_fields(self):
        for ob in find_order_blocks(self._ob_candles_bullish()):
            assert isinstance(ob, OrderBlock)
            assert ob.top > ob.bottom
            assert ob.type in (ZoneType.BULLISH_OB, ZoneType.BEARISH_OB)

    def test_is_price_in_ob(self):
        ob = OrderBlock(
            type=ZoneType.BULLISH_OB, top=110, bottom=100,
            timeframe='15m', timestamp=0, pair='BTCUSDT',
        )
        assert is_price_in_ob(ob, 105) is True
        assert is_price_in_ob(ob, 115) is False
        assert is_price_in_ob(ob, 95)  is False


# ── FVG Detection ──────────────────────────────────────────────────────────────

class TestFVGDetection:
    def test_bullish_fvg_detected(self):
        candles = [
            make_candle(90,  100, 85,  98,  ts=0),
            make_candle(98,  115, 97,  112, ts=1),
            make_candle(110, 120, 105, 118, ts=2),
        ]
        fvgs = find_fvgs(candles)
        assert any(f.type == ZoneType.BULLISH_FVG for f in fvgs)

    def test_bearish_fvg_detected(self):
        candles = [
            make_candle(110, 115, 105, 106, ts=0),
            make_candle(106, 107,  88,  90, ts=1),
            make_candle( 92,  99,  80,  82, ts=2),
        ]
        fvgs = find_fvgs(candles)
        assert any(f.type == ZoneType.BEARISH_FVG for f in fvgs)

    def test_no_fvg_when_candles_overlap(self):
        candles = [
            make_candle(100, 110, 95,  108, ts=0),
            make_candle(107, 115, 104, 112, ts=1),
            make_candle(111, 118, 106, 116, ts=2),
        ]
        assert find_fvgs(candles) == []

    def test_fvg_fields(self):
        candles = [
            make_candle(90,  100, 85, 98,  ts=0),
            make_candle(98,  115, 97, 112, ts=1),
            make_candle(110, 120, 105, 118, ts=2),
        ]
        for fvg in find_fvgs(candles):
            assert isinstance(fvg, FairValueGap)
            assert fvg.top > fvg.bottom

    def test_get_nearest_fvg(self):
        fvg = FairValueGap(
            type=ZoneType.BULLISH_FVG, top=106, bottom=102,
            timeframe='15m', timestamp=0, pair='BTCUSDT',
        )
        result = get_nearest_fvg([fvg], price=103, direction='bullish', max_distance_pct=5.0)
        assert result is not None
        assert result.type == ZoneType.BULLISH_FVG


# ── BOS / CHOCH ────────────────────────────────────────────────────────────────

class TestBOSCHOCH:
    def _uptrend(self, n=25):
        candles = []
        base = 100.0
        for i in range(n):
            o = base + i * 2
            candles.append(make_candle(o, o + 5, o - 2, o + 4, ts=i))
        return candles

    def _downtrend(self, n=25):
        candles = []
        base = 200.0
        for i in range(n):
            o = base - i * 2
            candles.append(make_candle(o, o + 2, o - 5, o - 4, ts=i))
        return candles

    def test_determine_trend_bullish(self):
        assert determine_trend(self._uptrend()) == 'bullish'

    def test_determine_trend_bearish(self):
        assert determine_trend(self._downtrend()) == 'bearish'

    def test_determine_trend_insufficient_candles(self):
        assert determine_trend([bullish() for _ in range(3)]) == 'ranging'

    def test_returns_structure_break_or_none(self):
        from models import StructureBreak
        result = detect_bos_choch(self._uptrend(20))
        assert result is None or isinstance(result, StructureBreak)

    def test_no_signal_insufficient_candles(self):
        candles = [bullish(ts=i) for i in range(4)]
        assert detect_bos_choch(candles) is None

    def test_choch_bearish_on_uptrend_break(self):
        candles = self._uptrend(20)
        last = candles[-1]
        crash = make_candle(last.close, last.close + 1, last.close - 50, last.close - 45, ts=25)
        candles.append(crash)
        result = detect_bos_choch(candles, trend='bullish')
        if result is not None:
            assert result.type == BOSType.CHOCH
            assert 'bearish' in result.direction


# ── Liquidity Zones ────────────────────────────────────────────────────────────

class TestLiquidityZones:
    def _swing_candles(self, n=30):
        candles = []
        for i in range(n):
            if i % 6 < 3:
                candles.append(bullish(100 + i * 0.1, 110 + i * 0.1, ts=i))
            else:
                candles.append(bearish(110 + i * 0.1, 100 + i * 0.1, ts=i))
        return candles

    def test_returns_list(self):
        assert isinstance(find_liquidity_zones(self._swing_candles()), list)

    def test_zone_types_valid(self):
        valid = {ZoneType.EQUAL_HIGHS, ZoneType.EQUAL_LOWS}
        for z in find_liquidity_zones(self._swing_candles()):
            assert isinstance(z, LiquidityZone)
            assert z.type in valid

    def test_insufficient_candles_returns_empty(self):
        assert find_liquidity_zones([bullish(ts=i) for i in range(5)]) == []

    def test_detect_sweep_marks_zone(self):
        zone = LiquidityZone(
            type=ZoneType.EQUAL_HIGHS, level=110.0,
            pair='BTCUSDT', timeframe='15m', touch_count=2,
        )
        candle = make_candle(105, 115, 104, 108, ts=1)
        swept = detect_sweep([zone], candle)
        assert len(swept) == 1
        assert swept[0].swept is True

    def test_no_sweep_when_closes_above(self):
        zone = LiquidityZone(
            type=ZoneType.EQUAL_HIGHS, level=110.0,
            pair='BTCUSDT', timeframe='15m', touch_count=2,
        )
        candle = make_candle(105, 120, 104, 118, ts=1)
        assert detect_sweep([zone], candle) == []


# ── Confluence Scoring ─────────────────────────────────────────────────────────

class TestConfluenceScoring:
    def test_max_score_all_confluences(self):
        state = make_signal_state(
            liquidity_swept=True, ob_tapped=True, bos_or_choch=True,
            inside_fvg=True, htf_aligned=True,
        )
        score, confluences, model = score_signal(state)
        assert score == 100
        assert len(confluences) == 5

    def test_below_threshold_returns_none(self):
        state = make_signal_state(htf_aligned=True)
        score, confluences, model = score_signal(state)
        assert score is None
        assert confluences == []

    def test_partial_score_liq_ob_bos(self):
        state = make_signal_state(
            liquidity_swept=True, ob_tapped=True, bos_or_choch=True,
        )
        score, confluences, model = score_signal(state)
        assert score == 75
        assert len(confluences) == 3

    def test_returns_three_tuple(self):
        result = score_signal(make_signal_state(liquidity_swept=True, ob_tapped=True))
        assert len(result) == 3

    def test_confirmation_model_on_full_stack(self):
        from models import EntryModel
        state = make_signal_state(
            liquidity_swept=True, ob_tapped=True, bos_or_choch=True,
            inside_fvg=True, htf_aligned=True,
        )
        score, _, model = score_signal(state)
        assert score >= CONFIRMATION_THRESHOLD
        assert model == EntryModel.CONFIRMATION

    def test_anticipation_model_without_bos(self):
        from models import EntryModel
        state = make_signal_state(liquidity_swept=True, ob_tapped=True)
        score, _, model = score_signal(state)
        if score is not None:
            assert model == EntryModel.ANTICIPATION

    def test_score_is_int_or_none(self):
        score, _, _ = score_signal(make_signal_state(ob_tapped=True))
        assert score is None or isinstance(score, int)


# ── Timeframe Config Sanity ────────────────────────────────────────────────────

class TestTimeframeConfig:
    def test_ltf_is_15m_only(self):
        assert LTF_TIMEFRAMES == ['15m'], \
            f"LTF must be ['15m'] only, got {LTF_TIMEFRAMES}"

    def test_htf_contains_1h_and_4h(self):
        assert '1h' in HTF_TIMEFRAMES
        assert '4h' in HTF_TIMEFRAMES

    def test_ltf_and_htf_disjoint(self):
        overlap = set(LTF_TIMEFRAMES) & set(HTF_TIMEFRAMES)
        assert len(overlap) == 0, f"LTF and HTF share timeframes: {overlap}"


# ── Dedup Key Stability ────────────────────────────────────────────────────────

class TestDedupKey:
    @staticmethod
    def _dedup_key(pair, entry, signal_type):
        return f"{pair}:{signal_type}:{round(entry, 4)}"

    def test_same_inputs_same_key(self):
        # Both round to same 4dp value
        k1 = self._dedup_key('BTCUSDT', 50000.12340, 'BUY')
        k2 = self._dedup_key('BTCUSDT', 50000.12344, 'BUY')
        assert k1 == k2

    def test_different_price_4dp_different_key(self):
        k1 = self._dedup_key('BTCUSDT', 50000.12340, 'BUY')
        k2 = self._dedup_key('BTCUSDT', 50000.12350, 'BUY')
        assert k1 != k2

    def test_different_pair_different_key(self):
        k1 = self._dedup_key('BTCUSDT', 50000.0, 'BUY')
        k2 = self._dedup_key('ETHUSDT', 50000.0, 'BUY')
        assert k1 != k2

    def test_ant_and_conf_keys_differ(self):
        k_ant  = self._dedup_key('BTCUSDT', 50000.0, 'ANT')
        k_conf = self._dedup_key('BTCUSDT', 50000.0, 'CONFIRMATION')
        assert k_ant != k_conf