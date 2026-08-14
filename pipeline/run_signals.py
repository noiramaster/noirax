#!/usr/bin/env python3
"""
NOIRAX Signal Pipeline v3
Technical + Fundamental analysis, single Gemini call per run,
7-language explanations, dual TP/SL (conservative for free, optimized for premium).
"""

import os
import re
import sys
import json
import time
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import requests
import pandas as pd
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fundamental_analysis import analyze_fundamental

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("noirax-pipeline")

# --- Configuration ---
# Technical market data comes from Bybit (primary) and OKX (fallback).
# Both expose public OHLCV endpoints that work from GitHub Actions runners
# (Binance returns HTTP 451 / geo-blocks US datacenter IPs). CoinGecko OHLC
# remains a last-resort fallback inside get_klines().
BYBIT_BASE = os.environ.get("BYBIT_BASE", "https://api.bybit.com")
OKX_BASE = os.environ.get("OKX_BASE", "https://www.okx.com")
COINGECKO_BASE = "https://api.coingecko.com/api/v3"
COINGECKO_API_KEY = os.environ.get("COINGECKO_API_KEY", "")
CG_AUTH = f"?x_cg_demo_api_key={COINGECKO_API_KEY}" if COINGECKO_API_KEY else ""
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
AI_PROVIDER = os.environ.get("AI_PROVIDER", "gemini")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
MIN_VOLUME_24H = int(os.environ.get("SIGNALS_MIN_VOLUME_24H_USD", "999999999"))
TOP_COINS_FREE = int(os.environ.get("TECH_TOP_COINS_FREE", "0"))
DEFAULT_TIMEFRAME = "1h"
GEMINI_MODEL = "models/gemini-2.5-flash-lite"

# Signal quality gates (Mejoras 4-7; env-configurable, sensible defaults)
MIN_CONFIDENCE = int(os.environ.get("TECH_MIN_CONFIDENCE", "25"))
MARKET_REGIME_DOWN_PCT = abs(float(os.environ.get("TECH_REGIME_DOWN_PCT", "2.0")))
MARKET_REGIME_UP_PCT = abs(float(os.environ.get("TECH_REGIME_UP_PCT", "2.0")))
SIGNALS_MAX_AGE_DAYS = int(os.environ.get("SIGNALS_MAX_AGE_DAYS", "7"))
GEMINI_MAX_WAIT_SECONDS = int(os.environ.get("GEMINI_MAX_WAIT_SECONDS", "30"))

# Proprietary technical parameters (from GitHub Secrets / env)
RSI_OVERSOLD = int(os.environ.get("TECH_RSI_OVERSOLD", "0"))
RSI_OVERBOUGHT = int(os.environ.get("TECH_RSI_OVERBOUGHT", "100"))
CONFIDENCE_RSI = int(os.environ.get("TECH_CONFIDENCE_RSI", "0"))
CONFIDENCE_MACD = int(os.environ.get("TECH_CONFIDENCE_MACD", "0"))
CONFIDENCE_SMA = int(os.environ.get("TECH_CONFIDENCE_SMA", "0"))
CONFIDENCE_VOLUME = int(os.environ.get("TECH_CONFIDENCE_VOLUME", "0"))
CONFIDENCE_SUPPORT = int(os.environ.get("TECH_CONFIDENCE_SUPPORT", "0"))
CONFIDENCE_RESISTANCE = int(os.environ.get("TECH_CONFIDENCE_RESISTANCE", "0"))
VOLUME_SPIKE_MULTIPLIER = float(os.environ.get("TECH_VOLUME_SPIKE_MULTIPLIER", "999.0"))
NEAR_SUPPORT_OFFSET = float(os.environ.get("TECH_NEAR_SUPPORT_OFFSET", "0.5"))
NEAR_RESISTANCE_OFFSET = float(os.environ.get("TECH_NEAR_RESISTANCE_OFFSET", "1.5"))
RISK_HIGH_THRESHOLD = float(os.environ.get("TECH_RISK_HIGH_THRESHOLD", "1.0"))
RISK_MEDIUM_THRESHOLD = float(os.environ.get("TECH_RISK_MEDIUM_THRESHOLD", "0.5"))

# Proprietary ATR multipliers (from GitHub Secrets / env)
ATR_SL_CONSERVATIVE = float(os.environ.get("TECH_ATR_SL_CONSERVATIVE", "1.0"))
ATR_TP1_CONSERVATIVE = float(os.environ.get("TECH_ATR_TP1_CONSERVATIVE", "1.0"))
ATR_SL_OPTIMIZED = float(os.environ.get("TECH_ATR_SL_OPTIMIZED", "1.0"))
ATR_TP1_OPTIMIZED = float(os.environ.get("TECH_ATR_TP1_OPTIMIZED", "1.0"))
ATR_TP2_OPTIMIZED = float(os.environ.get("TECH_ATR_TP2_OPTIMIZED", "1.0"))
ATR_TP3_OPTIMIZED = float(os.environ.get("TECH_ATR_TP3_OPTIMIZED", "1.0"))

SUPPORTED_LANGS = ["en", "es", "pt", "fr", "de", "it", "ar"]

# Minimum length and forbidden patterns for explanations so test/debug/placeholder
# text (e.g. "e2e", "simulation signal") can never reach the public site.
EXPLANATION_MIN_CHARS = 20
_TEST_TEXT_PATTERNS = re.compile(
    r"\b(e2e|test(ing|er)?|dummy|debug|placeholder|lorem ipsum|sample|simulation signal|señal de simulación|foo|bar)\b",
    re.IGNORECASE,
)

# Coin names that reach the DB must look like real market symbols (BASE/USDT).
_VALID_COIN_PATTERN = re.compile(r"^[A-Za-z0-9]{1,15}/USDT$")

# Valid Bybit spot symbols cache (populated on first use)
_VALID_BYBIT_SYMBOLS: Optional[set] = None

# Interval codes per exchange: {"our": (bybit_code, okx_code)}
_INTERVAL_CODES = {
    "15m": ("15", "15m"),
    "1h": ("60", "1H"),
    "4h": ("240", "4H"),
    "1d": ("D", "1D"),
}


def _safe_market_request(url: str, params: Optional[dict] = None, timeout: int = 15) -> Optional[dict]:
    """GET JSON from a public market-data endpoint with one retry; None on failure.

    Handles rate limiting (429) and geo-blocks (451) so the pipeline can move
    on to the next data source instead of crashing.
    """
    for attempt in range(2):
        try:
            resp = requests.get(url, params=params, timeout=timeout)
            if resp.status_code == 429:
                wait = 2 ** attempt * 5
                logger.warning(f"Rate limited on {url[:60]}, waiting {wait}s...")
                time.sleep(wait)
                continue
            if resp.status_code == 451:
                logger.debug(f"451 on {url[:60]} â€” geo-blocked, trying next source")
                return None
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as e:
            logger.debug(f"Request failed {url[:60]}: {e}")
            if attempt == 0:
                time.sleep(2)
    return None


def _get_bybit_valid_symbols() -> set:
    """Fetch valid Bybit spot symbols (cached). Returns empty set on failure."""
    global _VALID_BYBIT_SYMBOLS
    if _VALID_BYBIT_SYMBOLS is not None:
        return _VALID_BYBIT_SYMBOLS
    try:
        data = _safe_market_request(
            f"{BYBIT_BASE}/v5/market/instruments-info",
            {"category": "spot", "limit": 1000},
        )
        symbols = set()
        if data and data.get("retCode") == 0:
            for item in data.get("result", {}).get("list", []):
                if item.get("status") == "Trading":
                    symbols.add(item.get("symbol", ""))
        _VALID_BYBIT_SYMBOLS = symbols
        logger.info(f"Loaded {len(_VALID_BYBIT_SYMBOLS)} valid Bybit spot symbols")
    except Exception as e:
        logger.warning(f"Failed to load Bybit instruments: {e}")
        _VALID_BYBIT_SYMBOLS = set()
    return _VALID_BYBIT_SYMBOLS


def bybit_klines(symbol: str, interval: str = "1h", limit: int = 200) -> Optional[pd.DataFrame]:
    """Fetch OHLCV candles from Bybit spot (primary market data source)."""
    bybit_interval = _INTERVAL_CODES.get(interval, ("60", "1H"))[0]
    data = _safe_market_request(
        f"{BYBIT_BASE}/v5/market/kline",
        {"category": "spot", "symbol": symbol, "interval": bybit_interval, "limit": limit},
    )
    if not data or data.get("retCode") != 0:
        return None
    rows = data.get("result", {}).get("list", [])
    if not rows:
        return None
    candles = []
    for r in rows:
        if len(r) < 6:
            continue
        candles.append({
            "timestamp": pd.to_datetime(int(r[0]), unit="ms"),
            "open": float(r[1]), "high": float(r[2]),
            "low": float(r[3]), "close": float(r[4]), "volume": float(r[5]),
        })
    if not candles:
        return None
    return pd.DataFrame(candles)


