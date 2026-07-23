#!/usr/bin/env python3
"""
NOIRAX Signal Pipeline v3
Technical + Fundamental analysis, single Gemini call per run,
7-language explanations, dual TP/SL (conservative for free, optimized for premium).
"""

import os
import sys
import json
import time
import logging
from datetime import datetime, timezone
from typing import Optional

import requests
import pandas as pd
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fundamental_analysis import analyze_fundamental

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("noirax-pipeline")

# --- Configuration ---
BINANCE_BASE = os.environ.get("BINANCE_BASE", "https://api.binance.com")
BINANCE_FALLBACKS = ["https://api1.binance.com", "https://api2.binance.com", "https://api3.binance.com"]
COINGECKO_BASE = "https://api.coingecko.com/api/v3"
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
AI_PROVIDER = os.environ.get("AI_PROVIDER", "gemini")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
MIN_VOLUME_24H = int(os.environ.get("SIGNALS_MIN_VOLUME_24H_USD", "999999999"))
TOP_COINS_FREE = int(os.environ.get("TECH_TOP_COINS_FREE", "0"))
DEFAULT_TIMEFRAME = "1h"
GEMINI_MODEL = "models/gemini-2.5-flash-lite"

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

# Valid Binance symbols cache (populated on first use)
_VALID_BINANCE_SYMBOLS: Optional[set] = None


def _try_all_binance_hosts(endpoint: str, params: Optional[dict] = None, timeout: int = 30) -> Optional[dict]:
    """Try Binance API across all hosts (main + fallbacks), return first success."""
    hosts = [BINANCE_BASE] + BINANCE_FALLBACKS
    last_error = None
    for host in hosts:
        url = f"{host}{endpoint}"
        try:
            resp = requests.get(url, params=params, timeout=timeout)
            if resp.status_code == 451:
                logger.debug(f"451 on {host}{endpoint[:30]} — trying alternate host")
                continue
            if resp.status_code == 429:
                continue
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as e:
            last_error = e
            logger.debug(f"Failed {host}: {e}")
            continue
    if last_error:
        raise last_error
    return None


def _get_valid_binance_symbols() -> set:
    """Fetch valid Binance spot symbols from exchangeInfo. Cached."""
    global _VALID_BINANCE_SYMBOLS
    if _VALID_BINANCE_SYMBOLS is not None:
        return _VALID_BINANCE_SYMBOLS
    try:
        data = _try_all_binance_hosts("/api/v3/exchangeInfo", timeout=30)
        if data:
            _VALID_BINANCE_SYMBOLS = {s["symbol"] for s in data.get("symbols", []) if s.get("status") == "TRADING"}
            logger.info(f"Loaded {len(_VALID_BINANCE_SYMBOLS)} valid Binance symbols")
        else:
            raise ValueError("All hosts failed")
    except Exception as e:
        logger.warning(f"Failed to load exchangeInfo, using fallback: {e}")
        _VALID_BINANCE_SYMBOLS = set()
    return _VALID_BINANCE_SYMBOLS


