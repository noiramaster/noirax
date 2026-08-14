import { NextRequest, NextResponse } from 'next/server';

/**
 * Resolves the best TradingView chart symbol for a coin across exchanges.
 *
 * The signal pages render a TradingView widget for the user's convenience.
 * Coins are not listed on every exchange (e.g. Bybit delisted XMR), and an
 * invalid symbol makes the widget show "Este símbolo no existe". This route
 * probes the exchanges' public market APIs and returns the first exchange
 * where the spot pair actually trades, so the widget always gets a valid
 * symbol. If no exchange lists the pair, the UI shows a clean fallback.
 *
 * Order: Bybit -> OKX -> Binance.
 */

const TIMEOUT_MS = 4000;

async function bybitHasSymbol(base: string): Promise<boolean> {
  const res = await fetch(
    `https://api.bybit.com/v5/market/tickers?category=spot&symbol=${base}USDT`,
    { signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  if (!res.ok) return false;
  const data = await res.json();
  return data?.retCode === 0 && Array.isArray(data?.result?.list) && data.result.list.length > 0;
}

async function okxHasSymbol(base: string): Promise<boolean> {
  const res = await fetch(
    `https://www.okx.com/api/v5/market/ticker?instId=${base}-USDT`,
    { signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  if (!res.ok) return false;
  const data = await res.json();
  return data?.code === '0';
}

async function binanceHasSymbol(base: string): Promise<boolean> {
  const res = await fetch(
    `https://api.binance.com/api/v3/ticker/price?symbol=${base}USDT`,
    { signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  if (!res.ok) return false;
  const data = await res.json();
  return typeof data?.price === 'string' && data.price.length > 0;
}

// USD-quoted fallbacks (Kraken/Coinbase) — some coins delisted from Bybit/OKX
// (e.g. XMR) and geo-blocked on Binance still trade in USD pairs. TradingView
// renders them fine; the quote currency differs but the price action is the same.
async function krakenHasSymbol(base: string): Promise<boolean> {
  const res = await fetch(
    `https://api.kraken.com/0/public/Ticker?pair=${base}USD`,
    { signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  if (!res.ok) return false;
  const data = await res.json();
  return data?.error?.length === 0 && !!data?.result;
}

async function coinbaseHasSymbol(base: string): Promise<boolean> {
  const res = await fetch(
    `https://api.coinbase.com/v2/prices/${base}-USD/spot`,
    { signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  if (!res.ok) return false;
  const data = await res.json();
  return typeof data?.data?.amount === 'string' && data.data.amount.length > 0;
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('coin') || '';
  const base = raw.toUpperCase().replace('/USDT', '').replace('USDT', '').replace(/[^A-Z0-9]/g, '');
  if (!base) {
    return NextResponse.json({ error: 'coin param required' }, { status: 400 });
  }

  const probes: Array<{ exchange: string; tv: string; check: () => Promise<boolean> }> = [
    { exchange: 'bybit', tv: `BYBIT:${base}USDT`, check: () => bybitHasSymbol(base) },
    { exchange: 'okx', tv: `OKX:${base}USDT`, check: () => okxHasSymbol(base) },
    { exchange: 'binance', tv: `BINANCE:${base}USDT`, check: () => binanceHasSymbol(base) },
    { exchange: 'kraken', tv: `KRAKEN:${base}USD`, check: () => krakenHasSymbol(base) },
    { exchange: 'coinbase', tv: `COINBASE:${base}USD`, check: () => coinbaseHasSymbol(base) },
  ];

  for (const probe of probes) {
    try {
      if (await probe.check()) {
        return NextResponse.json({ exchange: probe.exchange, symbol: probe.tv });
      }
    } catch {
      // Probe failed (timeout/network/geo-block) — try the next exchange.
    }
  }

  return NextResponse.json({ exchange: null, symbol: null });
}
