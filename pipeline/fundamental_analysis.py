"""
NOIRAX Fundamental Analysis Module
Free, no API keys required. Adapts OmniBot v4 patterns for signal generation.

4 sources:
  1. News sentiment (RSS: CoinTelegraph + BitcoinMagazine)
  2. Whale detection (blockchain.info — BTC ONLY, documented limitation)
  3. Funding rates (Binance Futures public endpoint)
  4. Volume anomalies (Binance 24hr ticker)

All combined into a single score (-2 to +2) with descriptive tags.
"""

import logging
import time
import os
import requests
from typing import Optional

logger = logging.getLogger("noirax-fundamental")

# --- Proprietary parameters from environment (GitHub Secrets) ---
WHALE_THRESHOLD_BTC = float(os.environ.get("FUND_WHALE_THRESHOLD_BTC", "999.0"))
FUNDING_RATE_HIGH = float(os.environ.get("FUND_FUNDING_RATE_HIGH", "0.5"))
FUNDING_RATE_LOW = float(os.environ.get("FUND_FUNDING_RATE_LOW", "-0.5"))
FUNDING_RATE_ELEVATED = float(os.environ.get("FUND_FUNDING_RATE_ELEVATED", "0.1"))
VOLUME_QUOTE_THRESHOLD = float(os.environ.get("FUND_VOLUME_QUOTE_THRESHOLD", "999999999"))
VOLUME_PRICE_CHANGE_PCT = float(os.environ.get("FUND_VOLUME_PRICE_CHANGE_PCT", "100.0"))
VOLUME_ELEVATED_CHANGE_PCT = float(os.environ.get("FUND_VOLUME_ELEVATED_CHANGE_PCT", "50.0"))
SCORE_CLAMP_HIGH = int(os.environ.get("FUND_SCORE_CLAMP_HIGH", "10"))
SCORE_CLAMP_MEDIUM = int(os.environ.get("FUND_SCORE_CLAMP_MEDIUM", "5"))
SCORE_CLAMP_NEG_HIGH = int(os.environ.get("FUND_SCORE_CLAMP_NEG_HIGH", "-10"))
SCORE_CLAMP_NEG_MEDIUM = int(os.environ.get("FUND_SCORE_CLAMP_NEG_MEDIUM", "-5"))
NEWS_BULL_MIN_COUNT = int(os.environ.get("FUND_NEWS_BULL_MIN_COUNT", "99"))

# --- RSS keyword lists (from OmniBot v4) ---
BULLISH_WORDS = [
    "partnership", "listing", "upgrade", "bull", "pump", "surge",
    "adoption", "institutional", "etf", "approval", "rally", "breakout",
    "milestone", "all-time high", "ath", "accumulation",
]
BEARISH_WORDS = [
    "hack", "scam", "lawsuit", "dump", "crash", "bearish",
    "regulation", "ban", "sec", "exploit", "vulnerability", "sell-off",
    "decline", "collapse", "bankruptcy", "delisting",
]
CRITICAL_WORDS = ["delisting", "bankruptcy", "exploit", "hack"]

RSS_FEEDS = [
    "https://cointelegraph.com/rss",
    "https://www.bitcoinmagazine.com/.rss/full/",
    "https://www.coindesk.com/arc/outboundfeeds/rss/",
]

HEADERS = {"User-Agent": "Mozilla/5.0 (NOIRAX Signal Bot; educational)"}

# Binance Futures funding rate endpoint
BINANCE_FUTURES_BASE = "https://fapi.binance.com"

logger.info("Fundamental analysis module loaded")


def _safe_request(url: str, params: Optional[dict] = None, timeout: int = 10) -> Optional[requests.Response]:
    """Request with retry and backoff."""
    headers = HEADERS
    if "bitcoinmagazine" in url or "cointelegraph" in url or "coindesk" in url:
        headers = {**HEADERS, "Accept": "application/rss+xml, application/xml, text/xml"}
    for attempt in range(3):
        try:
            resp = requests.get(url, params=params, timeout=timeout, headers=headers)
            if resp.status_code == 429:
                wait = min(2 ** attempt * 5, 30)
                logger.warning(f"Rate limited on {url}, waiting {wait}s")
                time.sleep(wait)
                continue
            if resp.status_code == 200:
                return resp
            if resp.status_code == 400:
                logger.debug(f"Bad request for {url} — symbol may not be supported")
                return None
            if resp.status_code == 403:
                logger.debug(f"Access denied for {url} — may be blocked")
                return None
            logger.warning(f"HTTP {resp.status_code} from {url}")
            return None
        except requests.RequestException as e:
            if attempt < 2:
                time.sleep(2 ** attempt * 2)
            else:
                logger.warning(f"Request failed for {url}: {e}")
                return None
    return None


