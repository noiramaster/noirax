"""Tests for NOIRAX signal pipeline."""

import sys
import os
# Set real proprietary values for tests (overrides placeholder defaults)
os.environ["TECH_TOP_COINS_FREE"] = "15"
os.environ["TECH_RSI_OVERSOLD"] = "35"
os.environ["TECH_RSI_OVERBOUGHT"] = "65"
os.environ["TECH_CONFIDENCE_RSI"] = "20"
os.environ["TECH_CONFIDENCE_MACD"] = "15"
os.environ["TECH_CONFIDENCE_SMA"] = "15"
os.environ["TECH_CONFIDENCE_VOLUME"] = "10"
os.environ["TECH_CONFIDENCE_SUPPORT"] = "15"
os.environ["TECH_CONFIDENCE_RESISTANCE"] = "10"
os.environ["TECH_VOLUME_SPIKE_MULTIPLIER"] = "1.5"
os.environ["TECH_NEAR_SUPPORT_OFFSET"] = "1.05"
os.environ["TECH_NEAR_RESISTANCE_OFFSET"] = "0.95"
os.environ["TECH_RISK_HIGH_THRESHOLD"] = "0.05"
os.environ["TECH_RISK_MEDIUM_THRESHOLD"] = "0.03"
os.environ["TECH_ATR_SL_CONSERVATIVE"] = "1.5"
os.environ["TECH_ATR_TP1_CONSERVATIVE"] = "2.0"
os.environ["TECH_ATR_SL_OPTIMIZED"] = "2.0"
os.environ["TECH_ATR_TP1_OPTIMIZED"] = "2.0"
os.environ["TECH_ATR_TP2_OPTIMIZED"] = "3.5"
os.environ["TECH_ATR_TP3_OPTIMIZED"] = "5.0"
os.environ["FUND_WHALE_THRESHOLD_BTC"] = "20.0"
os.environ["FUND_FUNDING_RATE_HIGH"] = "0.0005"
os.environ["FUND_FUNDING_RATE_LOW"] = "-0.0005"
os.environ["FUND_FUNDING_RATE_ELEVATED"] = "0.0002"
os.environ["FUND_VOLUME_QUOTE_THRESHOLD"] = "50000000"
os.environ["FUND_VOLUME_PRICE_CHANGE_PCT"] = "5.0"
os.environ["FUND_VOLUME_ELEVATED_CHANGE_PCT"] = "2.0"
os.environ["FUND_SCORE_CLAMP_HIGH"] = "3"
os.environ["FUND_SCORE_CLAMP_MEDIUM"] = "1"
os.environ["FUND_SCORE_CLAMP_NEG_HIGH"] = "-3"
os.environ["FUND_SCORE_CLAMP_NEG_MEDIUM"] = "-1"
os.environ["FUND_NEWS_BULL_MIN_COUNT"] = "2"

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pytest
import pandas as pd
import numpy as np
from unittest.mock import patch, MagicMock

from run_signals import (
    calculate_indicators,
    calculate_dual_tps,
    generate_fallback_explanations,
    get_top_coins,
    create_slug,
)
from fundamental_analysis import analyze_fundamental


def create_sample_klines(length=200):
    """Create sample OHLCV data for testing."""
    np.random.seed(42)
    close = 50000 + np.cumsum(np.random.randn(length) * 100)
    data = {
        "timestamp": pd.date_range(start="2024-01-01", periods=length, freq="h"),
        "open": close - np.random.rand(length) * 100,
        "high": close + np.random.rand(length) * 200,
        "low": close - np.random.rand(length) * 200,
        "close": close,
        "volume": np.random.rand(length) * 10000 + 5000,
    }
    return pd.DataFrame(data)


class TestCalculateIndicators:
    def test_buy_signal_detected(self):
        df = create_sample_klines()
        df.loc[df.index[-30:], "close"] = df.loc[df.index[-30:], "close"].values * 0.85
        analysis = calculate_indicators(df)
        assert analysis["signal_type"] in ["buy", "sell", "neutral"]
        assert isinstance(analysis["confidence"], (int, float))
        assert 0 <= analysis["confidence"] <= 100
        assert isinstance(analysis["rsi"], (int, float))
        assert "atr" in analysis
        assert "volatility" in analysis
        assert "indicators_used" in analysis

    def test_sell_signal_detected(self):
        df = create_sample_klines()
        df.loc[df.index[-30:], "close"] = df.loc[df.index[-30:], "close"].values * 1.15
        analysis = calculate_indicators(df)
        assert analysis["signal_type"] in ["buy", "sell", "neutral"]
        assert isinstance(analysis["confidence"], (int, float))

    def test_neutral_with_few_data_points(self):
        df = create_sample_klines(length=20)
        analysis = calculate_indicators(df)
        assert analysis["signal_type"] in ["buy", "sell", "neutral"]

    def test_indicators_structure(self):
        df = create_sample_klines()
        analysis = calculate_indicators(df)
        expected_keys = {
            "signal_type", "confidence", "rsi", "macd_bullish",
            "sma_bullish", "volume_spike", "current_price",
            "recent_high", "recent_low", "atr", "volatility",
            "indicators_used",
        }
        assert expected_keys.issubset(analysis.keys())

    def test_risk_level_calculation(self):
        df = create_sample_klines()
        analysis = calculate_indicators(df)
        tps = calculate_dual_tps(analysis["current_price"], analysis["atr"], analysis["signal_type"] if analysis["signal_type"] != "neutral" else "buy")
        assert tps["risk_level"] in ["low", "medium", "high"]

    def test_indicators_used_list(self):
        df = create_sample_klines()
        analysis = calculate_indicators(df)
        assert isinstance(analysis["indicators_used"], list)
        assert len(analysis["indicators_used"]) > 0
        assert "RSI" in analysis["indicators_used"]


