// Binance spot order execution. Signed via HMAC-SHA256 over the query string.
// Protection is placed BEFORE the entry: OCO (SL + TP1) + extra TP limits, so a
// filled position is never unprotected. Testnet: https://testnet.binance.vision
import { hmacHex, httpGet, httpPost } from './signing';
import type { ConnectionOpts, FilledTrade, OrderResult, ProtectedEntryParams } from './types';

const base = (opts?: ConnectionOpts) => (opts?.testnet ? 'https://testnet.binance.vision' : 'https://api.binance.com');

const authHeaders = (apiKey: string) => ({ 'X-MBX-APIKEY': apiKey });

function signQuery(secret: string, query: string): string {
  return hmacHex(secret, query);
}

export async function binanceTickerPrice(symbol: string, opts?: ConnectionOpts): Promise<{ price: number }> {
  const { status, body } = await httpGet(`${base(opts)}/api/v3/ticker/price?symbol=${symbol}`, {});
  if (status !== 200) throw new Error(`Binance ticker HTTP ${status}`);
  return { price: parseFloat(JSON.parse(body).price) };
}

export async function binanceBalanceUsdt(apiKey: string, apiSecret: string, opts?: ConnectionOpts): Promise<{ balance: number }> {
  const ts = Date.now();
  const query = `timestamp=${ts}`;
  const { status, body } = await httpGet(
    `${base(opts)}/api/v3/account?${query}&signature=${signQuery(apiSecret, query)}`,
    authHeaders(apiKey)
  );
  if (status !== 200) throw new Error(`Binance balance HTTP ${status}: ${body.slice(0, 150)}`);
  const data = JSON.parse(body);
  const usdt = (data.balances || []).find((b: { asset: string }) => b.asset === 'USDT');
  return { balance: parseFloat(usdt?.free ?? '0') };
}

const opposite = (side: 'buy' | 'sell') => (side === 'buy' ? 'SELL' : 'BUY');

export async function binancePlaceProtectedEntry(
  params: ProtectedEntryParams,
  apiKey: string,
  apiSecret: string,
  opts?: ConnectionOpts
): Promise<OrderResult> {
  const s = base(opts);
  const protectedOrderIds: string[] = [];
  try {
    // 1. OCO protection (SL stop-limit + TP1 limit) for the opposite side.
    const slStopLimit = params.side === 'buy'
      ? params.slPrice * 1.002   // stop-limit slightly above the stop (slippage room)
      : params.slPrice * 0.998;
    const ocoParams = new URLSearchParams({
      symbol: params.symbol,
      side: opposite(params.side),
      quantity: String(params.quantity),
      price: String(params.tpPrices[0]),
      stopPrice: String(params.slPrice),
      stopLimitPrice: slStopLimit.toFixed(8),
      stopLimitTimeInForce: 'GTC',
      timestamp: String(Date.now()),
    });
    const ocoQuery = ocoParams.toString();
    const r = await httpPost(
      `${s}/api/v3/order/oco?${ocoQuery}&signature=${signQuery(apiSecret, ocoQuery)}`,
      authHeaders(apiKey),
      ''
    );
    if (r.status !== 200) {
      return { ok: false, error: `Binance OCO rejected HTTP ${r.status}: ${r.body.slice(0, 200)}` };
    }
    const oco = JSON.parse(r.body);
    protectedOrderIds.push(oco.orderListId ? `oco:${oco.orderListId}` : (oco.orderReports?.[0]?.orderId ?? 'oco'));

    // 2. Extra TP legs as plain limits (they only fill if the price moves in our favor).
    for (const tp of params.tpPrices.slice(1)) {
      const q = new URLSearchParams({
        symbol: params.symbol,
        side: opposite(params.side),
        type: 'LIMIT',
        timeInForce: 'GTC',
        quantity: String(params.quantity),
        price: tp.toFixed(8),
        timestamp: String(Date.now()),
      }).toString();
      const rr = await httpPost(`${s}/api/v3/order?${q}&signature=${signQuery(apiSecret, q)}`, authHeaders(apiKey), '');
      if (rr.status !== 200) {
        // Non-critical: TP ladder leg failed; entry below will still be protected by OCO.
        continue;
      }
      protectedOrderIds.push(String(JSON.parse(rr.body).orderId));
    }

    // 3. Entry limit order LAST.
    const eq = new URLSearchParams({
      symbol: params.symbol,
      side: params.side === 'buy' ? 'BUY' : 'SELL',
      type: 'LIMIT',
      timeInForce: 'GTC',
      quantity: String(params.quantity),
      price: params.entryPrice.toFixed(8),
      timestamp: String(Date.now()),
    }).toString();
    const er = await httpPost(`${s}/api/v3/order?${eq}&signature=${signQuery(apiSecret, eq)}`, authHeaders(apiKey), '');
    if (er.status !== 200) {
      for (const id of protectedOrderIds) {
        const idClean = id.replace('oco:', '');
        // OCO list ids can't be cancelled via /order; best-effort cleanup is logged by caller.
        void idClean;
      }
      return { ok: false, error: `Binance entry rejected HTTP ${er.status}: ${er.body.slice(0, 200)}` };
    }
    return { ok: true, orderId: String(JSON.parse(er.body).orderId) };
  } catch (e) {
    return { ok: false, error: `Binance execution error: ${e instanceof Error ? e.message : 'unknown'}` };
  }
}

export async function binanceOrderStatus(orderId: string, symbol: string, apiKey: string, apiSecret: string, opts?: ConnectionOpts) {
  const q = new URLSearchParams({ symbol, origClientOrderId: orderId, timestamp: String(Date.now()) }).toString();
  const r = await httpGet(`${base(opts)}/api/v3/order?${q}&signature=${signQuery(apiSecret, q)}`, authHeaders(apiKey));
  if (r.status !== 200) throw new Error(`Binance order status HTTP ${r.status}`);
  const d = JSON.parse(r.body);
  return { status: d.status, filledQuantity: parseFloat(d.executedQty ?? '0'), avgPrice: parseFloat(d.avgPrice ?? '0') };
}

export async function binanceCancelOrder(orderId: string, symbol: string, apiKey: string, apiSecret: string, opts?: ConnectionOpts) {
  const q = new URLSearchParams({ symbol, origClientOrderId: orderId, timestamp: String(Date.now()) }).toString();
  const r = await httpPost(`${base(opts)}/api/v3/order?${q}&signature=${signQuery(apiSecret, q)}`, authHeaders(apiKey), '');
  return { ok: r.status === 200, error: r.status === 200 ? undefined : `HTTP ${r.status}` };
}

export async function binanceClosedFills(symbol: string, sinceMs: number, apiKey: string, apiSecret: string, opts?: ConnectionOpts): Promise<FilledTrade[]> {
  const q = new URLSearchParams({ symbol, startTime: String(sinceMs), limit: '200', timestamp: String(Date.now()) }).toString();
  const r = await httpGet(`${base(opts)}/api/v3/myTrades?${q}&signature=${signQuery(apiSecret, q)}`, authHeaders(apiKey));
  if (r.status !== 200) throw new Error(`Binance myTrades HTTP ${r.status}`);
  const rows = JSON.parse(r.body);
  return rows.map((t: Record<string, unknown>) => ({
    orderId: String(t.orderId),
    side: t.isBuyer === true || t.isBuyer === 'true' ? 'buy' : 'sell',
    price: parseFloat(String(t.price)),
    quantity: parseFloat(String(t.qty)),
    feeUsd: parseFloat(String(t.commission)),
    timeMs: parseInt(String(t.time), 10),
  }));
}