def okx_klines(symbol: str, interval: str = "1h", limit: int = 200) -> Optional[pd.DataFrame]:
    """Fetch OHLCV candles from OKX spot (fallback source). Symbol is BASE-USDT format."""
    okx_interval = _INTERVAL_CODES.get(interval, ("60", "1H"))[1]
    okx_symbol = symbol.replace("USDT", "-USDT") if "USDT" in symbol else symbol
    data = _safe_market_request(
        f"{OKX_BASE}/api/v5/market/candles",
        {"instId": okx_symbol, "bar": okx_interval, "limit": limit},
    )
    if not data or data.get("code") != "0":
        return None
    rows = data.get("data", [])
    if not rows:
        return None
    candles = []
    for r in rows:
        if len(r) < 6 or (len(r) > 8 and r[8] != "1"):
            continue
        candles.append({
            "timestamp": pd.to_datetime(int(r[0]), unit="ms"),
            "open": float(r[1]), "high": float(r[2]),
            "low": float(r[3]), "close": float(r[4]), "volume": float(r[5]),
        })
    if not candles:
        return None
    return pd.DataFrame(candles)


def get_top_coins(limit: int = 50) -> list:
    """Get top coins by market cap from CoinGecko."""
    try:
        resp = requests.get(
            f"{COINGECKO_BASE}/coins/markets",
            params={
                "vs_currency": "usd",
                "order": "market_cap_desc",
                "per_page": min(limit, 250),
                "page": 1,
                "sparkline": "false",
                **({"x_cg_demo_api_key": COINGECKO_API_KEY} if COINGECKO_API_KEY else {}),
            },
            timeout=30,
        )
        resp.raise_for_status()
        coins = resp.json()
        return [
            {
                "symbol": c["symbol"].upper() + "USDT",
                "name": c["name"],
                "market_cap": c["market_cap"],
                "volume_24h": c["total_volume"],
                "current_price": c["current_price"],
                "coingecko_id": c["id"],
                "price_change_percentage_24h": c.get("price_change_percentage_24h", 0),
                "price_change_percentage_7d_in_currency": c.get("price_change_percentage_7d_in_currency", 0),
            }
            for c in coins
            if c.get("market_cap") and c.get("total_volume", 0) >= MIN_VOLUME_24H
        ]
    except Exception as e:
        logger.error(f"CoinGecko request failed: {e}")
        fallback = [
            {"symbol": "BTCUSDT", "name": "Bitcoin", "market_cap": 1e12, "volume_24h": 1e10, "current_price": 60000, "coingecko_id": "bitcoin", "price_change_percentage_24h": 0, "price_change_percentage_7d_in_currency": 0},
            {"symbol": "ETHUSDT", "name": "Ethereum", "market_cap": 5e11, "volume_24h": 5e9, "current_price": 3000, "coingecko_id": "ethereum", "price_change_percentage_24h": 0, "price_change_percentage_7d_in_currency": 0},
            {"symbol": "BNBUSDT", "name": "BNB", "market_cap": 1e11, "volume_24h": 1e9, "current_price": 500, "coingecko_id": "bnb", "price_change_percentage_24h": 0, "price_change_percentage_7d_in_currency": 0},
            {"symbol": "SOLUSDT", "name": "Solana", "market_cap": 8e10, "volume_24h": 8e8, "current_price": 150, "coingecko_id": "solana", "price_change_percentage_24h": 0, "price_change_percentage_7d_in_currency": 0},
            {"symbol": "XRPUSDT", "name": "XRP", "market_cap": 5e10, "volume_24h": 5e8, "current_price": 0.5, "coingecko_id": "ripple", "price_change_percentage_24h": 0, "price_change_percentage_7d_in_currency": 0},
        ]
        logger.warning("Using fallback coin list")
        return fallback


def get_klines(symbol: str, interval: str = "1h", limit: int = 200, coingecko_id: Optional[str] = None) -> pd.DataFrame:
    """Fetch OHLCV klines: Bybit first, OKX as fallback, CoinGecko OHLC last resort.

    Returns an empty DataFrame only if all sources fail. The returned data is
    used exclusively for technical analysis — Binance is no longer a data source
    (it geo-blocks US datacenter IPs used by GitHub Actions).
    """
    df = bybit_klines(symbol, interval, limit)
    if df is not None and len(df) >= 20:
        return df
    df = okx_klines(symbol, interval, limit)
    if df is not None and len(df) >= 20:
        return df
    logger.info(f"Bybit & OKX unavailable for {symbol} â€” falling back to CoinGecko OHLC")

    # Fallback: try CoinGecko OHLC (frees data source that works from GitHub Actions)
    if coingecko_id:
        try:
            interval_map = {"1h": 1, "4h": 7, "1d": 30}
            days = interval_map.get(interval, 3)
            resp = requests.get(
                f"{COINGECKO_BASE}/coins/{coingecko_id}/ohlc",
                params={"vs_currency": "usd", "days": days, "x_cg_demo_api_key": COINGECKO_API_KEY,
            },
                timeout=15,
            )
            logger.debug(f"CoinGecko OHLC for {symbol} ({coingecko_id}): HTTP {resp.status_code}")
            if resp.status_code == 429:
                logger.warning(f"CoinGecko rate limited on {symbol}, waiting 3s...")
                time.sleep(3)
                resp = requests.get(
                    f"{COINGECKO_BASE}/coins/{coingecko_id}/ohlc",
                    params={"vs_currency": "usd", "days": days, "x_cg_demo_api_key": COINGECKO_API_KEY,
            },
                    timeout=15,
                )
            if resp.status_code == 200:
                ohlc_data = resp.json()
                if ohlc_data and len(ohlc_data) >= 10:
                    rows = []
                    for entry in ohlc_data:
                        ts, o, h, l, c, *_ = entry if len(entry) >= 5 else (entry[0], 0, 0, 0, 0)
                        rows.append({"timestamp": pd.to_datetime(ts, unit="ms"), "open": float(o), "high": float(h), "low": float(l), "close": float(c), "volume": 0})
                    df = pd.DataFrame(rows)
                    logger.info(f"Got {len(df)} CoinGecko OHLC candles for {symbol}")
                    return df
                else:
                    logger.debug(f"CoinGecko OHLC too few candles: {len(ohlc_data) if ohlc_data else 0}")
        except Exception as e:
            logger.debug(f"CoinGecko OHLC fallback failed for {symbol}: {e}")

    return pd.DataFrame()