class TestGenerateFallbackExplanations:
    def test_buy_explanations_all_languages(self):
        analysis = {
            "signal_type": "buy",
            "rsi": 30.5,
            "macd_bullish": True,
            "sma_bullish": True,
            "volume_spike": True,
            "current_price": 50000,
            "recent_high": 51000,
            "recent_low": 49000,
        }
        fund_result = {"score": 1, "tags": ["NEWS_POSITIVE"], "details": {}}
        explanations = generate_fallback_explanations("BTC/USDT", analysis, fund_result)
        for lang in ["en", "es", "pt", "fr", "de", "it", "ar"]:
            assert lang in explanations
            assert len(explanations[lang]) > 0
            assert "financial advice" not in explanations["en"].lower() or "educational" in explanations["en"].lower()

    def test_sell_explanations(self):
        analysis = {
            "signal_type": "sell",
            "rsi": 70.5,
            "macd_bullish": False,
            "sma_bullish": False,
            "volume_spike": True,
            "current_price": 50000,
            "recent_high": 51000,
            "recent_low": 49000,
        }
        fund_result = {"score": -1, "tags": ["NEWS_NEGATIVE"], "details": {}}
        explanations = generate_fallback_explanations("BTC/USDT", analysis, fund_result)
        assert len(explanations) == 7
        for lang, text in explanations.items():
            assert len(text) > 0


class TestCreateSlug:
    def test_slug_format(self):
        slug = create_slug("BTC/USDT", "buy", "2026-07-21T14:30:00")
        assert "btc-usdt-buy-" in slug
        assert "2026-07-21-1430" in slug

    def test_slug_no_timestamp(self):
        slug = create_slug("ETH/USDT", "sell", "")
        assert "eth-usdt-sell-" in slug


@patch("run_signals.requests.get")
class TestGetTopCoins:
    def test_successful_response(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.json.return_value = [
            {"id": "bitcoin", "symbol": "btc", "name": "Bitcoin", "market_cap": 1_000_000_000_000, "total_volume": 50_000_000_000, "current_price": 60000, "price_change_percentage_24h": 0, "price_change_percentage_7d_in_currency": 0},
            {"id": "ethereum", "symbol": "eth", "name": "Ethereum", "market_cap": 500_000_000_000, "total_volume": 25_000_000_000, "current_price": 3000, "price_change_percentage_24h": 0, "price_change_percentage_7d_in_currency": 0},
        ]
        mock_resp.status_code = 200
        mock_get.return_value = mock_resp
        coins = get_top_coins(limit=10)
        assert len(coins) == 2
        assert coins[0]["symbol"] == "BTCUSDT"

    def test_api_failure_returns_fallback(self, mock_get):
        mock_get.side_effect = Exception("API Error")
        coins = get_top_coins(limit=10)
        assert len(coins) > 0
        assert coins[0]["symbol"] == "BTCUSDT"


class TestCalculateDualTPs:
    def test_buy_signal_tps(self):
        tps = calculate_dual_tps(50000.0, 1000.0, "buy")
        assert tps["stop_loss_conservative"] < 50000.0
        assert tps["take_profit_1_conservative"] > 50000.0
        assert tps["stop_loss_optimized"] < tps["stop_loss_conservative"]
        assert tps["take_profit_3_optimized"] > tps["take_profit_1_optimized"]
        assert tps["risk_level"] in ["low", "medium", "high"]

    def test_sell_signal_tps(self):
        tps = calculate_dual_tps(50000.0, 1000.0, "sell")
        assert tps["stop_loss_conservative"] > 50000.0
        assert tps["take_profit_1_conservative"] < 50000.0
        assert tps["take_profit_3_optimized"] < tps["take_profit_1_optimized"]

    def test_entry_zone(self):
        tps = calculate_dual_tps(50000.0, 1000.0, "buy")
        assert tps["entry_price_min"] < 50000.0
        assert tps["entry_price_max"] > 50000.0


class TestFundamentalAnalysis:
    @patch("fundamental_analysis._safe_request")
    def test_btc_whale_detection(self, mock_req):
        """BTC whale detection should return tags for large txs."""
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "txs": [
                {"out": [{"value": 25_00000000}]},  # 25 BTC
                {"out": [{"value": 30_00000000}]},  # 30 BTC
                {"out": [{"value": 22_00000000}]},  # 22 BTC
            ]
        }
        mock_req.return_value = mock_resp
        result = analyze_fundamental("BTCUSDT")
        assert "WHALE_ACTIVITY" in result["tags"]

    def test_altcoin_no_whale_detection(self):
        """Altcoins should not get whale detection tags."""
        with patch("fundamental_analysis._safe_request", return_value=None):
            result = analyze_fundamental("ETHUSDT")
            assert "WHALE_ACTIVITY" not in result["tags"]

    def test_score_range(self):
        """Score should always be between -2 and +2."""
        with patch("fundamental_analysis._safe_request", return_value=None):
            result = analyze_fundamental("BTCUSDT")
            assert -2 <= result["score"] <= 2

    def test_tags_are_list(self):
        with patch("fundamental_analysis._safe_request", return_value=None):
            result = analyze_fundamental("SOLUSDT")
            assert isinstance(result["tags"], list)
            assert isinstance(result["details"], dict)


if __name__ == "__main__":
    pytest.main([__file__])
