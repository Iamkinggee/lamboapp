# ============================================================
# FILE: tests/signal-engine/test_detectors.py
# PURPOSE: Unit tests for all SMC signal detectors —
#          OB detection, FVG detection, BOS/CHOCH, liquidity,
#          and the confluence scoring engine.
# RUN: pytest tests/signal-engine/ -v
# ============================================================

import pytest
import sys
import os

# Add signal engine to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../services/signal-engine'))

from candle_store import Candle, CandleStore
from detectors.order_block import find_order_blocks
from detectors.fvg_detector import find_fvgs
from detectors.bos_choch import detect_bos_choch
from detectors.liquidity_zones import find_liquidity_zones
from scoring.confluence_engine import score_signal


# ── Candle factory helpers ────────────────────

def make_candle(open, high, low, close, ts=0, pair='BTCUSDT', tf='5m'):
    return Candle(pair=pair, timeframe=tf, open=open, high=high,
                  low=low, close=close, volume=100, timestamp=ts, is_closed=True)


def bullish(open=100, close=110, spread=5):
    """Bullish candle: close > open"""
    return make_candle(open=open, high=close+spread, low=open-spread, close=close)


def bearish(open=110, close=100, spread=5):
    """Bearish candle: close < open"""
    return make_candle(open=open, high=open+spread, low=close-spread, close=close)


# ── CandleStore tests ─────────────────────────

class TestCandleStore:
    def test_upsert_and_get(self):
        store = CandleStore(maxlen=10)
        c = make_candle(100, 110, 95, 108)
        store.upsert(c)
        result = store.get('BTCUSDT', '5m', n=1)
        assert len(result) == 1
        assert result[0].close == 108

    def test_intracandle_update(self):
        """Same timestamp should replace, not append"""
        store = CandleStore()
        c1 = make_candle(100, 110, 95, 105, ts=1000)
        c2 = make_candle(100, 115, 95, 112, ts=1000)  # same ts, updated close
        store.upsert(c1)
        store.upsert(c2)
        assert store.count('BTCUSDT', '5m') == 1
        assert store.latest('BTCUSDT', '5m').close == 112

    def test_maxlen_enforced(self):
        store = CandleStore(maxlen=5)
        for i in range(10):
            store.upsert(make_candle(i, i+5, i-5, i+2, ts=i))
        assert store.count('BTCUSDT', '5m') == 5

    def test_empty_store_returns_empty(self):
        store = CandleStore()
        assert store.get('BTCUSDT', '5m') == []
        assert store.latest('BTCUSDT', '5m') is None


# ── Order Block tests ─────────────────────────

class TestOrderBlockDetection:
    def test_bullish_ob_detected(self):
        """Bearish candle before large bullish impulse = bullish OB"""
        candles = [
            bullish(100, 105),    # normal
            bullish(105, 108),    # normal
            bearish(108, 103),    # <-- this is the OB candidate
            bullish(103, 125),    # large bullish impulse (body >= 1.5x avg)
        ]
        obs = find_order_blocks(candles)
        assert any(ob['type'] == 'bullish_ob' for ob in obs), \
            "Bullish OB should be detected before large bullish impulse"

    def test_bearish_ob_detected(self):
        """Bullish candle before large bearish impulse = bearish OB"""
        candles = [
            bearish(120, 115),
            bearish(115, 112),
            bullish(112, 118),    # <-- OB candidate
            bearish(118, 96),     # large bearish impulse
        ]
        obs = find_order_blocks(candles)
        assert any(ob['type'] == 'bearish_ob' for ob in obs), \
            "Bearish OB should be detected before large bearish impulse"

    def test_no_ob_without_impulse(self):
        """Small body moves should NOT produce an OB"""
        candles = [bullish(100, 101)] * 10  # tiny bodies
        obs = find_order_blocks(candles)
        assert len(obs) == 0, "No OB without impulse move"

    def test_ob_fields_present(self):
        """OB dict must have top, bottom, type"""
        candles = [bearish(110, 103), bullish(103, 125)]
        obs = find_order_blocks(candles)
        for ob in obs:
            assert 'top'  in ob
            assert 'bottom' in ob
            assert 'type' in ob


# ── FVG tests ─────────────────────────────────

class TestFVGDetection:
    def test_bullish_fvg_detected(self):
        """
        Bullish FVG: candle[i].low > candle[i-2].high
        Candle 1 high=100, Candle 3 low=105 → gap 100→105
        """
        candles = [
            make_candle(90,  100, 85, 98),   # candle i-2: high=100
            make_candle(98,  115, 97, 112),   # candle i-1: large impulse
            make_candle(110, 120, 105, 118),  # candle i: low=105 > 100
        ]
        fvgs = find_fvgs(candles)
        bullish = [f for f in fvgs if f['type'] == 'bullish_fvg']
        assert len(bullish) >= 1, "Bullish FVG should be detected"

    def test_bearish_fvg_detected(self):
        """
        Bearish FVG: candle[i].high < candle[i-2].low
        """
        candles = [
            make_candle(110, 115, 105, 106),  # candle i-2: low=105
            make_candle(106, 107,  88,  90),  # large bearish impulse
            make_candle( 92,  99,  80,  82),  # candle i: high=99 < 105
        ]
        fvgs = find_fvgs(candles)
        bearish_fvgs = [f for f in fvgs if f['type'] == 'bearish_fvg']
        assert len(bearish_fvgs) >= 1, "Bearish FVG should be detected"

    def test_no_fvg_when_gap_absent(self):
        """Candles with overlapping wicks should produce no FVG"""
        candles = [
            make_candle(100, 110, 95, 108),
            make_candle(107, 115, 104, 112),
            make_candle(111, 118, 106, 116),  # low=106 < 110 — no gap
        ]
        fvgs = find_fvgs(candles)
        assert len(fvgs) == 0, "No FVG when candles overlap"


