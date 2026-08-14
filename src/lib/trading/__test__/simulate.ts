/**
 * END-TO-END engine simulation against the production Supabase schema, using the
 * PaperExchange (SIMULATE_EXCHANGE=true): real market prices (Bybit), simulated
 * order placement/fills. NO real money moves. Creates test users + connections
 * + synthetic signals, runs the engine, asserts the full lifecycle, then cleans
 * everything up.
 *
 * Run with:  npx tsx src/lib/trading/__test__/simulate.ts
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';

// --- env bootstrap (read .env.local BEFORE calling any app module) ---
const lines = fs.readFileSync('C:/Users/aissa/noirax/.env.local', 'utf-8').split('\n');
const getEnv = (k: string) => {
  const l = lines.find((x: string) => x.startsWith(k + '='));
  return l ? l.split('=').slice(1).join('=').trim() : '';
};
process.env.NEXT_PUBLIC_SUPABASE_URL = getEnv('NEXT_PUBLIC_SUPABASE_URL');
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
process.env.SUPABASE_SERVICE_ROLE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY');
process.env.EXCHANGE_MASTER_KEY = getEnv('EXCHANGE_MASTER_KEY');
process.env.SIMULATE_EXCHANGE = 'true';
process.env.TRADING_ENGINE_ENABLED = 'true';
process.env.TRADING_SAFETY_MODE = 'true';
process.env.TRADING_SAFETY_MAX_PCT = '3';
process.env.TRADING_APPROVAL_EXPIRY_MINUTES = '0.001'; // ~60ms: expiry testable within one run

import { getServiceSupabase } from '../../supabase';
import { runEngine } from '../engine';
import { paperReset, paperSetPrice } from '../paper';

const supabase = getServiceSupabase();
paperReset(); // one clean paper state for the whole simulation
const created: string[] = [];
const createdUsers: string[] = [];
const createdSignals: string[] = [];

async function createUser(tag: string) {
  const email = `sim.${tag}.${Date.now()}@noirax.test`;
  const password = 'SimTest!' + Math.random().toString(36).slice(2, 10);
  const resp = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const d = await resp.json();
  assert.equal(resp.status, 200, `user creation failed: ${JSON.stringify(d)}`);
  createdUsers.push(d.id);
  return d.id;
}

async function insertSignal(coin: string, price: number, tag: string): Promise<string> {
  const slug = `sim-${tag}-${Date.now()}`;
  const { data, error } = await supabase.from('signals').insert({
    coin,
    exchange: 'bybit',
    signal_type: 'buy',
    confidence: 60,
    explanation_en: 'simulation signal',
    explanation_es: 'señal de simulación',
    tier: 'free',
    entry_price: price,
    entry_price_min: price * 0.99,
    entry_price_max: price * 1.01,
    stop_loss: price * 0.98,
    take_profit_1: price * 1.05,
    take_profit_1_optimized: price * 1.05,
    stop_loss_optimized: price * 0.98,
    slug,
    timeframe: '1h',
    resolved_result: 'pending',
  }).select('id').single();
  assert.ok(!error, `signal insert failed: ${error?.message}`);
  createdSignals.push(data!.id);
  return data!.id;
}

async function insertConnection(userId: string, mode: 'auto' | 'confirm') {
  const { data, error } = await supabase.from('exchange_connections').insert({
    user_id: userId,
    exchange: 'bybit',
    api_key_enc: 'simulation',
    api_secret_enc: 'simulation',
    key_hint: 'SIMU',
    mode,
    profile: 'moderate',
    position_pct: 10,
    daily_loss_limit_pct: 5,
    max_positions: 2,
    status: 'active',
    testnet: true,
    legal_version: 'v2',
  }).select('id').single();
  assert.ok(!error, `connection insert failed: ${error?.message}`);
  created.push(data!.id);
  return data!.id;
}

async function cleanup() {
  for (const id of created) {
    await supabase.from('exchange_connections').delete().eq('id', id);
    await supabase.from('paper_orders').delete().eq('connection_id', id);
  }
  for (const id of createdSignals) await supabase.from('signals').delete().eq('id', id);
  for (const uid of createdUsers) {
    await supabase.from('auto_trades').delete().eq('user_id', uid);
    await supabase.from('executed_signals').delete().eq('user_id', uid);
    await supabase.from('trading_events').delete().eq('user_id', uid);
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${uid}`, {
      method: 'DELETE',
      headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
    });
  }
}

async function main() {
  console.log('--- SIMULATION SETUP ---');
  const userAuto = await createUser('auto');
  const userConfirm = await createUser('confirm');
  await insertConnection(userAuto, 'auto');
  await insertConnection(userConfirm, 'confirm');
  console.log('test users + connections created');

  // Market price for BTC to build a realistic synthetic signal.
  const ticker = await fetch('https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT').then((r) => r.json());
  const btc = parseFloat(ticker.result?.list?.[0]?.lastPrice ?? '60000');
  console.log('BTC price:', btc);

  // A second coin for the confirm-mode user (dedupe is per user, signals are global).
  await insertSignal('BTC/USDT', btc, 'auto');
  await insertSignal('ETH/USDT', btc * 0.05, 'confirm');
  console.log('synthetic signals inserted');

  console.log('\n--- RUN 1 (place + confirm pending) ---');
  const r1 = await runEngine();
  console.log('run1 report:', JSON.stringify(r1));

  const { data: autoTrades } = await supabase.from('auto_trades').select('*').eq('user_id', userAuto);
  const open = autoTrades?.find((t: { status: string }) => t.status === 'open');
  assert.ok(open, 'auto mode: expected an open trade');
  assert.ok(Number(open.entry_price) > 0 && Number(open.entry_sl_price) > 0 && (open.entry_tp_prices ?? []).length >= 1, 'trade must carry SL and TP');
  // Safety mode: 3% of 10,000 paper USDT = max 300 USDT notional
  const notional = Number(open.entry_price) * Number(open.quantity);
  assert.ok(notional <= 300 * 1.01, `safety cap violated: notional ${notional}`);
  console.log(`auto trade placed: ${open.symbol} qty=${open.quantity} entry=${open.entry_price} SL=${open.entry_sl_price} TP=${open.entry_tp_prices.join('/')} notional=${notional.toFixed(2)} (safety ≤ 300)`);

  const { data: confirmTrades } = await supabase.from('auto_trades').select('*').eq('user_id', userConfirm);
  const pending = confirmTrades?.find((t: { status: string }) => t.status === 'pending');
  assert.ok(pending, 'confirm mode: expected a pending trade');
  assert.ok(pending.approval_expires_at, 'pending must have an expiry');
  console.log(`confirm pending created (expires ${pending.approval_expires_at})`);

  console.log('\n--- RUN 2 (dedupe + pending expiry) ---');
  const r2 = await runEngine();
  console.log('run2 report:', JSON.stringify(r2));
  const { count: autoCount } = await supabase.from('auto_trades').select('id', { count: 'exact', head: true }).eq('user_id', userAuto).eq('status', 'open');
  assert.equal(autoCount, 1, 'dedupe failed: second run must not open another trade');
  const { data: expiredPending } = await supabase.from('auto_trades').select('*').eq('user_id', userConfirm).eq('status', 'expired');
  assert.ok(expiredPending!.length >= 1, 'pending confirmation must expire after the window');
  console.log('dedupe OK, pending expired OK');

  console.log('\n--- RUN 3 (forced SL close via paper price) ---');
  // Push the price below the stop: the SL leg fills deterministically.
  paperSetPrice(open.symbol, Number(open.entry_sl_price) * 0.995);
  await runEngine();
  const { data: closedTrades } = await supabase.from('auto_trades').select('*').eq('user_id', userAuto).eq('status', 'closed');
  assert.ok(closedTrades!.length >= 1, 'expected the trade to close after SL fill');
  const closed = closedTrades![0];
  console.log(`trade closed: reason=${closed.closed_reason} exit=${closed.exit_price} pnl=${closed.pnl_net} commission=${closed.commission_amount}`);
  assert.equal(closed.closed_reason, 'sl');
  assert.ok(Number(closed.pnl_net) < 0, 'SL close must be a loss');
  assert.equal(Number(closed.commission_amount), 0, 'no commission on losing trades');

  console.log('\n--- SIMULATION PASSED ---');
  await cleanup();
  console.log('cleanup done');
  process.exit(0);
}

main().catch(async (e) => {
  console.error('SIMULATION FAILED:', e);
  await cleanup().catch(() => {});
  process.exit(1);
});
