// Bybit spot order execution. Signed via hex HMAC-SHA256 over
// "ts + apiKey + recvWindow + body/query". Testnet: https://api-testnet.bybit.com
import { hmacHex, httpGet, httpPost } from './signing';
import type { ConnectionOpts, FilledTrade, OrderResult, ProtectedEntryParams } from './types';

const base = (opts?: ConnectionOpts) => (opts?.testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com');

function signHeaders(apiKey: string, apiSecret: string, payload: string): Record<string, string> {
  const ts = Date.now();
  const recvWindow = '5000';
  const signature = hmacHex(apiSecret, `${ts}${apiKey}${recvWindow}${payload}`);
  return {
    'X-BAPI-API-KEY': apiKey,
    'X-BAPI-TIMESTAMP': String(ts),
    'X-BAPI-RECV-WINDOW': recvWindow,
    'X-BAPI-SIGN': signature,
    'Content-Type': 'application/json',
  };
}

export async function bybitTickerPrice(symbol: string, opts?: ConnectionOpts): Promise<{ price: number }> {
  const { status, body } = await httpGet(`${base(opts)}/v5/market/tickers?category=spot&symbol=${symbol}`, {});
  if (status !== 200) throw new Error(`Bybit ticker HTTP ${status}`);
  const d = JSON.parse(body);
  return { price: parseFloat(d.result?.list?.[0]?.lastPrice ?? '0') };
}

export async function bybitBalanceUsdt(apiKey: string, apiSecret: string, opts?: ConnectionOpts): Promise<{ balance: number }> {
  const query = 'accountType=UNIFIED';
  const { status, body } = await httpGet(
    `${base(opts)}/v5/account/wallet-balance?${query}`,
    signHeaders(apiKey, apiSecret, query)
  );
  if (status !== 200) throw new Error(`Bybit balance HTTP ${status}: ${body.slice(0, 150)}`);
  const d = JSON.parse(body);
  if (d.retCode !== 0) throw new Error(`Bybit balance: ${d.retMsg}`);
  const coins = d.result?.list?.[0]?.coin || [];
  const usdt = coins.find((c: { coin: string }) => c.coin === 'USDT');
  return { balance: parseFloat(usdt?.availableToWithdraw ?? usdt?.walletBalance ?? '0') };
}

const opposite = (side: 'buy' | 'sell') => (side === 'buy' ? 'Sell' : 'Buy');

export async function bybitPlaceProtectedEntry(
  params: ProtectedEntryParams,
  apiKey: string,
  apiSecret: string,
  opts?: ConnectionOpts
): Promise<OrderResult> {
  const s = base(opts);
  try {
    // 1. Spot OCO: TP1 limit + SL trigger in one order.
    const ocoBody = JSON.stringify({
      category: 'spot',
      symbol: params.symbol,
      side: opposite(params.side),
      orderType: 'Limit',
      price: String(params.tpPrices[0]),
      triggerPrice: String(params.slPrice),
      triggerDirection: params.side === 'buy' ? 2 : 1,
      qty: String(params.quantity),
    });
    const oco = await httpPost(`${s}/v5/oco-order/create`, signHeaders(apiKey, apiSecret, ocoBody), ocoBody);
    if (oco.status !== 200 || JSON.parse(oco.body).retCode !== 0) {
      return { ok: false, error: `Bybit OCO rejected: ${oco.body.slice(0, 200)}` };
    }

    // 2. Extra TP legs as plain limits (fill only if price moves in our favor).
    for (const tp of params.tpPrices.slice(1)) {
      const b = JSON.stringify({
        category: 'spot', symbol: params.symbol, side: opposite(params.side),
        orderType: 'Limit', qty: String(params.quantity), price: String(tp), timeInForce: 'GTC',
      });
      const r = await httpPost(`${s}/v5/order/create`, signHeaders(apiKey, apiSecret, b), b);
      const d = JSON.parse(r.body);
      if (r.status !== 200 || d.retCode !== 0) continue; // non-critical ladder leg
    }

    // 3. Entry limit LAST.
    const entryBody = JSON.stringify({
      category: 'spot', symbol: params.symbol,
      side: params.side === 'buy' ? 'Buy' : 'Sell',
      orderType: 'Limit', qty: String(params.quantity),
      price: String(params.entryPrice), timeInForce: 'GTC',
    });
    const er = await httpPost(`${s}/v5/order/create`, signHeaders(apiKey, apiSecret, entryBody), entryBody);
    const ed = JSON.parse(er.body);
    if (er.status !== 200 || ed.retCode !== 0) {
      return { ok: false, error: `Bybit entry rejected: ${er.body.slice(0, 200)}` };
    }
    return { ok: true, orderId: ed.result?.orderId };
  } catch (e) {
    return { ok: false, error: `Bybit execution error: ${e instanceof Error ? e.message : 'unknown'}` };
  }
}

export async function bybitOrderStatus(orderId: string, symbol: string, apiKey: string, apiSecret: string, opts?: ConnectionOpts) {
  const query = `category=spot&symbol=${symbol}&orderId=${orderId}`;
  const { status, body } = await httpGet(`${base(opts)}/v5/order/realtime?${query}`, signHeaders(apiKey, apiSecret, query));
  if (status !== 200) throw new Error(`Bybit order status HTTP ${status}`);
  const d = JSON.parse(body);
  const o = d.result?.list?.[0];
  return { status: o?.orderStatus ?? 'Unknown', filledQuantity: parseFloat(o?.cumExecQty ?? '0'), avgPrice: parseFloat(o?.avgPrice ?? '0') };
}

export async function bybitCancelOrder(orderId: string, symbol: string, apiKey: string, apiSecret: string, opts?: ConnectionOpts) {
  const b = JSON.stringify({ category: 'spot', symbol, orderId });
  const r = await httpPost(`${base(opts)}/v5/order/cancel`, signHeaders(apiKey, apiSecret, b), b);
  const d = JSON.parse(r.body);
  return { ok: r.status === 200 && d.retCode === 0, error: d.retMsg };
}

export async function bybitClosedFills(symbol: string, sinceMs: number, apiKey: string, apiSecret: string, opts?: ConnectionOpts): Promise<FilledTrade[]> {
  const query = `category=spot&symbol=${symbol}&startTime=${sinceMs}&limit=200`;
  const { status, body } = await httpGet(`${base(opts)}/v5/execution/list?${query}`, signHeaders(apiKey, apiSecret, query));
  if (status !== 200) throw new Error(`Bybit fills HTTP ${status}`);
  const d = JSON.parse(body);
  return (d.result?.list || [])
    .filter((f: { execType?: string }) => f.execType === 'Trade')
    .map((f: Record<string, string>) => ({
      orderId: f.orderId,
      side: f.side === 'Sell' ? 'sell' : 'buy',
      price: parseFloat(f.execPrice),
      quantity: parseFloat(f.execQty),
      feeUsd: parseFloat(f.execFee),
      timeMs: parseInt(f.execTime, 10),
    }));
}