# ============================================================
# 1. NEWS SENTIMENT (RSS)
# ============================================================

def _analyze_news_sentiment(symbol: str, coin_name: str = "") -> tuple[int, list[str]]:
    """
    Scan crypto RSS feeds for mentions of the coin.
    Returns (score_delta, tags). Score range: -3 to +3.
    """
    token = symbol.replace("USDT", "").replace("USDC", "").lower()
    alternative_names = [token]
    if coin_name:
        alt = coin_name.lower().replace(" ", "-").replace("coin", "").strip()
        if alt and alt != token:
            alternative_names.append(alt)
    score = 0
    tags = []
    rss_text = ""

    for feed_url in RSS_FEEDS:
        try:
            resp = _safe_request(feed_url, timeout=8)
            if resp is None:
                logger.info(f"RSS feed {feed_url.split('/')[2]} returned no response")
                continue
            import xml.etree.ElementTree as ET
            root = ET.fromstring(resp.text)
            for item in root.findall(".//item")[:10]:
                title = item.findtext("title", "")
                description = item.findtext("description", "")
                combined = (title + " " + description).lower()
                for name in alternative_names:
                    if name in combined and len(name) >= 2:
                        rss_text += combined + " "
                        break
        except Exception as e:
            logger.info(f"RSS parse error for {feed_url}: {e}")

    if not rss_text:
        return 0, []

    # Check critical words first (veto)
    for word in CRITICAL_WORDS:
        if word in rss_text:
            return -3, ["NEWS_CRITICAL"]

    bull_count = sum(1 for w in BULLISH_WORDS if w in rss_text)
    bear_count = sum(1 for w in BEARISH_WORDS if w in rss_text)

    if bull_count > bear_count and bull_count >= NEWS_BULL_MIN_COUNT:
        score = min(SCORE_CLAMP_HIGH, bull_count)
        tags.append("NEWS_POSITIVE")
    elif bear_count > bull_count and bear_count >= NEWS_BULL_MIN_COUNT:
        score = max(SCORE_CLAMP_NEG_HIGH, -bear_count)
        tags.append("NEWS_NEGATIVE")
    else:
        tags.append("NEWS_NEUTRAL")

    return score, tags


# ============================================================
# 2. WHALE DETECTION (blockchain.info — BTC ONLY)
# ============================================================

def _detect_whale_activity(symbol: str) -> tuple[int, list[str]]:
    """
    Detect large BTC transactions via blockchain.info.
    ONLY works for BTCUSDT. For all other coins, returns (0, [])
    with a clear limitation documented in the code.

    Limitation: On-chain whale detection requires chain-specific APIs.
    Bitcoin is covered via blockchain.info. For altcoins, volume anomaly
    detection serves as a proxy for whale activity. This is a known
    limitation — do NOT remove this comment.
    """
    token = symbol.replace("USDT", "").replace("USDC", "").upper()

    # Only BTC is supported for on-chain whale detection
    if token != "BTC":
        return 0, []

    try:
        resp = _safe_request(
            "https://blockchain.info/unconfirmed-transactions?format=json",
            timeout=10,
        )
        if resp is None:
            return 0, []

        data = resp.json()
        txs = data.get("txs", [])
        large_tx_count = 0

        for tx in txs[:50]:  # Check top 50 unconfirmed txs
            total_out_sat = sum(o.get("value", 0) for o in tx.get("out", []))
            total_btc = total_out_sat / 1e8
            if total_btc >= WHALE_THRESHOLD_BTC:
                large_tx_count += 1

        if large_tx_count >= 3:
            return 2, ["WHALE_ACTIVITY"]
        elif large_tx_count >= 1:
            return 1, ["WHALE_ACTIVITY"]

    except Exception as e:
        logger.debug(f"Whale detection error: {e}")

    return 0, []


