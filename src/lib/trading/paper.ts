// PaperExchange: full simulation of the adapter order interface for testing the
// engine end-to-end WITHOUT real money. Market prices come from real public
// endpoints (Bybit); order placement/fills are simulated deterministically.
//
// Activation: engine routes all connections through this when the
// SIMULATE_EXCHANGE=true env var is set. Never enabled in production.
import type {
  ExchangeAdapter,
  FilledTrade,
  OrderResult,
  ProtectedEntryParams,
  TestResult,
} from '@/lib/exchanges/types';

interface PaperOrder {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  kind: 'entry' | 'sl' | 'tp';
  limit: number;        // limit price (entry/tp) or stop trigger (sl)
  quantity: number;
  filledQuantity: number;
  avgPrice: number;
  status: 'new' | 'filled' | 'cancelled';
  createdAt: number;
}

const orders: PaperOrder[] = [];
let seq = 1000;
const priceOverride = new Map<string, number>();

export const paperReset = () => {
  orders.length = 0;
  priceOverride.clear();
};

/** Test hook: force a symbol's price (deterministic SL/TP fills). */
export const paperSetPrice = (symbol: string, price: number) => {
  priceOverride.set(symbol, price);
};

async function ticker(symbol: string): Promise<number> {
  const forced = priceOverride.get(symbol);
  if (forced !== undefined) return forced;
  const { getAdapter } = await import('@/lib/exchanges');
  const bybit = getAdapter('bybit');
  if (!bybit?.getTickerPrice) throw new Error('bybit ticker unavailable');
  const { price } = await bybit.getTickerPrice(symbol, {});
  return price;
}

// Correct stop-vs-limit semantics:
//  - entry/tp are LIMITS: fill when price reaches the limit in our favor
//  - sl is a STOP: fills when price CROSSES the stop against the position
async function fillCrossed(order: PaperOrder): Promise<boolean> {
  const price = await ticker(order.symbol);
  if (order.kind === 'sl') {
    return order.side === 'sell' ? price <= order.limit : price >= order.limit;
  }
  return order.side === 'buy' ? price <= order.limit : price >= order.limit;
}

export function getPaperOrders(): PaperOrder[] {
  return orders;
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
    // Simulated capital: 10,000 USDT.
    return { balance: 10000 };
  },
  async placeProtectedEntry(params: ProtectedEntryParams): Promise<OrderResult> {
    // Protection orders first (SL + TPs), then the entry — same as real adapters.
    const id = String(++seq);
    orders.push({ id: `sl-${id}`, symbol: params.symbol, side: params.side === 'buy' ? 'sell' : 'buy', kind: 'sl', limit: params.slPrice, quantity: params.quantity, filledQuantity: 0, avgPrice: 0, status: 'new', createdAt: Date.now() });
    for (const tp of params.tpPrices) {
      orders.push({ id: `tp-${++seq}`, symbol: params.symbol, side: params.side === 'buy' ? 'sell' : 'buy', kind: 'tp', limit: tp, quantity: params.quantity, filledQuantity: 0, avgPrice: 0, status: 'new', createdAt: Date.now() });
    }
    orders.push({ id: `entry-${id}`, symbol: params.symbol, side: params.side, kind: 'entry', limit: params.entryPrice, quantity: params.quantity, filledQuantity: 0, avgPrice: 0, status: 'new', createdAt: Date.now() });
    return { ok: true, orderId: `entry-${id}` };
  },
  async getOrderStatus(orderId) {
    const o = orders.find((x) => x.id === orderId);
    if (!o) return { status: 'UNKNOWN', filledQuantity: 0 };
    // Fill simulation: once price crosses the limit, the order fills at its limit.
    if (o.status === 'new' && (await fillCrossed(o))) {
      o.status = 'filled';
      o.filledQuantity = o.quantity;
      o.avgPrice = o.limit;
    }
    return { status: o.status === 'filled' ? 'FILLED' : 'NEW', filledQuantity: o.filledQuantity, avgPrice: o.avgPrice };
  },
  async cancelOrder(orderId) {
    const o = orders.find((x) => x.id === orderId);
    if (o) o.status = 'cancelled';
    return { ok: true };
  },
  async getClosedFills(symbol, sinceMs): Promise<FilledTrade[]> {
    const filled: FilledTrade[] = [];
    for (const o of orders) {
      if (o.symbol !== symbol || o.kind === 'entry') continue;
      if (o.status === 'new' && (await fillCrossed(o))) {
        o.status = 'filled';
        o.filledQuantity = o.quantity;
        o.avgPrice = o.limit;
      }
      if (o.status === 'filled' && o.createdAt >= sinceMs) {
        filled.push({ orderId: o.id, side: o.side, price: o.avgPrice, quantity: o.filledQuantity, feeUsd: 0, timeMs: Date.now() });
      }
    }
    return filled;
  },
};