def binance_request(endpoint: str, params: Optional[dict] = None) -> dict:
    """Make request to Binance API with retry and exponential backoff across all hosts."""
    for attempt in range(3):
        try:
            return _try_all_binance_hosts(endpoint, params, timeout=30) or {}
        except requests.RequestException as e:
            if attempt < 2:
                wait = 2 ** attempt * 5
                logger.warning(f"Request failed ({e}), retrying in {wait}s...")
                time.sleep(wait)
            else:
                logger.error(f"Request failed after 3 attempts: {e}")
                return {}
    return {}


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
    """Fetch OHLCV klines from Binance, falls back to CoinGecko OHLC if Binance is blocked."""
    data = binance_request("/api/v3/klines", {
        "symbol": symbol,
        "interval": interval,
        "limit": limit,
    })
    if data:
        df = pd.DataFrame(data, columns=[
            "timestamp", "open", "high", "low", "close", "volume",
            "close_time", "quote_asset_volume", "number_of_trades",
            "taker_buy_base_vol", "taker_buy_quote_vol", "ignore"
        ])
        df = df[["timestamp", "open", "high", "low", "close", "volume"]]
        for col in ["open", "high", "low", "close", "volume"]:
            df[col] = pd.to_numeric(df[col], errors="coerce")
        df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
        return df

    # Fallback: try CoinGecko OHLC (frees data source that works from GitHub Actions)
    if coingecko_id:
        try:
            interval_map = {"1h": 1, "4h": 7, "1d": 30}
            days = interval_map.get(interval, 3)
            resp = requests.get(
                f"{COINGECKO_BASE}/coins/{coingecko_id}/ohlc",
                params={"vs_currency": "usd", "days": days},
                timeout=15,
            )
            logger.debug(f"CoinGecko OHLC for {symbol} ({coingecko_id}): HTTP {resp.status_code}")
            if resp.status_code == 429:
                logger.warning(f"CoinGecko rate limited on {symbol}, waiting 3s...")
                time.sleep(3)
                resp = requests.get(
                    f"{COINGECKO_BASE}/coins/{coingecko_id}/ohlc",
                    params={"vs_currency": "usd", "days": days},
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


def calculate_indicators(df: pd.DataFrame) -> dict:
    """Calculate technical indicators and return signal assessment."""
    close = df["close"].values
    high = df["high"].values
    low = df["low"].values
    volume = df["volume"].values

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
                params={"vs_currency": "usd", "days": days},
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


def enhance_with_real_ohlc(analysis: dict, coin_symbol: str, coingecko_id: str) -> dict:
    """Replace proxy indicator values with real OHLC-calculated ones if available.
    
    Takes the simplified analysis dict and upgrades it with real technical indicators
    from CoinGecko OHLC data. Returns original analysis if OHLC unavailable.
    """
    df = fetch_coingecko_ohlc(coingecko_id, DEFAULT_TIMEFRAME)
    if df is None or df.empty:
        return analysis
    
    real = calculate_indicators(df)
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
Do NOT reveal exact thresholds, weights, or specific data sources — use general terms like "market analysis", "on-chain activity", "news sentiment".

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
                wait = 2 ** attempt * 10
                logger.warning(f"Gemini 429, backoff {wait}s...")
                time.sleep(wait)
                continue
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


def generate_fallback_explanations(coin: str, analysis: dict, fund_result: dict) -> dict:
    """Generate template-based explanations in all 7 languages when AI fails."""
    templates = {
        "en": "{coin} shows a {type} setup with RSI at {rsi}. {fund_ctx} Educational content — not financial advice.",
        "es": "{coin} muestra un setup {type_es} con RSI en {rsi}. {fund_ctx} Contenido educativo.",
        "pt": "{coin} mostra um setup {type_pt} com RSI em {rsi}. {fund_ctx} Conteúdo educativo.",
        "fr": "{coin} montre un setup {type_fr} avec RSI à {rsi}. {fund_ctx} Contenu éducatif.",
        "de": "{coin} zeigt ein {type_de} Setup mit RSI bei {rsi}. {fund_ctx} Bildungsinhalt.",
        "it": "{coin} mostra un setup {type_it} con RSI a {rsi}. {fund_ctx} Contenuto educativo.",
        "ar": "{coin} يظهر إعداد {type_ar} مع RSI عند {rsi}. {fund_ctx} محتوى تعليمي.",
    }
    type_map = {
        "buy": {"en": "bullish", "es": "alcista", "pt": "altista", "fr": "haussier", "de": "bullishes", "it": "rialzista", "ar": "صاعد"},
        "sell": {"en": "bearish", "es": "bajista", "pt": "baixista", "fr": "baissier", "de": "bärisches", "it": "ribassista", "ar": "هابط"},
    }
    # Fundamental context (generic terms only)
    tags = fund_result.get("tags", [])
    fund_ctx = ""
    if "NEWS_POSITIVE" in tags:
        fund_ctx = "Positive news sentiment detected."
    elif "NEWS_NEGATIVE" in tags:
        fund_ctx = "Negative news sentiment detected."
    elif "NEWS_CRITICAL" in tags:
        fund_ctx = "Critical news alert — exercise caution."
    if "WHALE_ACTIVITY" in tags:
        fund_ctx += " Large holder activity detected."
    if "VOLUME_ANOMALY" in tags:
        fund_ctx += " Unusual trading volume observed."
    if "FUNDING_RATE_HIGH" in tags:
        fund_ctx += " Elevated funding rate — potential correction."
    elif "FUNDING_RATE_LOW" in tags:
        fund_ctx += " Low funding rate — potential bounce."
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
    """Insert a signal into Supabase."""
    try:
        supabase_client.table("signals").insert(signal_data).execute()
        logger.info(f"Signal inserted: {signal_data['coin']} {signal_data['signal_type']}")
        return True
    except Exception as e:
        logger.error(f"Failed to insert signal: {e}")
        return False


def calculate_simple_signal(coin: dict) -> Optional[dict]:
    """Generate signal from CoinGecko market data (used when Binance is blocked)."""
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

    if change_7d > 5 and change_24h > 0:
        signals_list.append("macd_bullish")
        confidence += CONFIDENCE_MACD
    elif change_7d < -5 and change_24h < 0:
        signals_list.append("macd_bearish")
        confidence -= CONFIDENCE_MACD

    if vol_to_mcap > 0.1:
        signals_list.append("volume_spike")
        confidence += CONFIDENCE_VOLUME

    if change_7d < -10:
        signals_list.append("near_support")
        confidence += CONFIDENCE_SUPPORT
    elif change_7d > 10:
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
        "volume_spike": vol_to_mcap > 0.1,
        "current_price": price,
        "recent_high": price * (1 + abs(change_24h / 100)),
        "recent_low": price * (1 - abs(change_24h / 100)),
        "atr": atr,
        "volatility": abs(change_24h) / 100,
        "indicators_used": indicators_used,
    }