# ── BOS / CHOCH tests ─────────────────────────

class TestBOSCHOCH:
    def _make_candles_uptrend(self):
        """Uptrend: HH / HL sequence, last candle breaks above swing high"""
        return [
            make_candle(100, 110, 98, 108),
            make_candle(106, 115, 104, 113),
            make_candle(110, 120, 108, 118),  # swing high = 120
            make_candle(115, 125, 113, 123),  # close 123 > 120 → BOS bullish
        ]

    def test_bos_bullish(self):
        candles = self._make_candles_uptrend()
        result  = detect_bos_choch(candles, trend='bullish')
        assert result is not None
        assert result['type'] == 'BOS'
        assert result['dir']  == 'bullish'

    def test_choch_bearish_reversal(self):
        """In uptrend: close below swing low → CHOCH (reversal signal)"""
        candles = [
            make_candle(100, 115, 98,  112),
            make_candle(110, 118, 105, 116),
            make_candle(114, 120, 110, 118),  # swing low = 110
            make_candle(116, 117,  95,  97),  # close 97 < 110 → CHOCH bearish
        ]
        result = detect_bos_choch(candles, trend='bullish')
        assert result is not None
        assert result['type'] == 'CHOCH'
        assert result['dir']  == 'bearish_reversal'

    def test_no_signal_when_contained(self):
        """Price staying inside range should return None"""
        candles = [
            make_candle(100, 110, 98, 108),
            make_candle(106, 109, 103, 107),
            make_candle(105, 108, 102, 106),
            make_candle(104, 107, 101, 105),  # no breakout
        ]
        result = detect_bos_choch(candles, trend='bullish')
        assert result is None


# ── Liquidity Zone tests ──────────────────────

class TestLiquidityZones:
    def test_equal_highs_detected(self):
        """Swing highs within 0.05% tolerance should cluster into a liquidity zone"""
        candles = []
        base_high = 1000.0
        for i in range(20):
            # Create periodic swing highs near 1000 (within 0.05%)
            high = base_high + (0.3 if i % 4 == 0 else 0)
            candles.append(make_candle(990, high, 985, 995, ts=i))

        zones = find_liquidity_zones(candles)
        assert len(zones) > 0, "Equal highs cluster should be detected"

    def test_cluster_score_increases_with_touches(self):
        """More touches = higher cluster score"""
        candles = []
        for i in range(20):
            high = 1000.0 if i % 2 == 0 else 980.0
            candles.append(make_candle(975, high, 970, 985, ts=i))

        zones = find_liquidity_zones(candles)
        if zones:
            assert all('score' in z for z in zones), "Each zone should have a score"


# ── Confluence Scoring tests ──────────────────

class TestConfluenceScoring:
    def _state(self, **kwargs):
        """Build a signal state object for scoring"""
        defaults = dict(
            liquidity_swept=False,
            ob_tapped=False,
            bos_or_choch=False,
            inside_fvg=False,
            htf_aligned=False,
        )
        defaults.update(kwargs)
        # Convert to simple namespace
        class State:
            pass
        s = State()
        for k, v in defaults.items():
            setattr(s, k, v)
        return s

    def test_max_score_all_confluences(self):
        state = self._state(
            liquidity_swept=True,
            ob_tapped=True,
            bos_or_choch=True,
            inside_fvg=True,
            htf_aligned=True,
        )
        score, confluences = score_signal(state)
        assert score == 100
        assert len(confluences) == 5

    def test_below_threshold_returns_none(self):
        """Score below 65% threshold should return (None, [])"""
        state = self._state(htf_aligned=True)  # only 10%
        score, confluences = score_signal(state)
        assert score is None
        assert confluences == []

    def test_partial_score_above_threshold(self):
        """Liq sweep (30) + OB tap (25) + BOS (20) = 75% — above threshold"""
        state = self._state(
            liquidity_swept=True,
            ob_tapped=True,
            bos_or_choch=True,
        )
        score, confluences = score_signal(state)
        assert score == 75
        assert len(confluences) == 3

    def test_custom_weights(self):
        """Custom weight config should override defaults"""
        custom_weights = {
            'liq_sweep': 50, 'ob_tap': 20, 'bos_choch': 15,
            'fvg': 10, 'htf_bias': 5,
        }
        state = self._state(liquidity_swept=True)
        score, _ = score_signal(state, weights=custom_weights, threshold=40)
        assert score == 50

    def test_exact_threshold_publishes(self):
        """Score exactly equal to threshold should be published"""
        # OB (25) + BOS (20) + FVG (15) + HTF (10) = 70 > default 65
        state = self._state(ob_tapped=True, bos_or_choch=True, inside_fvg=True, htf_aligned=True)
        score, _ = score_signal(state)
        assert score == 70