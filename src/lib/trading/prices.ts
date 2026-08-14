// Resilient market-price lookup. Vercel datacenter IPs can be rate-limited or
// blocked by individual exchanges, so we try several public sources in order:
//   1. Bybit spot ticker
//   2. OKX spot ticker
//   3. CoinGecko simple/price (with a cached symbol->id map from /coins/markets)
// Used by the execution engine (sizing), paper mode and the dashboard PnL.

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY || '';

let idMapCache: Record<string, string> | null = null;
let idMapAt = 0;

async function coinGeckoIdMap(): Promise<Record<string, string>> {
  if (idMapCache && Date.now() - idMapAt < 10 * 60_000) return idMapCache;
  try {
    const params = new URLSearchParams({
      vs_currency: 'usd',
      order: 'market_cap_desc',
      per_page: '100',
      page: '1',
      sparkline: 'false',
    });
    if (COINGECKO_API_KEY) params.set('x_cg_demo_api_key', COINGECKO_API_KEY);
    const resp = await fetch(`${COINGECKO_BASE}/coins/markets?${params}`, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return idMapCache ?? {};
    const rows = (await resp.json()) as Array<{ id: string; symbol: string }>;
    const map: Record<string, string> = {};
    for (const r of rows) map[r.symbol.toUpperCase()] = r.id;
    idMapCache = map;
    idMapAt = Date.now();
    return map;
  } catch {
    return idMapCache ?? {};
  }
}

async function bybitPrice(symbol: string): Promise<number | null> {
  try {
    const resp = await fetch(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${encodeURIComponent(symbol)}`, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    const d = await resp.json();
    const price = parseFloat(d?.result?.list?.[0]?.lastPrice ?? '0');
    return price > 0 ? price : null;
  } catch {
    return null;
  }
}

async function okxPrice(symbol: string): Promise<number | null> {
  try {
    const instId = symbol.replace(/USDT$/, '-USDT');
    const resp = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(instId)}`, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    const d = await resp.json();
    const price = parseFloat(d?.data?.[0]?.last ?? '0');
    return price > 0 ? price : null;
  } catch {
    return null;
  }
}

async function coinGeckoPrice(symbol: string): Promise<number | null> {
  try {
    const map = await coinGeckoIdMap();
    const id = map[symbol.replace(/USDT$/, '')];
    if (!id) return null;
    const params = new URLSearchParams({ ids: id, vs_currencies: 'usd' });
    if (COINGECKO_API_KEY) params.set('x_cg_demo_api_key', COINGECKO_API_KEY);
    const resp = await fetch(`${COINGECKO_BASE}/simple/price?${params}`, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    const d = await resp.json();
    const price = parseFloat(d?.[id]?.usd ?? '0');
    return price > 0 ? price : null;
  } catch {
    return null;
  }
}

export async function fetchMarketPrice(symbol: string): Promise<number> {
  const bybit = await bybitPrice(symbol);
  if (bybit) return bybit;
  const okx = await okxPrice(symbol);
  if (okx) return okx;
  const cg = await coinGeckoPrice(symbol);
  if (cg) return cg;
  throw new Error(`no price source available for ${symbol}`);
}
