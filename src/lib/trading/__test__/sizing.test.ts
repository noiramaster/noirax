import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTradePlan, type SignalLike } from '../sizing';

const baseSignal: SignalLike = {
  id: 'sig-1',
  coin: 'BTC/USDT',
  signal_type: 'buy',
  entry_price: 60000,
  entry_price_min: 59500,
  entry_price_max: 60500,
  stop_loss: 57000,
  take_profit_1: 64000,
  take_profit_2: 66000,
  take_profit_3: null,
  stop_loss_optimized: 57000,
  take_profit_1_optimized: 64000,
  take_profit_2_optimized: 66000,
  take_profit_3_optimized: null,
};

const ctx = {
  capitalUsd: 10000,
  positionPct: 10,
  marketPrice: 60000,
};

test('builds a valid protected plan (entry in zone, SL/TP attached)', () => {
  const p = buildTradePlan(baseSignal, ctx);
  assert.equal(p.skipped, false);
  assert.equal(p.entryPrice, 60000);
  assert.equal(p.slPrice, 57000);
  assert.deepEqual(p.tpPrices, [64000, 66000]);
  assert.ok(p.quantity > 0);
  assert.ok(Math.abs(p.notionalUsd - 1000) < 1); // 10% of 10k
  // risk = (60000-57000)/60000 * 1000 = 50 USDT = 0.5%
  assert.ok(p.riskPct > 0.4 && p.riskPct < 0.6);
});

test('safety mode caps position size regardless of profile', () => {
  const p = buildTradePlan(baseSignal, {
    ...ctx,
    positionPct: 15,
    safety: { enabled: true, maxPct: 3, tradesUsed: 1, daysUsed: 1 },
  });
  assert.equal(p.skipped, false);
  assert.ok(Math.abs(p.notionalUsd - 300) < 1); // capped at 3%
  assert.equal(p.positionPct, 3);
});

test('rejects when market price left the entry zone (stale signal)', () => {
  const p = buildTradePlan(baseSignal, { ...ctx, marketPrice: 61200 });
  assert.equal(p.skipped, true);
  assert.match(p.skipReason ?? '', /outside signal entry zone/);
});

test('rejects invalid SL/TP geometry (SL above entry on buy)', () => {
  const p = buildTradePlan({ ...baseSignal, stop_loss_optimized: 60500 }, ctx);
  assert.equal(p.skipped, true);
  assert.match(p.skipReason ?? '', /SL above entry/);
});

test('risk is bounded: for any allowed SL distance, riskPct stays under 4%', () => {
  // With positionPct <= 15 and SL distance <= 12%, the max risk is 1.8%.
  for (const slDistPct of [1, 3, 5, 8, 11]) {
    const sl = 60000 * (1 - slDistPct / 100);
    const p = buildTradePlan({ ...baseSignal, stop_loss_optimized: sl }, {
      capitalUsd: 1000, positionPct: 15, marketPrice: 60000,
    });
    assert.equal(p.skipped, false, `slDist ${slDistPct}% should pass`);
    assert.ok(p.riskPct < 4, `riskPct ${p.riskPct} must stay under 4%`);
  }
});

test('rejects signals without SL or TP (never unprotected)', () => {
  const noSl = buildTradePlan({ ...baseSignal, stop_loss_optimized: null, stop_loss: 0 }, ctx);
  assert.equal(noSl.skipped, true);
  const noTp = buildTradePlan({ ...baseSignal, take_profit_1_optimized: null, take_profit_1: 0 }, ctx);
  assert.equal(noTp.skipped, true);
});

test('sell plans use mirrored geometry', () => {
  const sellSignal: SignalLike = {
    ...baseSignal,
    signal_type: 'sell',
    entry_price: 61500,
    entry_price_min: 61000,
    entry_price_max: 62000,
    stop_loss: 63500,
    take_profit_1: 59500,
    take_profit_2: 58000,
    stop_loss_optimized: 63500,
    take_profit_1_optimized: 59500,
    take_profit_2_optimized: 58000,
  };
  const p = buildTradePlan(sellSignal, { ...ctx, marketPrice: 61500 });
  assert.equal(p.skipped, false);
  assert.ok(p.slPrice > p.entryPrice, 'sell SL must be above entry');
  assert.ok(p.tpPrices.every((tp) => tp < p.entryPrice), 'sell TPs must be below entry');
});