def calculate_indicators(df: pd.DataFrame, volume_24h: float = 0) -> dict:
    """Calculate technical indicators and return signal assessment.
    
    Args:
        df: OHLC DataFrame with columns timestamp, open, high, low, close, volume
        volume_24h: 24h volume from CoinGecko markets (used when OHLC volume is 0)
    """
    close = df["close"].values
    high = df["high"].values
    low = df["low"].values
    volume = df["volume"].values
    
    # CoinGecko OHLC has volume=0; use 24h volume as proxy if provided
    has_real_volume = volume.sum() > 0
    if not has_real_volume and volume_24h > 0:
        # Distribute 24h volume evenly across candles as approximation
        vol_per_candle = volume_24h / len(volume)
        volume = np.full_like(volume, vol_per_candle)

    # RSI (14)
    delta = np.diff(close)
    gain = np.where(delta > 0, delta, 0)
    loss = np.where(delta < 0, -delta, 0)
    avg_gain = np.mean(gain[-14:]) if len(gain) >= 14 else 0
    avg_loss = np.mean(loss[-14:]) if len(loss) >= 14 else 0
    rsi = 50
    if avg_loss != 0:
        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))

    # MACD
    ema12 = pd.Series(close).ewm(span=12).mean().values
    ema26 = pd.Series(close).ewm(span=26).mean().values
    macd_line = ema12 - ema26
    signal_line = pd.Series(macd_line).ewm(span=9).mean().values
    macd_hist = macd_line - signal_line
    macd_bullish = len(macd_hist) > 1 and macd_hist[-1] > macd_hist[-2]

    # SMA crossover (50, 200)
    sma50 = np.mean(close[-50:]) if len(close) >= 50 else close[-1]
    sma200 = np.mean(close[-200:]) if len(close) >= 200 else close[-1]
    sma_bullish = sma50 > sma200

    # Volume spike
    avg_vol = np.mean(volume[-20:]) if len(volume) >= 20 else volume[-1]
    vol_spike = volume[-1] > avg_vol * VOLUME_SPIKE_MULTIPLIER if avg_vol > 0 else False

    # Support/Resistance
    recent_high = np.max(high[-20:])
    recent_low = np.min(low[-20:])
    current_price = close[-1]
    near_support = current_price <= recent_low * NEAR_SUPPORT_OFFSET
    near_resistance = current_price >= recent_high * NEAR_RESISTANCE_OFFSET

    # ATR for TP/SL calculation
    tr = np.maximum(
        high[-1] - low[-1],
        np.maximum(
            np.abs(high[-1] - close[-2]),
            np.abs(low[-1] - close[-2])
        )
    ) if len(close) >= 2 else high[-1] - low[-1]
    atr = float(tr)

    # Volatility
    volatility = float(np.std(close[-20:]) / np.mean(close[-20:])) if len(close) >= 20 else 0.02

    # Signal decision (pure technical)
    signals_list = []
    confidence = 0

    if rsi < RSI_OVERSOLD:
        signals_list.append("oversold")
        confidence += CONFIDENCE_RSI
    elif rsi > RSI_OVERBOUGHT:
        signals_list.append("overbought")
        confidence += CONFIDENCE_RSI

    if macd_bullish:
        signals_list.append("macd_bullish")
        confidence += CONFIDENCE_MACD
    else:
        signals_list.append("macd_bearish")
        confidence -= CONFIDENCE_MACD

    if sma_bullish:
        signals_list.append("sma_bullish")
        confidence += CONFIDENCE_SMA
    else:
        signals_list.append("sma_bearish")
        confidence -= CONFIDENCE_SMA

    if vol_spike:
        signals_list.append("volume_spike")
        confidence += CONFIDENCE_VOLUME

    if near_support:
        signals_list.append("near_support")
        confidence += CONFIDENCE_SUPPORT
    elif near_resistance:
        signals_list.append("near_resistance")
        confidence -= CONFIDENCE_RESISTANCE

    buy_signals = sum(1 for s in signals_list if s in ["oversold", "macd_bullish", "sma_bullish", "near_support"])
    sell_signals = sum(1 for s in signals_list if s in ["overbought", "macd_bearish", "sma_bearish", "near_resistance"])

    signal_type = "neutral"
    if buy_signals > sell_signals and confidence >= 20:
        signal_type = "buy"
    elif sell_signals > buy_signals and abs(confidence) >= 20:
        signal_type = "sell"

    # Indicators used list
    indicators_used = ["RSI", "MACD"]
    if len(close) >= 50:
        indicators_used.append("SMA")
    if vol_spike:
        indicators_used.append("Volume")
    indicators_used.append("Support/Resistance")

    return {
        "signal_type": signal_type,
        "confidence": min(abs(confidence), 95),
        "rsi": round(rsi, 1),
        "macd_bullish": macd_bullish,
        "sma_bullish": sma_bullish,
        "volume_spike": vol_spike,
        "current_price": current_price,
        "recent_high": recent_high,
        "recent_low": recent_low,
        "atr": atr,
        "volatility": volatility,
        "indicators_used": indicators_used,
    }


def fetch_coingecko_ohlc(coingecko_id: str, interval: str = "1h") -> Optional[pd.DataFrame]:
    """Fetch real OHLC historical data from CoinGecko for a single coin.
    
    Uses /coins/{id}/ohlc endpoint with retry and backoff for rate limits.
    Returns DataFrame with columns: timestamp, open, high, low, close, volume
    or None if rate limited / failed.
    """
    interval_days = {"1h": 1, "4h": 7, "1d": 30}
    days = interval_days.get(interval, 3)
    for attempt in range(3):
        try:
            resp = requests.get(
                f"{COINGECKO_BASE}/coins/{coingecko_id}/ohlc",
                params={"vs_currency": "usd", "days": days, "x_cg_demo_api_key": COINGECKO_API_KEY,
            },
                timeout=15,
            )
            if resp.status_code == 429:
                wait = 2 ** attempt * 5
                logger.warning(f"CoinGecko rate limited on OHLC for {coingecko_id}, waiting {wait}s...")
                time.sleep(wait)
                continue
            if resp.status_code != 200:
                logger.info(f"CoinGecko OHLC HTTP {resp.status_code} for {coingecko_id}")
                return None
            ohlc_data = resp.json()
            if not ohlc_data or len(ohlc_data) < 20:
                logger.debug(f"CoinGecko OHLC too few points for {coingecko_id}: {len(ohlc_data) if ohlc_data else 0}")
                return None
            rows = []
            for entry in ohlc_data:
                ts, o, h, l, c = entry[:5]
                rows.append({"timestamp": pd.to_datetime(ts, unit="ms"), "open": float(o), "high": float(h), "low": float(l), "close": float(c), "volume": 0})
            df = pd.DataFrame(rows)
            logger.info(f"Fetched {len(df)} real OHLC candles for {coingecko_id}")
            return df
        except Exception as e:
            logger.debug(f"CoinGecko OHLC error for {coingecko_id}: {e}")
            if attempt < 2:
                time.sleep(2 ** attempt * 3)
    return None


def enhance_with_real_ohlc(analysis: dict, coin_symbol: str, coingecko_id: str, volume_24h: float = 0) -> dict:
    """Replace proxy indicator values with real OHLC-calculated ones if available.
    
    Takes the simplified analysis dict and upgrades it with real technical indicators
    from CoinGecko OHLC data. Returns original analysis if OHLC unavailable.
    """
    df = fetch_coingecko_ohlc(coingecko_id, DEFAULT_TIMEFRAME)
    if df is None or df.empty:
        return analysis
    
    real = calculate_indicators(df, volume_24h=volume_24h)
    if real["signal_type"] == "neutral":
        logger.info(f"OHLC for {coin_symbol}: RSI={real['rsi']} MACD={real['macd_bullish']} SMA={real['sma_bullish']} (neutral, keeping proxy signal)")
        return analysis
    
    # Merge real values into analysis, keeping original signal_type if confident
    merged = {**analysis}
    merged.update({
        "rsi": real["rsi"],
        "macd_bullish": real["macd_bullish"],
        "sma_bullish": real["sma_bullish"],
        "volume_spike": real["volume_spike"],
        "atr": real["atr"],
        "volatility": real["volatility"],
        "current_price": real["current_price"],
        "recent_high": real["recent_high"],
        "recent_low": real["recent_low"],
    })
    if real["signal_type"] == analysis["signal_type"]:
        merged["confidence"] = max(analysis["confidence"], real["confidence"])
        merged["indicators_used"] = real["indicators_used"]
    
    logger.info(f"Enhanced {coin_symbol} with real OHLC: RSI={real['rsi']} MACD={real['macd_bullish']} SMA={real['sma_bullish']} signal={real['signal_type']}")
    return merged


def calculate_dual_tps(current_price: float, atr: float, signal_type: str) -> dict:
    """
    Calculate dual TP/SL levels:
    - Conservative (free): tighter stop, TP1 only at first support/resistance
    - Optimized (premium): wider TP ladder (TP1/TP2/TP3) based on ATR confluence
    """
    if signal_type == "buy":
        # Conservative: tight SL, modest TP1
        sl_conservative = round(current_price - atr * ATR_SL_CONSERVATIVE, 8)
        tp1_conservative = round(current_price + atr * ATR_TP1_CONSERVATIVE, 8)

        # Optimized: wider SL, TP ladder
        sl_optimized = round(current_price - atr * ATR_SL_OPTIMIZED, 8)
        tp1_optimized = round(current_price + atr * ATR_TP1_OPTIMIZED, 8)
        tp2_optimized = round(current_price + atr * ATR_TP2_OPTIMIZED, 8)
        tp3_optimized = round(current_price + atr * ATR_TP3_OPTIMIZED, 8)

        entry_min = round(current_price * 0.98, 8)
        entry_max = round(current_price * 1.01, 8)
    else:
        # Sell signal: inverted levels
        sl_conservative = round(current_price + atr * ATR_SL_CONSERVATIVE, 8)
        tp1_conservative = round(current_price - atr * ATR_TP1_CONSERVATIVE, 8)

        sl_optimized = round(current_price + atr * ATR_SL_OPTIMIZED, 8)
        tp1_optimized = round(current_price - atr * ATR_TP1_OPTIMIZED, 8)
        tp2_optimized = round(current_price - atr * ATR_TP2_OPTIMIZED, 8)
        tp3_optimized = round(current_price - atr * ATR_TP3_OPTIMIZED, 8)

        entry_min = round(current_price * 0.99, 8)
        entry_max = round(current_price * 1.02, 8)

    risk_cons = abs(current_price - sl_conservative)
    reward_cons = abs(tp1_conservative - current_price)
    rr_cons = round(reward_cons / risk_cons, 2) if risk_cons > 0 else 1.0

    risk_opt = abs(current_price - sl_optimized)
    reward_opt = abs(tp1_optimized - current_price)
    rr_opt = round(reward_opt / risk_opt, 2) if risk_opt > 0 else 1.0

    # Risk level from volatility
    if atr / current_price > RISK_HIGH_THRESHOLD:
        risk_level = "high"
    elif atr / current_price > RISK_MEDIUM_THRESHOLD:
        risk_level = "medium"
    else:
        risk_level = "low"

    return {
        "entry_price_min": entry_min,
        "entry_price_max": entry_max,
        # Conservative (free)
        "stop_loss_conservative": sl_conservative,
        "take_profit_1_conservative": tp1_conservative,
        "risk_reward_conservative": rr_cons,
        # Optimized (premium)
        "stop_loss_optimized": sl_optimized,
        "take_profit_1_optimized": tp1_optimized,
        "take_profit_2_optimized": tp2_optimized,
        "take_profit_3_optimized": tp3_optimized,
        "risk_reward_optimized": rr_opt,
        "risk_level": risk_level,
    }