def create_slug(coin: str, signal_type: str, timestamp: str) -> str:
    """Create SEO-friendly URL slug for a signal."""
    coin_clean = coin.replace("/", "-").lower()
    ts_formatted = datetime.fromisoformat(timestamp).strftime("%Y-%m-%d-%H%M") if timestamp else datetime.now(timezone.utc).strftime("%Y-%m-%d-%H%M")
    return f"{coin_clean}-{signal_type}-{ts_formatted}"


def verify_past_signals(supabase_client) -> int:
    """Check past pending signals against current price and mark resolved by TP/SL hit."""
    try:
        pending = supabase_client.table("signals").select("*").eq("resolved_result", "pending").execute()
        verified = 0
        for signal in pending.data if hasattr(pending, 'data') else []:
            try:
                coin_symbol = signal["coin"].replace("/USDT", "USDT")
                coin_name = signal["coin"].replace("/USDT", "").lower()
                # Use CoinGecko for current price (works everywhere, no auth)
                resp = requests.get(
                    f"{COINGECKO_BASE}/simple/price",
                    params={"ids": coin_name, "vs_currencies": "usd"},
                    timeout=10,
                )
                if resp.status_code != 200:
                    continue
                price_data = resp.json()
                if not price_data or coin_name not in price_data:
                    continue
                current_price = price_data[coin_name]["usd"]
                
                entry = float(signal.get("entry_price") or 0)
                sl = float(signal.get("stop_loss") or 0)
                tp1 = float(signal.get("take_profit_1") or 0)
                tp2 = float(signal.get("take_profit_2") or 0)
                tp3 = float(signal.get("take_profit_3") or 0)
                signal_type = signal.get("signal_type", "buy")

                if entry <= 0:
                    continue

                result = "open"
                hit_tp = None

                if signal_type == "buy":
                    if sl > 0 and current_price <= sl:
                        result = "loss"
                    elif tp3 > 0 and current_price >= tp3:
                        result = "win"; hit_tp = 3
                    elif tp2 > 0 and current_price >= tp2:
                        result = "win"; hit_tp = 2
                    elif tp1 > 0 and current_price >= tp1:
                        result = "win"; hit_tp = 1
                else:
                    if sl > 0 and current_price >= sl:
                        result = "loss"
                    elif tp3 > 0 and current_price <= tp3:
                        result = "win"; hit_tp = 3
                    elif tp2 > 0 and current_price <= tp2:
                        result = "win"; hit_tp = 2
                    elif tp1 > 0 and current_price <= tp1:
                        result = "win"; hit_tp = 1

                if result != "open":
                    update = {
                        "resolved_result": result,
                        "resolved_at": datetime.now(timezone.utc).isoformat(),
                        "resolved_price": current_price,
                    }
                    if hit_tp:
                        update["resolved_tp_hit"] = hit_tp
                    supabase_client.table("signals").update(update).eq("id", signal["id"]).execute()
                    verified += 1
                    logger.info(f"Verified {signal['coin']}: {result} (TP{hit_tp if hit_tp else 'SL'}) @ {current_price}")
            except Exception as e:
                logger.debug(f"Error verifying {signal.get('coin')}: {e}")
        return verified
    except Exception as e:
        logger.error(f"Error in verify_past_signals: {e}")
        return 0


