// PaperExchange: per-user simulated trading (no real money, no exchange keys).
//
// Orders are persisted in the `paper_orders` table so the simulation survives
// across engine runs (each Vercel invocation is a fresh process). Market prices
// come from real public endpoints (Bybit); fills are simulated deterministically
// against those prices. The simulated balance is a fixed 10,000 USDT.
//
// A connection with exchange='paper' is always routed through this adapter
// (see engine.ts). The in-memory price override exists for tests only.
import { getServiceSupabase } from '@/lib/supabase';
import { fetchMarketPrice } from './prices';
import type {
  ConnectionOpts,
  ExchangeAdapter,
  FilledTrade,
  OrderResult,
  ProtectedEntryParams,
  TestResult,
} from '@/lib/exchanges/types';

export const PAPER_BALANCE_USDT = 10_000;

const priceOverride = new Map<string, number>();

export const paperReset = () => {
  priceOverride.clear();
};

/** Test hook: force a symbol's price (deterministic SL/TP fills). */
export const paperSetPrice = (symbol: string, price: number) => {
  priceOverride.set(symbol, price);
};

async function ticker(symbol: string): Promise<number> {
  const forced = priceOverride.get(symbol);
  if (forced !== undefined) return forced;
  return fetchMarketPrice(symbol);
}

// Correct stop-vs-limit semantics:
//  - entry/tp are LIMITS: fill when price reaches the limit in our favor
//  - sl is a STOP: fills when price CROSSES the stop against the position
function crossed(side: 'buy' | 'sell', kind: 'entry' | 'sl' | 'tp', price: number, limit: number): boolean {
  if (kind === 'sl') {
    return side === 'sell' ? price <= limit : price >= limit;
  }
  return side === 'buy' ? price <= limit : price >= limit;
}

export const paperExchange: ExchangeAdapter = {
  id: 'paper',
  async testConnection(): Promise<TestResult> {
    return { ok: true };
  },
  async getTickerPrice(symbol) {
    const price = await ticker(symbol);
    return { price };
  },
  async getBalanceUsdt(): Promise<{ balance: number }> {
    return { balance: PAPER_BALANCE_USDT };
  },
  async placeProtectedEntry(params: ProtectedEntryParams, _apiKey, _apiSecret, opts?: ConnectionOpts): Promise<OrderResult> {
    const connectionId = opts?.connectionId;
    if (!connectionId) return { ok: false, error: 'paper mode requires a connection' };
    const supabase = getServiceSupabase();
    const rows = [
      { connection_id: connectionId, symbol: params.symbol, side: params.side, kind: 'entry', limit_price: params.entryPrice, quantity: params.quantity },
      { connection_id: connectionId, symbol: params.symbol, side: params.side === 'buy' ? 'sell' : 'buy', kind: 'sl', limit_price: params.slPrice, quantity: params.quantity },
      ...params.tpPrices.map((tp) => ({
        connection_id: connectionId, symbol: params.symbol, side: params.side === 'buy' ? 'sell' : 'buy', kind: 'tp' as const, limit_price: tp, quantity: params.quantity,
      })),
    ];
    const { data, error } = await supabase.from('paper_orders').insert(rows).select('id,kind');
    if (error) return { ok: false, error: `paper insert: ${error.message}` };
    const entry = (data || []).find((r) => r.kind === 'entry');
    return { ok: true, orderId: entry?.id ?? data?.[0]?.id };
  },
  async getOrderStatus(orderId, _symbol, _apiKey, _apiSecret, opts?: ConnectionOpts) {
    void _symbol; void _apiKey; void _apiSecret; void opts;
    const supabase = getServiceSupabase();
    const { data } = await supabase.from('paper_orders').select('*').eq('id', orderId).maybeSingle();
    if (!data) return { status: 'UNKNOWN', filledQuantity: 0 };
    if (data.status === 'new' && (await crossed(data.side, data.kind, await ticker(data.symbol), Number(data.limit_price)))) {
      await supabase.from('paper_orders').update({ status: 'filled', filled_quantity: data.quantity, avg_price: data.limit_price }).eq('id', data.id);
      data.status = 'filled';
      data.filled_quantity = data.quantity;
      data.avg_price = data.limit_price;
    }
    return { status: data.status === 'filled' ? 'FILLED' : 'NEW', filledQuantity: Number(data.filled_quantity), avgPrice: Number(data.avg_price) };
  },
  async cancelOrder(orderId, _symbol, _apiKey, _apiSecret, opts?: ConnectionOpts) {
    void _symbol; void _apiKey; void _apiSecret; void opts;
    const supabase = getServiceSupabase();
    await supabase.from('paper_orders').update({ status: 'cancelled' }).eq('id', orderId);
    return { ok: true };
  },
  async getClosedFills(symbol, _sinceMs, _apiKey, _apiSecret, opts?: ConnectionOpts): Promise<FilledTrade[]> {
    void _sinceMs; // protection orders are created before the trade row; no time filter needed
    void _apiKey; void _apiSecret;
    const connectionId = opts?.connectionId;
    const supabase = getServiceSupabase();
    let query = supabase
      .from('paper_orders')
      .select('*')
      .eq('symbol', symbol)
      .eq('status', 'new')
      .neq('kind', 'entry');
    if (connectionId) query = query.eq('connection_id', connectionId);
    const { data } = await query;
    const filled: FilledTrade[] = [];
    for (const o of data || []) {
      if (o.status !== 'new' || o.kind === 'entry') continue;
      if (await crossed(o.side, o.kind, await ticker(o.symbol), Number(o.limit_price))) {
        await supabase.from('paper_orders').update({ status: 'filled', filled_quantity: o.quantity, avg_price: o.limit_price }).eq('id', o.id);
        filled.push({ orderId: o.id, side: o.side, price: Number(o.limit_price), quantity: Number(o.quantity), feeUsd: 0, timeMs: Date.now() });
      }
    }
    return filled;
  },
};