def call_gemini_batch(signals_data: list) -> Optional[dict]:
    """Single Gemini call for ALL signals, returns JSON with 7-language explanations including fundamental context."""
    if not GEMINI_API_KEY or AI_PROVIDER != "gemini":
        return None

    signals_json = json.dumps([
        {
            "coin": s["coin"],
            "signal_type": s["signal_type"],
            "rsi": s["rsi"],
            "macd_bullish": s["macd_bullish"],
            "sma_bullish": s["sma_bullish"],
            "volume_spike": s["volume_spike"],
            "indicators": s["indicators_used"],
            "fundamental_tags": s.get("fundamental_tags", []),
            "fundamental_score": s.get("fundamental_score", 0),
        }
        for s in signals_data
    ], indent=2)

    prompt = f"""You are NOIRAX, an educational crypto trading signal system.
For each signal below, generate a 1-2 sentence explanation in ALL these languages: {', '.join(SUPPORTED_LANGS)}.
Combine technical AND fundamental analysis into a single coherent explanation.
Use simple, beginner-friendly language. Never guarantee profits. Always educational.

IMPORTANT: When explaining, reference both the technical indicators AND the fundamental signals (e.g. "news sentiment is positive", "unusual volume detected", "large holder activity").
Do NOT reveal exact thresholds, weights, or specific data sources â€” use general terms like "market analysis", "on-chain activity", "news sentiment".

Return a JSON object where keys are coins (e.g. "BTC/USDT") and values are objects with language codes as keys.

Example format:
{{"BTC/USDT": {{"en": "BTC shows bullish momentum with positive news sentiment...", "es": "BTC muestra momentum alcista con sentimiento positivo..."}}}}

Signals to explain:
{signals_json}

Return ONLY valid JSON, no markdown."""

    for attempt in range(3):
        try:
            resp = requests.post(
                f"https://generativelanguage.googleapis.com/v1beta/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}",
                json={"contents": [{"parts": [{"text": prompt}]}]},
                timeout=30,
            )
            if resp.status_code == 429:
                if attempt == 0:
                    logger.warning(f"Gemini 429, waiting {GEMINI_MAX_WAIT_SECONDS}s then retrying...")
                    time.sleep(GEMINI_MAX_WAIT_SECONDS)
                    continue
                logger.warning(f"Gemini still rate-limited after {GEMINI_MAX_WAIT_SECONDS}s, using fallback")
                return None
            if resp.status_code != 200:
                logger.warning(f"Gemini API error {resp.status_code}: {resp.text[:200]}")
                if attempt < 2:
                    time.sleep(2 ** attempt * 5)
                    continue
                return None
            data = resp.json()
            candidates = data.get("candidates", [])
            if candidates:
                text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                if text:
                    cleaned = text.strip().removeprefix("```json").removesuffix("```").strip()
                    return json.loads(cleaned)
        except Exception as e:
            logger.warning(f"Gemini call failed (attempt {attempt+1}): {e}")
            if attempt < 2:
                time.sleep(2 ** attempt * 5)
            else:
                return None
    return None


def sanitize_explanations(explanations: dict, fallback: dict) -> dict:
    """Replace test/placeholder/short explanations with the template fallback."""
    clean = {}
    for lang in SUPPORTED_LANGS:
        value = str(explanations.get(lang, "") or "").strip()
        if len(value) < EXPLANATION_MIN_CHARS or _TEST_TEXT_PATTERNS.search(value):
            value = str(fallback.get(lang, "") or "").strip()
        clean[lang] = value
    return clean


def generate_fallback_explanations(coin: str, analysis: dict, fund_result: dict) -> dict:
    """Generate template-based explanations in all 7 languages when AI fails."""
    templates = {
        "en": "{coin} shows a {type} setup with RSI at {rsi}. {fund_ctx} Educational content â€” not financial advice.",
        "es": "{coin} muestra un setup {type_es} con RSI en {rsi}. {fund_ctx} Contenido educativo.",
        "pt": "{coin} mostra um setup {type_pt} com RSI em {rsi}. {fund_ctx} ConteÃºdo educativo.",
        "fr": "{coin} montre un setup {type_fr} avec RSI Ã  {rsi}. {fund_ctx} Contenu Ã©ducatif.",
        "de": "{coin} zeigt ein {type_de} Setup mit RSI bei {rsi}. {fund_ctx} Bildungsinhalt.",
        "it": "{coin} mostra un setup {type_it} con RSI a {rsi}. {fund_ctx} Contenuto educativo.",
        "ar": "{coin} ÙŠØ¸Ù‡Ø± Ø¥Ø¹Ø¯Ø§Ø¯ {type_ar} Ù…Ø¹ RSI Ø¹Ù†Ø¯ {rsi}. {fund_ctx} Ù…Ø­ØªÙˆÙ‰ ØªØ¹Ù„ÙŠÙ…ÙŠ.",
    }
    type_map = {
        "buy": {"en": "bullish", "es": "alcista", "pt": "altista", "fr": "haussier", "de": "bullishes", "it": "rialzista", "ar": "ØµØ§Ø¹Ø¯"},
        "sell": {"en": "bearish", "es": "bajista", "pt": "baixista", "fr": "baissier", "de": "bÃ¤risches", "it": "ribassista", "ar": "Ù‡Ø§Ø¨Ø·"},
    }
    # Fundamental context (generic terms only)
    tags = fund_result.get("tags", [])
    fund_ctx = ""
    if "NEWS_POSITIVE" in tags:
        fund_ctx = "Positive news sentiment detected."
    elif "NEWS_NEGATIVE" in tags:
        fund_ctx = "Negative news sentiment detected."
    elif "NEWS_CRITICAL" in tags:
        fund_ctx = "Critical news alert â€” exercise caution."
    if "WHALE_ACTIVITY" in tags:
        fund_ctx += " Large holder activity detected."
    if "VOLUME_ANOMALY" in tags:
        fund_ctx += " Unusual trading volume observed."
    if "FUNDING_RATE_HIGH" in tags:
        fund_ctx += " Elevated funding rate â€” potential correction."
    elif "FUNDING_RATE_LOW" in tags:
        fund_ctx += " Low funding rate â€” potential bounce."
    if not fund_ctx:
        fund_ctx = "Fundamental indicators are neutral."

    result = {}
    types = type_map.get(analysis["signal_type"], type_map["buy"])
    for lang_code, tmpl in templates.items():
        t = types.get(lang_code, types["en"])
        result[lang_code] = tmpl.format(
            coin=coin, type=t,
            type_es=types.get("es", t), type_pt=types.get("pt", t),
            type_fr=types.get("fr", t), type_de=types.get("de", t),
            type_it=types.get("it", t), type_ar=types.get("ar", t),
            rsi=analysis["rsi"], fund_ctx=fund_ctx,
        )
    return result


def insert_signal(supabase_client, signal_data: dict) -> bool:
    """Insert a signal into Supabase.

    Dedup + cooldown: skips insertion while an unresolved (pending) signal for
    the same coin + signal_type + timeframe already exists, so the track record
    is not inflated by re-emissions of the same signal on every pipeline run.
    """
    try:
        coin = signal_data.get("coin", "")
        signal_type = signal_data.get("signal_type", "")
        timeframe = signal_data.get("timeframe", "")
        existing = (
            supabase_client.table("signals")
            .select("id")
            .eq("coin", coin)
            .eq("signal_type", signal_type)
            .eq("timeframe", timeframe)
            .eq("resolved_result", "pending")
            .limit(1)
            .execute()
        )
        rows = existing.data if hasattr(existing, "data") else []
        if rows:
            logger.info(f"Dedup: active {signal_type} signal already exists for {coin} ({timeframe}) â€” skipping")
            return False
        supabase_client.table("signals").insert(signal_data).execute()
        logger.info(f"Signal inserted: {signal_data['coin']} {signal_data['signal_type']}")
        return True
    except Exception as e:
        logger.error(f"Failed to insert signal: {e}")
        return False


