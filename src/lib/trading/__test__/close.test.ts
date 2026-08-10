import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTradeClose } from '../engine';

const trade = {
  side: 'buy',
  entry_price: 100,
  quantity: 2,
  entry_sl_price: 95,
  entry_tp_prices: [110, 115],
};

test('winning trade: 25% commission on net profit after fees', () => {
  const r = computeTradeClose(trade, [{ price: 110.1, quantity: 2, feeUsd: 0.4 }], 0.25);
  assert.equal(r.reason, 'tp');
  const gross = (110.1 - 100) * 2; // 20.2
  assert.ok(Math.abs(r.pnlNet - (gross - 0.4)) < 1e-9);
  assert.ok(Math.abs(r.commissionAmount - (gross - 0.4) * 0.25) < 1e-9);
});

test('losing trade: no commission', () => {
  const r = computeTradeClose(trade, [{ price: 95.1, quantity: 2, feeUsd: 0.4 }], 0.25);
  assert.equal(r.reason, 'sl');
  assert.ok(r.pnlNet < 0);
  assert.equal(r.commissionAmount, 0);
});

test('breakeven trade: no commission', () => {
  const r = computeTradeClose({ ...trade, entry_price: 100 }, [{ price: 100, quantity: 2, feeUsd: 0.2 }], 0.25);
  assert.ok(r.pnlNet < 0); // fees push it slightly negative
  assert.equal(r.commissionAmount, 0);
});

test('partial fills: weighted exit price', () => {
  const r = computeTradeClose(trade, [
    { price: 95, quantity: 1, feeUsd: 0.1 },
    { price: 95.5, quantity: 1, feeUsd: 0.1 },
  ], 0.25);
  assert.equal(r.exitPrice, 95.25);
  assert.equal(r.reason, 'sl');
});
