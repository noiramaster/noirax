// Trade sizing and entry/SL/TP planning for the execution engine.
//
// Every trade plan is built from the SIGNAL's own analysis (entry zone, ATR-based
// stop and TP ladder already computed per coin/timeframe by the pipeline from
// real Bybit/OKX OHLC + fundamentals). Nothing here uses generic fixed levels:
// we take the signal's individually calculated values, validate them against
// hard safety rules, and reject anything that fails a guard.
//
// A trade NEVER opens without an attached SL and TP — the engine refuses plans
// that cannot be fully protected.

export interface SignalLike {
  id: string;
  coin: string;              // e.g. "BTC/USDT"
  signal_type: 'buy' | 'sell';
  entry_price: number;
  entry_price_min: number;
  entry_price_max: number;
  stop_loss: number;
  take_profit_1: number;
  take_profit_2: number | null;
  take_profit_3: number | null;
  // Optimized levels (premium set) are preferred for execution:
  stop_loss_optimized: number | null;
  take_profit_1_optimized: number | null;
  take_profit_2_optimized: number | null;
  take_profit_3_optimized: number | null;
}

export interface TradePlan {
  signalId: string;
  symbol: string;            // exchange symbol, e.g. "BTCUSDT"
  side: 'buy' | 'sell';
  entryPrice: number;        // limit price inside the signal's entry zone
  slPrice: number;
  tpPrices: number[];
  quantity: number;
  notionalUsd: number;
  riskUsd: number;
  riskPct: number;           // % of capital at risk on this trade
  positionPct: number;       // % of capital used (after safety-mode override)
  skipped: boolean;
  skipReason?: string;
}

export interface SizingContext {
  capitalUsd: number;
  positionPct: number;       // from profile/connection (already capped server-side)
  safety?: {
    enabled: boolean;
    maxPct: number;          // e.g. 3 = 3%
    tradesUsed: number;
    daysUsed: number;
  };
  maxTolerancePct?: number;  // max distance between market price and zone (default 1%)
  marketPrice: number;       // current price at decision time
}

const DEFAULTS = { maxTolerancePct: 1.0 };

// Minimum sanity bounds for a trade to be allowed (guards, not targets).
const MIN_SL_DISTANCE_PCT = 0.15;   // SL at least 0.15% away (avoid accidental stops)
const MAX_SL_DISTANCE_PCT = 12;     // SL at most 12% away (beyond this the signal is stale)

export function toExchangeSymbol(coin: string): string {
  return coin.replace('/', '').toUpperCase();
}

export function buildTradePlan(signal: SignalLike, ctx: SizingContext): TradePlan {
  const cap = ctx.maxTolerancePct ?? DEFAULTS.maxTolerancePct;
  const symbol = toExchangeSymbol(signal.coin);
  const side = signal.signal_type;

  const fail = (reason: string): TradePlan => ({
    signalId: signal.id, symbol, side, entryPrice: 0, slPrice: 0, tpPrices: [],
    quantity: 0, notionalUsd: 0, riskUsd: 0, riskPct: 0, positionPct: 0,
    skipped: true, skipReason: reason,
  });

  // --- Entry price: the signal's zone, validated against the live market ---
  const min = Number(signal.entry_price_min ?? signal.entry_price ?? 0);
  const max = Number(signal.entry_price_max ?? signal.entry_price ?? 0);
  if (!(min > 0) || !(max >= min)) {
    return fail('invalid entry zone');
  }
  const price = ctx.marketPrice > 0 ? ctx.marketPrice : (min + max) / 2;
  const tolerance = price * (cap / 100);
  if (price < min - tolerance || price > max + tolerance) {
    return fail('market price outside signal entry zone (signal stale or already moved)');
  }
  // Limit at the zone edge nearest the current price, inside the zone.
  const entryPrice = side === 'buy' ? Math.max(min, Math.min(price, max)) : Math.min(max, Math.max(price, min));

  // --- SL / TP from the signal's optimized (per-analysis) levels ---
  const slRaw = Number(signal.stop_loss_optimized ?? signal.stop_loss ?? 0);
  const tp1Raw = Number(signal.take_profit_1_optimized ?? signal.take_profit_1 ?? 0);
  const tp2Raw = Number(signal.take_profit_2_optimized ?? signal.take_profit_2 ?? 0);
  const tp3Raw = Number(signal.take_profit_3_optimized ?? signal.take_profit_3 ?? 0);
  if (!(slRaw > 0)) return fail('signal has no stop loss');
  if (!(tp1Raw > 0)) return fail('signal has no take profit');

  const slPrice = slRaw;
  const tpPrices = [tp1Raw, ...(tp2Raw > 0 ? [tp2Raw] : []), ...(tp3Raw > 0 ? [tp3Raw] : [])];

  // Directional sanity
  if (side === 'buy') {
    if (slPrice >= entryPrice) return fail('SL above entry on a buy');
    if (tpPrices.some((tp) => tp <= entryPrice)) return fail('TP at or below entry on a buy');
  } else {
    if (slPrice <= entryPrice) return fail('SL below entry on a sell');
    if (tpPrices.some((tp) => tp >= entryPrice)) return fail('TP at or above entry on a sell');
  }

  // Distance guards: SL close enough to be meaningful, far enough to not trigger on noise
  const slDistPct = (Math.abs(entryPrice - slPrice) / entryPrice) * 100;
  if (slDistPct < MIN_SL_DISTANCE_PCT) return fail('stop loss too tight');
  if (slDistPct > MAX_SL_DISTANCE_PCT) return fail('stop loss too far (stale signal)');

  // --- Quantity from capital and (possibly safety-capped) position % ---
  let positionPct = ctx.positionPct;
  // Launch safety window (first N trades OR first D days): cap the position size
  // regardless of the chosen profile. The window logic lives in engine.ts; here
  // we only enforce the resulting cap.
  if (ctx.safety?.enabled && positionPct > ctx.safety.maxPct) {
    positionPct = ctx.safety.maxPct;
  }
  if (!(positionPct > 0) || positionPct > 100) return fail('invalid position percentage');

  const notionalUsd = ctx.capitalUsd * (positionPct / 100);
  const quantity = notionalUsd / entryPrice;
  if (!(quantity > 0)) return fail('zero quantity');

  const riskUsd = Math.abs(entryPrice - slPrice) * quantity;
  const riskPct = ctx.capitalUsd > 0 ? (riskUsd / ctx.capitalUsd) * 100 : 0;
  // Risk guard: a single trade may not risk more than 4% of capital (standard practice).
  if (riskPct > 4) return fail(`risk ${riskPct.toFixed(2)}% exceeds 4% cap`);

  return {
    signalId: signal.id, symbol, side, entryPrice, slPrice, tpPrices,
    quantity: roundDown(quantity, 6), notionalUsd, riskUsd, riskPct, positionPct,
    skipped: false,
  };
}

// Round DOWN so we never try to buy more than the balance allows.
export function roundDown(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.floor(value * f) / f;
}