def calculate_simple_signal(coin: dict) -> Optional[dict]:
    """Generate signal from CoinGecko market data (used when market data sources are blocked)."""
    price = coin.get("current_price", 0)
    change_24h = coin.get("price_change_percentage_24h", 0) or 0
    change_7d = coin.get("price_change_percentage_7d_in_currency") or change_24h or 0
    volume = coin.get("total_volume", 0) or 0
    mcap = coin.get("market_cap", 1) or 1
    vol_to_mcap = volume / mcap
    symbol = coin.get("symbol", "?")

    rsi_proxy = 50 + change_24h * 5
    rsi_proxy = max(0, min(100, rsi_proxy))
    logger.info(f"Simple {symbol}: 24h={change_24h:.1f}% 7d={change_7d:.1f}% rsi_proxy={rsi_proxy:.0f}")

    signal_type = "neutral"
    confidence = 0
    signals_list = []
    indicators_used = ["RSI(proxy)"]
    proxy_oversold = 35
    proxy_overbought = 65

    if rsi_proxy < proxy_oversold:
        signals_list.append("oversold")
        confidence += CONFIDENCE_RSI
        indicators_used.append("MACD(proxy)")
        indicators_used.append("Volume")
    elif rsi_proxy > proxy_overbought:
        signals_list.append("overbought")
        confidence += CONFIDENCE_RSI
        indicators_used.append("MACD(proxy)")
        indicators_used.append("Volume")

    if change_7d > 2 and change_24h > 0:
        signals_list.append("macd_bullish")
        confidence += CONFIDENCE_MACD
    elif change_7d < -2 and change_24h < 0:
        signals_list.append("macd_bearish")
        confidence -= CONFIDENCE_MACD

    if vol_to_mcap > 0.03:
        signals_list.append("volume_spike")
        confidence += CONFIDENCE_VOLUME

    if change_7d < -5:
        signals_list.append("near_support")
        confidence += CONFIDENCE_SUPPORT
    elif change_7d > 5:
        signals_list.append("near_resistance")
        confidence -= CONFIDENCE_RESISTANCE

    buy_signals = sum(1 for s in signals_list if s in ["oversold", "macd_bullish", "near_support"])
    sell_signals = sum(1 for s in signals_list if s in ["overbought", "macd_bearish", "near_resistance"])

    if buy_signals > sell_signals and confidence >= 20:
        signal_type = "buy"
    elif sell_signals > buy_signals and abs(confidence) >= 20:
        signal_type = "sell"

    if signal_type == "neutral":
        return None

    atr = abs(price * change_24h / 100) if change_24h != 0 else price * 0.01

    return {
        "signal_type": signal_type,
        "confidence": min(abs(confidence), 95),
        "rsi": round(rsi_proxy, 1),
        "macd_bullish": change_7d > 2 and change_24h > 0,
        "sma_bullish": change_7d > 0,
        "volume_spike": vol_to_mcap > 0.03,
        "current_price": price,
        "recent_high": price * (1 + abs(change_24h / 100)),
        "recent_low": price * (1 - abs(change_24h / 100)),
        "atr": atr,
        "volatility": abs(change_24h) / 100,
        "indicators_used": indicators_used,
    }


def create_slug(coin: str, signal_type: str, timestamp: str, duration_type: str = "swing") -> str:
    """Create SEO-friendly URL slug for a signal."""
    coin_clean = coin.replace("/", "-").lower()
    ts_formatted = datetime.fromisoformat(timestamp).strftime("%Y-%m-%d-%H%M") if timestamp else datetime.now(timezone.utc).strftime("%Y-%m-%d-%H%M")
    dur = {"scalping": "scalp", "long": "long"}.get(duration_type, "swing")
    return f"{coin_clean}-{signal_type}-{dur}-{ts_formatted}"


def analyze_timeframe(coingecko_id: str, symbol: str, days: int, duration_tag: str) -> Optional[dict]:
    """Fetch OHLC for a given timeframe and return analysis if signal triggers."""
    df = fetch_coingecko_ohlc(coingecko_id, days_to_interval(days))
    if df is None or df.empty or len(df) < 20:
        return None
    analysis = calculate_indicators(df)
    if analysis["signal_type"] == "neutral":
        return None
    analysis["duration_type"] = duration_tag
    return analysis


def days_to_interval(days: int) -> str:
    """Map OHLC days parameter to a pseudo-interval name (used for logging)."""
    return {1: "1h", 7: "1h", 14: "4h", 30: "4h"}.get(days, "1h")


def generate_multi_timeframe_signals(coin_symbol: str, cg_id: str, tier: str,
                                      fund_result: dict, timestamp: str,
                                      coin_display: str, volume_24h: float = 0) -> list:
    """Analyze ALL 3 timeframes (15min scalping, 1h swing, 1d long) and return signals for each that triggers.
    
    This is the PRIMARY analysis â€” each signal is tagged with its REAL timeframe.
    0 extra OHLC calls if we already have 1h data; otherwise 3 calls per coin.
    """
    extras = []
    ohlc_1h = None
    
    # 1. SWING (1h timeframe) â€” most common, baseline
    ohlc_1h = fetch_coingecko_ohlc(cg_id, "1h")
    if ohlc_1h is not None and len(ohlc_1h) >= 20:
        swing = calculate_indicators(ohlc_1h, volume_24h=volume_24h)
        if swing["signal_type"] != "neutral":
            swing["duration_type"] = "swing"
            tps = calculate_dual_tps(swing["current_price"], swing["atr"], swing["signal_type"])
            extras.append({
                "coin": coin_display, "coin_symbol": coin_symbol,
                "tier": tier, "analysis": swing, "tps": tps,
                "fundamental": fund_result, "timestamp": timestamp,
                "coingecko_id": cg_id, "duration_type": "swing",
            })
            logger.info(f"Swing signal for {coin_symbol}: {swing['signal_type']} RSI={swing['rsi']}")
    
    # 2. SCALPING (15min from 5-min OHLC)
    try:
        resp = requests.get(
            f"{COINGECKO_BASE}/coins/{cg_id}/ohlc",
            params={"vs_currency": "usd", "days": 1, "x_cg_demo_api_key": COINGECKO_API_KEY},
            timeout=12,
        )
        if resp.status_code == 200:
            data = resp.json()
            if data and len(data) >= 72:
                rows = [{"timestamp": pd.to_datetime(c[0], unit="ms"), "open": float(c[1]),
                         "high": float(c[2]), "low": float(c[3]), "close": float(c[4]), "volume": 0}
                        for c in data]
                df_5m = pd.DataFrame(rows)
                df_15m = df_5m.resample("15min", on="timestamp").agg({
                    "open": "first", "high": "max", "low": "min",
                    "close": "last", "volume": "sum"
                }).dropna()
                if len(df_15m) >= 20:
                    scalping = calculate_indicators(df_15m, volume_24h=volume_24h)
                    if scalping["signal_type"] != "neutral":
                        scalping["duration_type"] = "scalping"
                        tps = calculate_dual_tps(scalping["current_price"], scalping["atr"], scalping["signal_type"])
                        extras.append({
                            "coin": coin_display, "coin_symbol": coin_symbol,
                            "tier": tier, "analysis": scalping, "tps": tps,
                            "fundamental": fund_result, "timestamp": timestamp,
                            "coingecko_id": cg_id, "duration_type": "scalping",
                        })
                        logger.info(f"Scalping signal for {coin_symbol}: {scalping['signal_type']} RSI={scalping['rsi']} (15min from 5-min OHLC)")
    except Exception as e:
        logger.debug(f"OHLC 5-min error for {cg_id}: {e}")
    
    # 3. LONG-TERM (daily from 4h OHLC)
    try:
        resp = requests.get(
            f"{COINGECKO_BASE}/coins/{cg_id}/ohlc",
            params={"vs_currency": "usd", "days": 30, "x_cg_demo_api_key": COINGECKO_API_KEY},
            timeout=12,
        )
        if resp.status_code == 200:
            data = resp.json()
            if data and len(data) >= 20:
                rows = [{"timestamp": pd.to_datetime(c[0], unit="ms"), "open": float(c[1]),
                         "high": float(c[2]), "low": float(c[3]), "close": float(c[4]), "volume": 0}
                        for c in data]
                df_4h = pd.DataFrame(rows)
                df_1d = df_4h.resample("1D", on="timestamp").agg({
                    "open": "first", "high": "max", "low": "min",
                    "close": "last", "volume": "sum"
                }).dropna()
                if len(df_1d) >= 14:
                    long_term = calculate_indicators(df_1d, volume_24h=volume_24h)
                    if long_term["signal_type"] != "neutral":
                        long_term["duration_type"] = "long"
                        tps = calculate_dual_tps(long_term["current_price"], long_term["atr"], long_term["signal_type"])
                        extras.append({
                            "coin": coin_display, "coin_symbol": coin_symbol,
                            "tier": tier, "analysis": long_term, "tps": tps,
                            "fundamental": fund_result, "timestamp": timestamp,
                            "coingecko_id": cg_id, "duration_type": "long",
                        })
                        logger.info(f"Long-term signal for {coin_symbol}: {long_term['signal_type']} RSI={long_term['rsi']} (daily from 4h OHLC)")
    except Exception as e:
        logger.debug(f"OHLC 4h error for {cg_id}: {e}")
    
    return extras