# ============================================================
# 3. FUNDING RATES (Binance Futures)
# ============================================================

def _check_funding_rate(symbol: str) -> tuple[int, list[str]]:
    """Check funding rate from Bybit/OKX public API (works from GitHub Actions, no geo-block)."""
    token = symbol.replace("USDT", "").upper()
    try:
        resp = _safe_request(
            f"https://api.bybit.com/v5/market/tickers",
            params={"category": "linear", "symbol": f"{token}USDT"},
            timeout=8,
        )
        if resp is not None:
            data = resp.json()
            if data.get("retCode") == 0:
                ticker = data.get("result", {}).get("list", [{}])[0]
                fr = float(ticker.get("fundingRate", 0))
                score = 0
                tags = []
                if fr > FUNDING_RATE_HIGH:
                    score = -1
                    tags.append("FUNDING_RATE_HIGH")
                elif fr < FUNDING_RATE_LOW:
                    score = 1
                    tags.append("FUNDING_RATE_LOW")
                elif fr > FUNDING_RATE_ELEVATED:
                    tags.append("FUNDING_RATE_ELEVATED")
                return score, tags
        logger.info(f"Bybit funding rate unavailable for {symbol}, trying OKX...")
        resp2 = _safe_request(
            f"https://www.okx.com/api/v5/public/funding-rate",
            params={"instId": f"{token}-USDT-SWAP"},
            timeout=8,
        )
        if resp2 is not None:
            data2 = resp2.json()
            if data2.get("code") == "0":
                fr = float(data2.get("data", [{}])[0].get("fundingRate", 0))
                score = 0
                tags = []
                if fr > FUNDING_RATE_HIGH:
                    score = -1
                    tags.append("FUNDING_RATE_HIGH")
                elif fr < FUNDING_RATE_LOW:
                    score = 1
                    tags.append("FUNDING_RATE_LOW")
                elif fr > FUNDING_RATE_ELEVATED:
                    tags.append("FUNDING_RATE_ELEVATED")
                return score, tags
    except Exception as e:
        logger.debug(f"Alternative funding rate error for {symbol}: {e}")
    logger.info(f"Funding rate unavailable for {symbol} (all sources blocked)")
    return 0, []
    """
    Check current funding rate from Binance Futures.
    High positive = longs paying shorts (overleveraged longs → bearish signal)
    High negative = shorts paying longs (overleveraged shorts → bullish signal)
    """
    try:
        resp = _safe_request(
            f"{BINANCE_FUTURES_BASE}/fapi/v1/premiumIndex",
            params={"symbol": symbol},
            timeout=8,
        )
        if resp is None:
            return 0, []

        data = resp.json()
        funding_rate = float(data.get("lastFundingRate", 0))

        # Binance funding rate is typically 0.01% (0.0001)
        # > 0.05% (0.0005) is high
        # < -0.05% (-0.0005) is high negative
        tags = []
        score = 0

        if funding_rate > FUNDING_RATE_HIGH:
            # Overleveraged longs → potential squeeze down
            score = -1
            tags.append("FUNDING_RATE_HIGH")
        elif funding_rate < FUNDING_RATE_LOW:
            # Overleveraged shorts → potential squeeze up
            score = 1
            tags.append("FUNDING_RATE_LOW")
        elif funding_rate > FUNDING_RATE_ELEVATED:
            score = 0  # Neutral-high, noted but no score impact
            tags.append("FUNDING_RATE_ELEVATED")

        return score, tags

    except Exception as e:
        logger.debug(f"Funding rate check error for {symbol}: {e}")
        return 0, []


# ============================================================
# 4. VOLUME ANOMALIES (Binance 24hr ticker)
# ============================================================