def write_status_json():
    """Write heartbeat status file for cron anti-desactivation."""
    try:
        status = {"last_run": datetime.now(timezone.utc).isoformat(), "status": "ok"}
        with open("status.json", "w") as f:
            json.dump(status, f)
        logger.info("Status file written")
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

    # Get top coins
    coins = get_top_coins(limit=50)

    # Filter to only valid Binance symbols (skip filter if exchangeInfo unavailable)
    valid_symbols = _get_valid_binance_symbols()
    if valid_symbols:
        original_count = len(coins)
        coins = [c for c in coins if c["symbol"] in valid_symbols]
        logger.info(f"Filtered {original_count} coins to {len(coins)} with valid Binance symbols")
    else:
        logger.info("Binance exchangeInfo unavailable — skipping symbol filter, using all coins")
    logger.info(f"Found {len(coins)} coins with sufficient volume")

    # Detect if Binance is geo-blocked (common on GitHub Actions)
    binance_blocked = False
    test_data = binance_request("/api/v3/klines", {"symbol": "BTCUSDT", "interval": "1h", "limit": 3})
    if not test_data:
        binance_blocked = True
        logger.info("Binance API blocked — using simplified analysis from CoinGecko market data (no per-coin OHLC calls)")
        # Limit coin count (free + 5 premium is manageable without rate limits)
        max_simple_coins = int(os.environ.get("TECH_TOP_COINS_FREE", "15")) + 5
        coins = coins[:max_simple_coins]
        logger.info(f"Limited to {len(coins)} coins for simplified analysis")

    # Build coin_id map for CoinGecko fallback
    coin_id_map = {c["symbol"]: c.get("coingecko_id", "") for c in coins}
    # Also build a dict for fast coin lookup by symbol
    coin_dict = {c["symbol"]: c for c in coins}

    free_coins = [c["symbol"] for c in coins[:TOP_COINS_FREE]]
    premium_coins = [c["symbol"] for c in coins[TOP_COINS_FREE:]]

    all_analyses = []
    timestamp = datetime.now(timezone.utc).isoformat()

    # First pass: technical + fundamental analysis
    for coin_symbol in free_coins + premium_coins:
        try:
            if binance_blocked:
                # Simplified analysis using CoinGecko market data (bulk, no per-coin API calls)
                coin_data = coin_dict.get(coin_symbol)
                if not coin_data:
                    continue
                analysis = calculate_simple_signal(coin_data)
                if analysis is None:
                    continue
            else:
                # Full analysis using Binance OHLC klines
                df = get_klines(coin_symbol, interval=DEFAULT_TIMEFRAME)
                if df.empty or len(df) < 50:
                    continue
                analysis = calculate_indicators(df)
                if analysis["signal_type"] == "neutral":
                    continue

            # Fundamental analysis (all 4 sources)
            if binance_blocked:
                fund_result = analyze_fundamental(coin_symbol, coin_data.get("name", ""), coin_data)
            else:
                fund_result = analyze_fundamental(coin_symbol)

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

            # Enhance with real OHLC data for signal coins only
            if binance_blocked:
                cg_id = coin_data.get("coingecko_id", "")
                if cg_id:
                    logger.info(f"Fetching real OHLC for {coin_symbol} (id={cg_id})...")
                    enhanced = enhance_with_real_ohlc(analysis, coin_symbol, cg_id)
                    if enhanced != analysis:
                        logger.info(f"Enhanced {coin_symbol} with real OHLC indicators")
                    analysis = enhanced

            # Calculate dual TP/SL levels
            tps = calculate_dual_tps(analysis["current_price"], analysis["atr"], analysis["signal_type"])

            tier = "free" if coin_symbol in free_coins else "premium"
            coin_display = coin_symbol.replace("USDT", "/USDT")

            all_analyses.append({
                "coin": coin_display,
                "coin_symbol": coin_symbol,
                "tier": tier,
                "analysis": analysis,
                "tps": tps,
                "fundamental": fund_result,
                "timestamp": timestamp,
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

        slug = create_slug(coin, analysis["signal_type"], timestamp)

        if ai_explanations and coin in ai_explanations:
            explanations = ai_explanations[coin]
        else:
            explanations = generate_fallback_explanations(coin, analysis, fund_result)

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
            "exchange": "binance",
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
            # Both conservative and optimized levels stored for frontend differentiation
            "stop_loss_conservative": tps["stop_loss_conservative"],
            "take_profit_1_conservative": tps["take_profit_1_conservative"],
            "stop_loss_optimized": tps["stop_loss_optimized"],
            "take_profit_1_optimized": tps["take_profit_1_optimized"],
            "take_profit_2_optimized": tps["take_profit_2_optimized"],
            "take_profit_3_optimized": tps["take_profit_3_optimized"],
        }

        if supabase_client:
            insert_signal(supabase_client, signal_data)

    # Verify past signals
    if supabase_client:
        verified = verify_past_signals(supabase_client)
        logger.info(f"Verified {verified} past signals")

    # Write heartbeat
    write_status_json()

    logger.info(f"Pipeline complete: {len(all_analyses)} signals")
    return len(all_analyses)


if __name__ == "__main__":
    main()