def generate_weekly_summary(supabase_client) -> Optional[str]:
    """Generate a weekly market summary blog post from REAL signal data (no Gemini).
    
    Uses actual signal statistics to create an informative weekly summary.
    Runs once per week. Stores result in Supabase blog_posts table.
    Returns the blog post slug if created, None if skipped/failed.
    """
    try:
        week_start = datetime.now(timezone.utc) - timedelta(days=7)
        existing = supabase_client.table("blog_posts").select("id").gte("created_at", week_start.isoformat()).limit(1).execute()
        if existing.data:
            logger.info("Weekly blog already generated this week")
            return None

        sigs = supabase_client.table("signals").select("coin,signal_type,resolved_result,tier") \
            .gte("created_at", week_start.isoformat()).execute()
        if not sigs.data:
            logger.info("No signals in last 7 days for weekly blog")
            return None

        total = len(sigs.data)
        buys = sum(1 for s in sigs.data if s['signal_type'] == 'buy')
        sells = total - buys
        wins = sum(1 for s in sigs.data if s.get('resolved_result') == 'win')
        losses = sum(1 for s in sigs.data if s.get('resolved_result') == 'loss')
        pending = total - wins - losses
        coins = list(set(s['coin'] for s in sigs.data))
        win_rate = f"{wins/(wins+losses)*100:.0f}%" if wins+losses > 0 else "N/A"

        content = f"""## Weekly Market Summary â€” {datetime.now(timezone.utc).strftime('%B %d, %Y')}

This week, NOIRAX generated {total} trading signals across {len(coins)} different cryptocurrencies.

- **Total signals**: {total}
- **Buy signals**: {buys}
- **Sell signals**: {sells}
- **Resolved as wins**: {wins}
- **Resolved as losses**: {losses}
- **Currently open**: {pending}
- **Win rate**: {win_rate}
- **Unique coins analyzed**: {len(coins)}

**Coins covered**: {', '.join(sorted(coins)[:15])}{' and more' if len(coins) > 15 else ''}

### Win Rate Analysis

The current win rate stands at {win_rate} across all resolved signals. Premium signals (optimized TP/SL levels) typically show a higher win rate than Free (conservative) signals, as the wider stop-loss allows more room for market movement.

### Market Coverage

NOIRAX analyzes coins across three time horizons:
- **Scalping** (15-minute candles): Quick trades for short-term movements
- **Swing** (1-hour candles): Medium-term positions over days
- **Long-term** (daily candles): Broader market trends over weeks

This multi-timeframe approach captures opportunities at different market rhythms.

*Educational content â€” not financial advice. Trading involves risk of loss.*"""

        slug = f"weekly-summary-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}"
        post_data = {
            "slug": slug,
            "title": f"Weekly Market Summary â€” {datetime.now(timezone.utc).strftime('%B %d, %Y')}",
            "content": content,
            "excerpt": f"This week: {total} signals, {wins} wins, {losses} losses across {len(coins)} coins.",
            "published_at": datetime.now(timezone.utc).isoformat(),
            "author": "NOIRAX",
            "tags": ["weekly-summary", "automated", "market-data"],
        }
        supabase_client.table("blog_posts").insert(post_data).execute()
        logger.info(f"Weekly blog created from real data: {slug}")
        return slug
    except Exception as e:
        logger.warning(f"Weekly blog generation failed: {e}")
        return None