def _check_volume_anomaly(symbol: str) -> tuple[int, list[str]]:
    """Detect unusual volume using Binance 24hr ticker (may be geo-blocked from GitHub Actions)."""
    try:
        resp = _safe_request(
            "https://api.binance.com/api/v3/ticker/24hr",
            params={"symbol": symbol},
            timeout=8,
        )
        if resp is None:
            return 0, []

        data = resp.json()
        volume = float(data.get("volume", 0))
        quote_volume = float(data.get("quoteVolume", 0))
        price_change_pct = float(data.get("priceChangePercent", 0))

        tags = []
        score = 0

        if quote_volume > VOLUME_QUOTE_THRESHOLD:
            if price_change_pct > VOLUME_PRICE_CHANGE_PCT:
                score = 1
                tags.append("VOLUME_ANOMALY")
            elif price_change_pct < -VOLUME_PRICE_CHANGE_PCT:
                score = -1
                tags.append("VOLUME_ANOMALY")
            elif abs(price_change_pct) > VOLUME_ELEVATED_CHANGE_PCT:
                tags.append("VOLUME_ELEVATED")

        return score, tags

    except Exception as e:
        logger.debug(f"Volume anomaly check error for {symbol}: {e}")
        return 0, []


def _check_volume_anomaly_coingecko(volume_24h: float, market_cap: float, price_change_pct: float) -> tuple[int, list[str]]:
    """Detect volume anomaly from CoinGecko market data (works everywhere, no per-coin API calls)."""
    if market_cap <= 0 or volume_24h <= 0:
        return 0, []
    vol_to_mcap = volume_24h / market_cap
    tags = []
    score = 0
    if vol_to_mcap > 0.1:
        if price_change_pct > VOLUME_PRICE_CHANGE_PCT:
            score = 1
            tags.append("VOLUME_ANOMALY")
        elif price_change_pct < -VOLUME_PRICE_CHANGE_PCT:
            score = -1
            tags.append("VOLUME_ANOMALY")
        elif abs(price_change_pct) > VOLUME_ELEVATED_CHANGE_PCT:
            tags.append("VOLUME_ELEVATED")
    return score, tags


# ============================================================
# COMBINED FUNDAMENTAL ANALYSIS
# ============================================================

def analyze_fundamental(symbol: str, coin_name: str = "", coin_data: Optional[dict] = None) -> dict:
    """
    Run all 4 fundamental sources and combine into a single score.
    
    Args:
        symbol: Trading pair symbol (e.g. "BTCUSDT")
        coin_name: Human-readable coin name for RSS search
        coin_data: CoinGecko market data dict (optional, used for volume anomaly when Binance blocked)
    """
    news_score, news_tags = _analyze_news_sentiment(symbol, coin_name)
    whale_score, whale_tags = _detect_whale_activity(symbol)
    funding_score, funding_tags = _check_funding_rate(symbol)
    
    # Volume anomaly: try Binance first, fall back to CoinGecko data
    volume_score, volume_tags = _check_volume_anomaly(symbol)
    if volume_score == 0 and not volume_tags and coin_data:
        cg_volume = coin_data.get("volume_24h", 0) or 0
        cg_mcap = coin_data.get("market_cap", 0) or 0
        cg_change = coin_data.get("price_change_percentage_24h", 0) or 0
        volume_score, volume_tags = _check_volume_anomaly_coingecko(cg_volume, cg_mcap, cg_change)

    logger.info(f"Fundamental {symbol}: news={news_score} whale={whale_score} funding={funding_score} volume={volume_score} tags={news_tags + whale_tags + funding_tags + volume_tags}")

    logger.info(f"Fundamental {symbol}: news={news_score} whale={whale_score} funding={funding_score} volume={volume_score} tags={news_tags + whale_tags + funding_tags + volume_tags}")

    # Combine: raw sum, then clamp to -2..+2
    raw = news_score + whale_score + funding_score + volume_score

    if raw >= SCORE_CLAMP_HIGH:
        combined = 2
    elif raw >= SCORE_CLAMP_MEDIUM:
        combined = 1
    elif raw <= SCORE_CLAMP_NEG_HIGH:
        combined = -2
    elif raw <= SCORE_CLAMP_NEG_MEDIUM:
        combined = -1
    else:
        combined = 0

    all_tags = news_tags + whale_tags + funding_tags + volume_tags

    return {
        "score": combined,
        "tags": all_tags,
        "details": {
            "news_score": news_score,
            "whale_score": whale_score,
            "funding_score": funding_score,
            "volume_score": volume_score,
        },
    }
