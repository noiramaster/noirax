// OKX spot order execution. Signed via base64 HMAC-SHA256 over
// "ts + method + path + body". Demo trading: x-simulated-trading: '1' header.
import { hmacB64, httpGet, httpPost } from './signing';
import type { ConnectionOpts, FilledTrade, OrderResult, ProtectedEntryParams } from './types';

const base = () => 'https://www.okx.com';
const toInstId = (symbol: string) => symbol.replace(/USDT$/, '-USDT');

function signHeaders(apiKey: string, apiSecret: string, passphrase: string | undefined, method: string, path: string, body: string): Record<string, string> {
  const ts = new Date().toISOString();
  const signature = hmacB64(apiSecret, `${ts}${method}${path}${body}`);
  return {
    'OK-ACCESS-KEY': apiKey,
    'OK-ACCESS-SIGN': signature,
    'OK-ACCESS-TIMESTAMP': ts,
    'OK-ACCESS-PASSPHRASE': passphrase || '',
    'Content-Type': 'application/json',
  };
}

export async function okxTickerPrice(symbol: string): Promise<{ price: number }> {
  const { status, body } = await httpGet(`${base()}/api/v5/market/ticker?instId=${toInstId(symbol)}`, {});
  if (status !== 200) throw new Error(`OKX ticker HTTP ${status}`);
  const d = JSON.parse(body);
  return { price: parseFloat(d.data?.[0]?.last ?? '0') };
}

export async function okxBalanceUsdt(apiKey: string, apiSecret: string, passphrase?: string, opts?: ConnectionOpts): Promise<{ balance: number }> {
  const path = '/api/v5/account/balance';
  const h = signHeaders(apiKey, apiSecret, passphrase, 'GET', path, '');
  if (opts?.testnet) h['x-simulated-trading'] = '1';
  const { status, body } = await httpGet(`${base()}${path}`, h);
  if (status !== 200) throw new Error(`OKX balance HTTP ${status}: ${body.slice(0, 150)}`);
  const d = JSON.parse(body);
  if (d.code !== '0') throw new Error(`OKX balance: ${d.msg}`);
  const usdt = (d.data?.[0]?.details || []).find((c: { ccy: string }) => c.ccy === 'USDT');
  return { balance: parseFloat(usdt?.cashBal ?? '0') };
}

const opposite = (side: 'buy' | 'sell') => (side === 'buy' ? 'sell' : 'buy');

export async function okxPlaceProtectedEntry(
  params: ProtectedEntryParams,
  apiKey: string,
  apiSecret: string,
  passphrase?: string,
  opts?: ConnectionOpts
): Promise<OrderResult> {
  const s = base();
  const path = '/api/v5/trade/order-algo';
  const algo = JSON.stringify({
    instId: toInstId(params.symbol),
    tdMode: 'cash',
    side: opposite(params.side),
    ordType: 'conditional',
    slTriggerPx: String(params.slPrice),
    slOrdPx: String(params.slPrice),
    tpTriggerPx: String(params.tpPrices[0]),
    tpOrdPx: String(params.tpPrices[0]),
  });
  const h = signHeaders(apiKey, apiSecret, passphrase, 'POST', path, algo);
  if (opts?.testnet) h['x-simulated-trading'] = '1';
  try {
    const algoR = await httpPost(`${s}${path}`, h, algo);
    const algoD = JSON.parse(algoR.body);
    if (algoR.status !== 200 || algoD.code !== '0') {
      return { ok: false, error: `OKX algo rejected: ${algoR.body.slice(0, 200)}` };
    }
    // Extra TP legs (plain limits).
    for (const tp of params.tpPrices.slice(1)) {
      const p2 = '/api/v5/trade/order';
      const b = JSON.stringify({
        instId: toInstId(params.symbol), tdMode: 'cash', side: opposite(params.side),
        ordType: 'limit', px: String(tp), sz: String(params.quantity),
      });
      const h2 = signHeaders(apiKey, apiSecret, passphrase, 'POST', p2, b);
      if (opts?.testnet) h2['x-simulated-trading'] = '1';
      const r = await httpPost(`${s}${p2}`, h2, b);
      const dd = JSON.parse(r.body);
      if (r.status !== 200 || dd.code !== '0') continue;
    }
    // Entry limit LAST.
    const p3 = '/api/v5/trade/order';
    const eb = JSON.stringify({
      instId: toInstId(params.symbol), tdMode: 'cash', side: params.side,
      ordType: 'limit', px: String(params.entryPrice), sz: String(params.quantity),
    });
    const h3 = signHeaders(apiKey, apiSecret, passphrase, 'POST', p3, eb);
    if (opts?.testnet) h3['x-simulated-trading'] = '1';
    const er = await httpPost(`${s}${p3}`, h3, eb);
    const ed = JSON.parse(er.body);
    if (er.status !== 200 || ed.code !== '0') {
      return { ok: false, error: `OKX entry rejected: ${er.body.slice(0, 200)}` };
    }
    return { ok: true, orderId: ed.data?.[0]?.ordId };
  } catch (e) {
    return { ok: false, error: `OKX execution error: ${e instanceof Error ? e.message : 'unknown'}` };
  }
}

export async function okxOrderStatus(orderId: string, symbol: string, apiKey: string, apiSecret: string, passphrase?: string, opts?: ConnectionOpts) {
  const path = `/api/v5/trade/order?instId=${toInstId(symbol)}&ordId=${orderId}`;
  const h = signHeaders(apiKey, apiSecret, passphrase, 'GET', path, '');
  if (opts?.testnet) h['x-simulated-trading'] = '1';
  const { status, body } = await httpGet(`${base()}${path}`, h);
  if (status !== 200) throw new Error(`OKX order status HTTP ${status}`);
  const d = JSON.parse(body);
  const o = d.data?.[0];
  return { status: o?.state ?? 'Unknown', filledQuantity: parseFloat(o?.accFillSz ?? '0'), avgPrice: parseFloat(o?.avgPx ?? '0') };
}

export async function okxCancelOrder(orderId: string, symbol: string, apiKey: string, apiSecret: string, passphrase?: string, opts?: ConnectionOpts) {
  const path = '/api/v5/trade/cancel-order';
  const b = JSON.stringify({ instId: toInstId(symbol), ordId: orderId });
  const h = signHeaders(apiKey, apiSecret, passphrase, 'POST', path, b);
  if (opts?.testnet) h['x-simulated-trading'] = '1';
  const r = await httpPost(`${base()}${path}`, h, b);
  const d = JSON.parse(r.body);
  return { ok: r.status === 200 && d.code === '0', error: d.msg };
}

export async function okxClosedFills(symbol: string, sinceMs: number, apiKey: string, apiSecret: string, passphrase?: string, opts?: ConnectionOpts): Promise<FilledTrade[]> {
  const path = `/api/v5/trade/fills?instId=${toInstId(symbol)}&begin=${sinceMs}&limit=100`;
  const h = signHeaders(apiKey, apiSecret, passphrase, 'GET', path, '');
  if (opts?.testnet) h['x-simulated-trading'] = '1';
  const { status, body } = await httpGet(`${base()}${path}`, h);
  if (status !== 200) throw new Error(`OKX fills HTTP ${status}`);
  const d = JSON.parse(body);
  return (d.data || []).map((f: Record<string, string>) => ({
    orderId: f.ordId,
    side: f.side === 'sell' ? 'sell' : 'buy',
    price: parseFloat(f.fillPx),
    quantity: parseFloat(f.fillSz),
    feeUsd: parseFloat(f.fee),
    timeMs: parseInt(f.ts, 10),
  }));
}