def _iter_pending_signals(supabase_client, budget_seconds: int = 240):
    """Yield ALL pending signals oldest-first (FIFO), paged.

    PostgREST only returns ~10 rows when no explicit limit/range is given, so
    the old code kept re-processing the same oldest signals and never verified
    newer ones. This generator pages through every pending signal in created_at
    order, stopping once the wall-clock budget is exhausted (the pipeline job
    has a 10-minute timeout and also needs time for signal generation).
    """
    page_size = 50
    offset = 0
    start = time.time()
    while time.time() - start < budget_seconds:
        page = (
            supabase_client.table("signals")
            .select("*")
            .eq("resolved_result", "pending")
            .order("created_at", desc=False)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        signals = page.data if hasattr(page, "data") else []
        if not signals:
            return
        offset += page_size
        for signal in signals:
            if time.time() - start >= budget_seconds:
                return
            yield signal


def verify_past_signals(supabase_client) -> int:
    """Check past pending signals against OHLC high/low range (not snapshot price).

    Runs an expiry pass first: pending signals older than SIGNALS_MAX_AGE_DAYS
    are marked 'expired' instead of lingering forever in the track record.
    """
    # Mejora 6: expire stale signals
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=SIGNALS_MAX_AGE_DAYS)).isoformat()
        stale = (
            supabase_client.table("signals")
            .select("id")
            .eq("resolved_result", "pending")
            .lt("created_at", cutoff)
            .execute()
        )
        stale_rows = stale.data if hasattr(stale, "data") else []
        for s in stale_rows:
            supabase_client.table("signals").update({
                "resolved_result": "expired",
                "resolved_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", s["id"]).execute()
        if stale_rows:
            logger.info(f"Expired {len(stale_rows)} stale pending signals (older than {SIGNALS_MAX_AGE_DAYS} days)")
    except Exception as e:
        logger.warning(f"Signal expiry pass failed: {e}")

    try:
        verified = 0
        for signal in _iter_pending_signals(supabase_client):
            try:
                coin_cg_id = signal.get("coingecko_id", "")
                if not coin_cg_id:
                    continue
                
                created_str = signal.get("created_at", "")
                if not created_str:
                    continue
                created_dt = datetime.fromisoformat(created_str.replace("Z", "+00:00") if "Z" in created_str else created_str)
                now_dt = datetime.now(timezone.utc)
                age_hours = (now_dt - created_dt).total_seconds() / 3600
                
                # Determine OHLC days parameter (valid: 1, 7, 14, 30)
                # Use enough days to cover signal lifetime
                age_days = max(1, int(age_hours / 24) + 1)
                if age_days <= 1: ohlc_days = 1
                elif age_days <= 7: ohlc_days = 7
                elif age_days <= 14: ohlc_days = 14
                else: ohlc_days = 30
                
                resp = requests.get(
                    f"{COINGECKO_BASE}/coins/{coin_cg_id}/ohlc",
                    params={"vs_currency": "usd", "days": ohlc_days, "x_cg_demo_api_key": COINGECKO_API_KEY,
            },
                    timeout=15,
                )
                if resp.status_code == 429:
                    logger.warning(f"CoinGecko rate limited for {coin_cg_id}, waiting 5s...")
                    time.sleep(5)
                    resp = requests.get(
                        f"{COINGECKO_BASE}/coins/{coin_cg_id}/ohlc",
                        params={"vs_currency": "usd", "days": ohlc_days, "x_cg_demo_api_key": COINGECKO_API_KEY,
            },
                        timeout=15,
                    )
                if resp.status_code != 200:
                    logger.debug(f"OHLC fetch failed for {coin_cg_id}: HTTP {resp.status_code}")
                    continue
                ohlc_data = resp.json()
                if not ohlc_data:
                    continue
                
                # Filter candles to only those after signal creation
                created_ts = created_dt.timestamp() * 1000
                filtered_candles = [c for c in ohlc_data if c[0] >= created_ts]
                if not filtered_candles:
                    continue
                
                # Get high/low across all candles since creation
                all_highs = [c[2] for c in filtered_candles]
                all_lows = [c[3] for c in filtered_candles]
                max_high = max(all_highs)
                min_low = min(all_lows)
                
                entry = float(signal.get("entry_price") or 0)
                signal_type = signal.get("signal_type", "buy")
                
                # Both sets of levels are always saved
                sl_cons = float(signal.get("stop_loss_conservative") or signal.get("stop_loss") or 0)
                tp1_cons = float(signal.get("take_profit_1_conservative") or signal.get("take_profit_1") or 0)
                sl_opt = float(signal.get("stop_loss_optimized") or sl_cons or 0)
                tp1_opt = float(signal.get("take_profit_1_optimized") or tp1_cons or 0)
                tp2_opt = float(signal.get("take_profit_2_optimized") or 0)
                tp3_opt = float(signal.get("take_profit_3_optimized") or 0)
                
                tier = signal.get("tier", "free")  # Default to free
                
                # Evaluate BOTH sets of levels against OHLC range
                # Conservative (Free) - only checks SL conservative and TP1 conservative
                free_result = "open"
                free_tp = None
                if entry <= 0: free_result = "skip"
                
                if free_result == "open" and signal_type == "buy":
                    if sl_cons > 0 and min_low <= sl_cons: free_result = "loss"
                    elif tp1_cons > 0 and max_high >= tp1_cons: free_result = "win"; free_tp = 1
                elif free_result == "open" and signal_type == "sell":
                    if sl_cons > 0 and max_high >= sl_cons: free_result = "loss"
                    elif tp1_cons > 0 and min_low <= tp1_cons: free_result = "win"; free_tp = 1
                
                # Optimized (Premium) - checks wider SL and TP ladder
                premium_result = "open"
                premium_tp = None
                
                if premium_result == "open" and signal_type == "buy":
                    if sl_opt > 0 and min_low <= sl_opt: premium_result = "loss"
                    elif tp3_opt > 0 and max_high >= tp3_opt: premium_result = "win"; premium_tp = 3
                    elif tp2_opt > 0 and max_high >= tp2_opt: premium_result = "win"; premium_tp = 2
                    elif tp1_opt > 0 and max_high >= tp1_opt: premium_result = "win"; premium_tp = 1
                elif premium_result == "open" and signal_type == "sell":
                    if sl_opt > 0 and max_high >= sl_opt: premium_result = "loss"
                    elif tp3_opt > 0 and min_low <= tp3_opt: premium_result = "win"; premium_tp = 3
                    elif tp2_opt > 0 and min_low <= tp2_opt: premium_result = "win"; premium_tp = 2
                    elif tp1_opt > 0 and min_low <= tp1_opt: premium_result = "win"; premium_tp = 1
                
                # Store the result for the signal's own tier in the DB
                own_result = free_result if tier == "free" else premium_result
                own_tp = free_tp if tier == "free" else premium_tp
                other_result = premium_result if tier == "free" else free_result
                other_tp = premium_tp if tier == "free" else free_tp
                
                if own_result in ("win", "loss"):
                    now_str = datetime.now(timezone.utc).isoformat()
                    update = {
                        "resolved_result": own_result,
                        "resolved_at": now_str,
                        "resolved_conservative": free_result,
                        "resolved_optimized": premium_result,
                    }
                    if own_tp: update["resolved_tp_hit"] = own_tp
                    supabase_client.table("signals").update(update).eq("id", signal["id"]).execute()
                    verified += 1
                    logger.info(
                        f"Verified {signal['coin']}: {own_result.upper()}"
                        f"{' (TP'+str(own_tp)+')' if own_tp else ' (SL)'}"
                        f" | Free={free_result}{' TP'+str(free_tp) if free_tp and free_result=='win' else ''}"
                        f" | Premium={premium_result}{' TP'+str(premium_tp) if premium_tp and premium_result=='win' else ''}"
                        f" | min_low={min_low:.2f} max_high={max_high:.2f}"
                    )
                else:
                    logger.info(
                        f"Signal {signal['coin']} ({tier}, created {created_str[:16]}): "
                        f"Free={free_result} Premium={premium_result} "
                        f"(min_low={min_low:.2f} max_high={max_high:.2f})"
                    )
                    # Still backfill both columns so frontend can show dual status
                    supabase_client.table("signals").update({
                        "resolved_conservative": free_result,
                        "resolved_optimized": premium_result,
                    }).eq("id", signal["id"]).execute()
    # Also add small delay between signals to avoid CoinGecko rate limiting
            except Exception as e:
                logger.debug(f"Error verifying {signal.get('coin')}: {e}")
            time.sleep(3.0)
        return verified
    except Exception as e:
        logger.error(f"Error in verify_past_signals: {e}")
        return 0


def write_status_json(proxy_count: int = 0, real_count: int = 0, last_error: str = ""):
    """Write heartbeat status file with counters."""
    try:
        # Read existing status to accumulate counters
        old = {"proxy_24h": 0, "real_24h": 0, "errors": []}
        try:
            with open("status.json") as f:
                old = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            pass
        
        # Rotate counters if last run was > 24h ago
        last_ts = old.get("last_run", "")
        if last_ts:
            last_dt = datetime.fromisoformat(last_ts)
            age_h = (datetime.now(timezone.utc) - last_dt).total_seconds() / 3600
            if age_h > 24:
                old["proxy_24h"] = 0
                old["real_24h"] = 0
                old["errors"] = []
        
        old["proxy_24h"] = old.get("proxy_24h", 0) + proxy_count
        old["real_24h"] = old.get("real_24h", 0) + real_count
        if last_error:
            old["errors"] = old.get("errors", []) + [{"time": datetime.now(timezone.utc).isoformat(), "error": last_error}]
            old["errors"] = old["errors"][-50:]  # keep last 50
        
        status = {
            "last_run": datetime.now(timezone.utc).isoformat(),
            "status": "ok",
            "proxy_24h": old["proxy_24h"],
            "real_24h": old["real_24h"],
            "errors": old["errors"],
        }
        with open("status.json", "w") as f:
            json.dump(status, f)
        logger.info(f"Status written: proxy={old['proxy_24h']} real={old['real_24h']}")
    except Exception as e:
        logger.warning(f"Could not write status file: {e}")


def main():
    """Main pipeline execution."""
    logger.info("=" * 50)
    logger.info("NOIRAX Signal Pipeline v3 Starting")
    logger.info("=" * 50)

    # Initialize Supabase
    supabase_client = None
    if SUPABASE_URL and SUPABASE_KEY:
        from supabase import create_client
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("Supabase client initialized")
    else:
        logger.warning("Supabase not configured - running in dry-run mode")

    # Get top coins â€” expanded universe for all duration categories
    coins = get_top_coins(limit=100 if COINGECKO_API_KEY else 50)

    # Filter to only valid Bybit spot symbols (skip filter if instruments unavailable)
    valid_symbols = _get_bybit_valid_symbols()
    if valid_symbols:
        original_count = len(coins)
        coins = [c for c in coins if c["symbol"] in valid_symbols]
        logger.info(f"Filtered {original_count} coins to {len(coins)} with valid Bybit spot symbols")
    else:
        logger.info("Bybit instruments unavailable â€” skipping symbol filter, using all coins")
    logger.info(f"Found {len(coins)} coins with sufficient volume")

    # Detect if the primary market-data sources are blocked (Bybit, then OKX).
    # Only when BOTH fail do we degrade to simplified CoinGecko analysis.
    market_data_blocked = bybit_klines("BTCUSDT", DEFAULT_TIMEFRAME, 3) is None
    if market_data_blocked:
        market_data_blocked = okx_klines("BTCUSDT", DEFAULT_TIMEFRAME, 3) is None
        if not market_data_blocked:
            logger.info("Bybit blocked, OKX reachable â€” per-coin fallback inside get_klines() will handle the rest")
    if market_data_blocked:
        logger.info("Bybit & OKX both blocked â€” using simplified analysis from CoinGecko market data")
        # Expand coin universe based on API key availability
        if COINGECKO_API_KEY:
            max_analysis_coins = min(len(coins), 100)
        else:
            max_analysis_coins = min(len(coins), int(os.environ.get("TECH_TOP_COINS_FREE", "15")) + 5)
        coins = coins[:max_analysis_coins]

    # Build coin_id map for CoinGecko fallback and price lookups
    coin_id_map = {c["symbol"]: c.get("coingecko_id", "") for c in coins}
    # Also build a dict for fast coin lookup by symbol
    coin_dict = {c["symbol"]: c for c in coins}

    free_coins = [c["symbol"] for c in coins[:TOP_COINS_FREE]]
    premium_coins = [c["symbol"] for c in coins[TOP_COINS_FREE:]]

    # Mejora 5: market regime from BTC's 24h move (CoinGecko data already loaded)
    btc_change_24h = 0.0
    btc_data = coin_dict.get("BTCUSDT")
    if btc_data:
        btc_change_24h = btc_data.get("price_change_percentage_24h", 0) or 0
    logger.info(f"Market regime: BTC 24h change = {btc_change_24h:.2f}% (down gate {MARKET_REGIME_DOWN_PCT}%, up gate {MARKET_REGIME_UP_PCT}%)")

    all_analyses = []
    timestamp = datetime.now(timezone.utc).isoformat()

    # First pass: technical + fundamental analysis
    for coin_symbol in free_coins + premium_coins:
        cg_id = coin_id_map.get(coin_symbol, "")
        try:
            if market_data_blocked:
                # Simplified analysis using CoinGecko market data (bulk, no per-coin API calls)
                coin_data = coin_dict.get(coin_symbol)
                if not coin_data:
                    continue
                analysis = calculate_simple_signal(coin_data)
                if analysis is None:
                    continue
            else:
                # Full analysis using Bybit/OKX OHLC klines
                df = get_klines(coin_symbol, interval=DEFAULT_TIMEFRAME)
                if df.empty or len(df) < 50:
                    continue
                analysis = calculate_indicators(df)
                if analysis["signal_type"] == "neutral":
                    continue

            # Fundamental analysis (all 4 sources)
            if market_data_blocked:
                fund_result = analyze_fundamental(coin_symbol, coin_data.get("name", ""), coin_data)
            else:
                fund_result = analyze_fundamental(coin_symbol)

            # Hard block: never emit a signal for a coin with critical news
            # (delisting, bankruptcy, exploit, hack alerts)
            if "NEWS_CRITICAL" in (fund_result.get("tags") or []):
                logger.warning(f"Skipping {coin_symbol}: NEWS_CRITICAL detected (delisting/hack/exploit risk)")
                continue

            # Adjust confidence based on fundamental alignment
            fund_score = fund_result["score"]
            if fund_score > 0 and analysis["signal_type"] == "buy":
                analysis["confidence"] = min(95, analysis["confidence"] + 10)
            elif fund_score < 0 and analysis["signal_type"] == "sell":
                analysis["confidence"] = min(95, analysis["confidence"] + 10)
            elif fund_score < 0 and analysis["signal_type"] == "buy":
                analysis["confidence"] = max(5, analysis["confidence"] - 10)
            elif fund_score > 0 and analysis["signal_type"] == "sell":
                analysis["confidence"] = max(5, analysis["confidence"] - 10)

            # Mejora 4: minimum confidence gate — weak signals are skipped
            if analysis["confidence"] < MIN_CONFIDENCE:
                logger.info(f"Skipping {coin_symbol}: confidence {analysis['confidence']}% < {MIN_CONFIDENCE}%")
                continue

            # Mejora 5: market regime filter — no buys in a falling market,
            # no sells in a rising one
            if btc_change_24h < -MARKET_REGIME_DOWN_PCT and analysis["signal_type"] == "buy":
                logger.info(f"Skipping {coin_symbol}: buy suppressed, market down {btc_change_24h:.1f}%")
                continue
            if btc_change_24h > MARKET_REGIME_UP_PCT and analysis["signal_type"] == "sell":
                logger.info(f"Skipping {coin_symbol}: sell suppressed, market up {btc_change_24h:.1f}%")
                continue

            # Enhance with real OHLC data for signal coins only
            if market_data_blocked:
                cg_id = coin_data.get("coingecko_id", "")
                if cg_id:
                    vol_24h = coin_data.get("volume_24h", 0) or 0
                    logger.info(f"Fetching real OHLC for {coin_symbol} (id={cg_id})...")
                    enhanced = enhance_with_real_ohlc(analysis, coin_symbol, cg_id, vol_24h)
                    if enhanced != analysis:
                        logger.info(f"Enhanced {coin_symbol} with real OHLC indicators")
                    analysis = enhanced

            # Calculate dual TP/SL levels for the snapshot analysis (used as fallback)
            tps = calculate_dual_tps(analysis["current_price"], analysis["atr"], analysis["signal_type"])

            tier = "free" if coin_symbol in free_coins else "premium"
            coin_display = coin_symbol.replace("USDT", "/USDT")

            # Multi-timeframe analysis: generate signals for 15min, 1h, and daily timeframes
            timeframe_signals = generate_multi_timeframe_signals(
                coin_symbol, cg_id, tier, fund_result, timestamp, coin_display,
                volume_24h=coin_data.get("volume_24h", 0) if market_data_blocked and coin_data else 0
            )

            if timeframe_signals:
                all_analyses.extend(timeframe_signals)
            else:
                # Fallback: if no timeframe triggered, use snapshot analysis as swing
                analysis["duration_type"] = "swing"
                all_analyses.append({
                    "coin": coin_display, "coin_symbol": coin_symbol,
                    "tier": tier, "analysis": analysis, "tps": tps,
                    "fundamental": fund_result, "timestamp": timestamp,
                    "coingecko_id": cg_id, "duration_type": "swing",
                })

        except Exception as e:
            logger.error(f"Error analyzing {coin_symbol}: {e}")
            continue

    logger.info(f"Found {len(all_analyses)} non-neutral signals")

    # Single Gemini call for all explanations (with fundamental context)
    ai_explanations = None
    if all_analyses:
        gemini_input = []
        for a in all_analyses:
            item = {
                "coin": a["coin"],
                "signal_type": str(a["analysis"]["signal_type"]),
                "rsi": float(a["analysis"]["rsi"]),
                "macd_bullish": bool(a["analysis"]["macd_bullish"]),
                "sma_bullish": bool(a["analysis"]["sma_bullish"]),
                "volume_spike": bool(a["analysis"]["volume_spike"]),
                "indicators_used": list(a["analysis"]["indicators_used"]),
                "fundamental_tags": list(a["fundamental"]["tags"]),
                "fundamental_score": int(a["fundamental"]["score"]),
            }
            gemini_input.append(item)
        ai_explanations = call_gemini_batch(gemini_input)
        if ai_explanations:
            logger.info("Gemini batch call succeeded")
        else:
            logger.info("Gemini call failed, using fallback templates")

    # Build signal data
    for item in all_analyses:
        analysis = item["analysis"]
        coin = item["coin"]
        tier = item["tier"]
        tps = item["tps"]
        fund_result = item["fundamental"]

        slug = create_slug(coin, analysis["signal_type"], timestamp, item.get("duration_type", "swing"))

        if ai_explanations and coin in ai_explanations:
            explanations = sanitize_explanations(
                ai_explanations[coin],
                generate_fallback_explanations(coin, analysis, fund_result),
            )
        else:
            explanations = generate_fallback_explanations(coin, analysis, fund_result)

        # Skip signals whose coin is not a real BASE/USDT symbol (Gemini/template garbage).
        if not _VALID_COIN_PATTERN.match(coin):
            logger.warning(f"Skipping {coin}: invalid coin symbol")
            continue

        # Dual TP/SL: free gets conservative, premium gets optimized
        if tier == "free":
            stop_loss = tps["stop_loss_conservative"]
            tp1 = tps["take_profit_1_conservative"]
            tp2 = None
            tp3 = None
            rr = tps["risk_reward_conservative"]
        else:
            stop_loss = tps["stop_loss_optimized"]
            tp1 = tps["take_profit_1_optimized"]
            tp2 = tps["take_profit_2_optimized"]
            tp3 = tps["take_profit_3_optimized"]
            rr = tps["risk_reward_optimized"]

        signal_data = {
            "coin": coin,
            "exchange": "bybit",
            "signal_type": analysis["signal_type"],
            "confidence": analysis["confidence"],
            "explanation_en": explanations.get("en", ""),
            "explanation_es": explanations.get("es", ""),
            "explanation_pt": explanations.get("pt", ""),
            "explanation_fr": explanations.get("fr", ""),
            "explanation_de": explanations.get("de", ""),
            "explanation_it": explanations.get("it", ""),
            "explanation_ar": explanations.get("ar", ""),
            "tier": tier,
            "entry_price": analysis["current_price"],
            "entry_price_min": tps["entry_price_min"],
            "entry_price_max": tps["entry_price_max"],
            "stop_loss": stop_loss,
            "take_profit": tp1,
            "take_profit_1": tp1,
            "take_profit_2": tp2,
            "take_profit_3": tp3,
            "risk_reward_ratio": rr,
            "risk_level": tps["risk_level"],
            "indicators_used": analysis["indicators_used"],
            "fundamental_signals": fund_result["tags"],
            "timeframe": DEFAULT_TIMEFRAME,
            "resolved_result": "pending",
            "slug": slug,
            "coingecko_id": item.get("coingecko_id", ""),
            # Both conservative and optimized levels stored for frontend differentiation
            "stop_loss_conservative": tps["stop_loss_conservative"],
            "take_profit_1_conservative": tps["take_profit_1_conservative"],
            "stop_loss_optimized": tps["stop_loss_optimized"],
            "take_profit_1_optimized": tps["take_profit_1_optimized"],
            "take_profit_2_optimized": tps["take_profit_2_optimized"],
            "take_profit_3_optimized": tps["take_profit_3_optimized"],
            "duration_type": item.get("duration_type", "swing"),
        }

        if supabase_client:
            insert_signal(supabase_client, signal_data)

    # Verify past signals
    if supabase_client:
        verified = verify_past_signals(supabase_client)
        logger.info(f"Verified {verified} past signals")

    # Track proxy vs real indicator usage
    proxy_count = sum(1 for a in all_analyses if "(proxy)" in str(a["analysis"].get("indicators_used", [])))
    real_count = len(all_analyses) - proxy_count

    # Weekly blog summary (reuses Gemini call, no extra quota)
    weekly_blog = None
    if supabase_client:
        weekly_blog = generate_weekly_summary(supabase_client)

    # Write heartbeat
    write_status_json(proxy_count=proxy_count, real_count=real_count)

    logger.info(f"Pipeline complete: {len(all_analyses)} signals")
    return len(all_analyses)


if __name__ == "__main__":
    main()
