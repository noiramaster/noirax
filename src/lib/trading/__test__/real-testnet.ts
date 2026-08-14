/**
 * REAL TESTNET end-to-end test — Binance Spot Test Network.
 *
 * Drives the REAL engine and the REAL user-facing API against
 * testnet.binance.vision with REAL testnet API keys:
 *
 *   1. validates the keys against the exchange's account API
 *   2. pre-funds BTC on the testnet (Binance requires holding the base asset
 *      to place SELL-side protections)
 *   3. connects the keys through the app's own HTTP API (/api/trading/manual)
 *      like a real user (auth token + preview + execute)
 *   4. proves the OCO SL/TP + entry exist ON the exchange by querying it directly
 *   5. closes the position with a real market order and verifies the engine
 *      reconciles the fill (PnL + commission + closed trade in the DB)
 *
 * Run with:
 *   $env:TESTNET_BINANCE_API_KEY="..."
 *   $env:TESTNET_BINANCE_SECRET="..."
 *   npx tsx src/lib/trading/__test__/real-testnet.ts
 *
 * No real money can move: the connection is flagged testnet, so every adapter
 * call routes to testnet.binance.vision.
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
// Unset so the engine talks to the REAL exchange adapter (not PaperExchange):
delete process.env.SIMULATE_EXCHANGE;
process.env.TRADING_TESTNET_FORCE = 'true'; // hard guarantee: testnet endpoints only
process.env.TRADING_ENGINE_ENABLED = 'true';
process.env.TRADING_SAFETY_MODE = 'true';
process.env.TRADING_SAFETY_MAX_PCT = '3';

import { getServiceSupabase } from '../../supabase';
import { runEngine } from '../engine';
import { encryptSecretAsync } from '../../exchangeCrypto';

const API_KEY = process.env.TESTNET_BINANCE_API_KEY || '';
const SECRET = process.env.TESTNET_BINANCE_SECRET || '';
assert.ok(API_KEY && SECRET, 'TESTNET_BINANCE_API_KEY / TESTNET_BINANCE_SECRET env vars required');
const TESTNET_BASE = 'https://testnet.binance.vision';
const APP_BASE = process.env.APP_BASE || 'http://localhost:3999';

const supabase = getServiceSupabase();
let createdUserId = '';
let createdConnectionId = '';
let createdSignalId = '';
const createdTradeIds: string[] = [];
let accessToken = '';

// Direct signed call against the testnet exchange (independent proof).
async function testnetSigned(path: string, method: 'GET' | 'POST' | 'DELETE' = 'GET', apiKey = API_KEY, secret = SECRET) {
  const ts = Date.now();
  const [pathPart, queryPart = ''] = path.split('?');
  const qs = `${queryPart ? queryPart + '&' : ''}timestamp=${ts}`;
  const sig = await crypto.subtle
    .importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    .then((k) => crypto.subtle.sign('HMAC', k, new TextEncoder().encode(qs)))
    .then((s) => [...new Uint8Array(s)].map((b) => b.toString(16).padStart(2, '0')).join(''));
  const url = `${TESTNET_BASE}/api/v3/${pathPart}?${qs}&signature=${sig}`;
  const res = await fetch(url, {
    method,
    headers: { 'X-MBX-APIKEY': apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return { status: res.status, body: await res.json() };
}

// Flatten every position and cancel every open order on the testnet.
async function flattenExchange() {
  const symbols = ['BTCUSDT', 'FILUSDT', 'RENDERUSDT'];
  for (const symbol of symbols) {
    try {
      const open = await testnetSigned(`openOrders?symbol=${symbol}&recvWindow=5000`);
      for (const o of (open.body || []) as { orderId: string }[]) {
        await testnetSigned(`order?symbol=${symbol}&orderId=${o.orderId}&recvWindow=5000`, 'DELETE');
      }
      const acc = await testnetSigned('account');
      const balances = (acc.body.balances || []) as { asset: string; free: string }[];
      const base = symbol.replace('USDT', '');
      const free = Number(balances.find((b) => b.asset === base)?.free ?? 0);
      if (free > 0.0000001) {
        const qty = Math.floor(free * 1e6) / 1e6;
        await testnetSigned(`order?symbol=${symbol}&side=SELL&type=MARKET&quantity=${qty}&recvWindow=5000`, 'POST');
      }
    } catch {
      // ignore
    }
  }
}

async function cleanup() {
  await flattenExchange().catch(() => {});
  if (createdTradeIds.length) await supabase.from('auto_trades').delete().in('id', createdTradeIds);
  if (createdSignalId) await supabase.from('signals').delete().eq('id', createdSignalId);
  if (createdConnectionId) {
    await supabase.from('exchange_connections').delete().eq('id', createdConnectionId);
    await supabase.from('executed_signals').delete().eq('connection_id', createdConnectionId);
    await supabase.from('paper_orders').delete().eq('connection_id', createdConnectionId);
  }
  if (createdUserId) {
    await supabase.from('auto_trades').delete().eq('user_id', createdUserId);
    await supabase.from('executed_signals').delete().eq('user_id', createdUserId);
    await supabase.from('trading_events').delete().eq('user_id', createdUserId);
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${createdUserId}`, {
      method: 'DELETE',
      headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
    });
  }
}

async function main() {
  console.log('=== 0. Credential validation against testnet.binance.vision ===');
  const acc = await testnetSigned('account', 'GET');
  assert.equal(acc.status, 200, `testnet account call failed: ${JSON.stringify(acc.body).slice(0, 200)}`);
  const usdt = (acc.body.balances || []).find((b: { asset: string }) => b.asset === 'USDT');
  console.log(`OK: canTrade=${acc.body.canTrade} permissions=${acc.body.permissions} USDT balance=${usdt?.free}`);
  assert.ok(acc.body.canTrade, 'testnet key must have trading permission');
  assert.ok(Number(usdt?.free) > 0, 'testnet account must have USDT balance');

  console.log('\n=== 1. Setup: user + session + testnet connection + synthetic signal ===');
  const email = `real-testnet.${Date.now()}@noirax.test`;
  const password = 'RealTestnet!' + Math.random().toString(36).slice(2, 10);
  const u = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  }).then((r) => r.json());
  assert.ok(u.id, `user creation failed: ${JSON.stringify(u).slice(0, 200)}`);
  createdUserId = u.id;
  console.log('user created:', createdUserId);

  const tokenRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then((r) => r.json());
  accessToken = tokenRes.access_token;
  assert.ok(accessToken, `login failed: ${JSON.stringify(tokenRes).slice(0, 200)}`);
  console.log('app session obtained (password grant)');

  // Binance spot requires holding the base asset to place SELL-side protections.
  await testnetSigned('order?symbol=BTCUSDT&side=BUY&type=MARKET&quantity=0.2&recvWindow=5000', 'POST');
  console.log('pre-funded 0.2 BTC on the testnet (covers SELL-side SL/TP protections)');

  const ticker = await fetch(`${TESTNET_BASE}/api/v3/ticker/price?symbol=BTCUSDT`).then((r) => r.json());
  const btc = parseFloat(ticker.price);
  assert.ok(btc > 0, 'testnet BTC price unavailable');
  console.log('testnet BTC price:', btc);

  const { data: signal, error: signalErr } = await supabase.from('signals').insert({
    coin: 'BTC/USDT',
    exchange: 'binance',
    signal_type: 'buy',
    confidence: 70,
    explanation_en: 'real testnet verification signal',
    explanation_es: 'señal de verificación testnet real',
    tier: 'free',
    entry_price: btc,
    entry_price_min: btc * 0.975,
    entry_price_max: btc * 1.025,
    stop_loss: btc * 0.955,
    stop_loss_optimized: btc * 0.955,
    take_profit_1: btc * 1.06,
    take_profit_1_optimized: btc * 1.06,
    take_profit_2_optimized: btc * 1.09,
    take_profit_3_optimized: btc * 1.12,
    slug: `real-testnet-btc-${Date.now()}`,
    timeframe: '1h',
    resolved_result: 'pending',
  }).select('id').single();
  assert.ok(!signalErr && signal?.id, `signal insert failed: ${signalErr?.message}`);
  createdSignalId = (signal as { id: string }).id;
  console.log('synthetic signal created (BTC/USDT buy)');

  const keyEnc = await encryptSecretAsync(API_KEY);
  const secretEnc = await encryptSecretAsync(SECRET);
  const { data: conn, error: connErr } = await supabase.from('exchange_connections').insert({
    user_id: createdUserId,
    exchange: 'binance',
    api_key_enc: keyEnc,
    api_secret_enc: secretEnc,
    key_hint: API_KEY.slice(-4),
    mode: 'auto',
    profile: 'moderate',
    position_pct: 10,
    daily_loss_limit_pct: 5,
    max_positions: 2,
    status: 'active',
    testnet: true,
    legal_version: 'v2',
  }).select('id,testnet').single();
  assert.ok(!connErr && conn?.id, `connection insert failed: ${connErr?.message}`);
  createdConnectionId = (conn as { id: string }).id;
  assert.equal((conn as unknown as { testnet: boolean }).testnet, true);
  console.log('connection created (testnet=true)');

  console.log('\n=== 2. App API preview (real user flow) ===');
  const preview = await fetch(`${APP_BASE}/api/trading/manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ action: 'preview', signalId: createdSignalId }),
  });
  const previewData = await preview.json();
  assert.equal(preview.status, 200, `preview failed: ${JSON.stringify(previewData)}`);
  console.log(`preview: entry=${previewData.plan.entryPrice} SL=${previewData.plan.slPrice} TP=${previewData.plan.tpPrices.join('/')} qty=${previewData.plan.quantity} testnet=${previewData.connection.testnet}`);
  assert.equal(previewData.connection.testnet, true);
  assert.ok(previewData.plan.quantity > 0);

  console.log('\n=== 3. App API execute -> order on the REAL testnet ===');
  const exec = await fetch(`${APP_BASE}/api/trading/manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ action: 'execute', signalId: createdSignalId }),
  });
  const execData = await exec.json();
  assert.equal(exec.status, 200, `execute failed: ${JSON.stringify(execData)}`);
  console.log(`execute OK: tradeId=${execData.tradeId}`);
  createdTradeIds.push(execData.tradeId);

  const { data: tradeRow } = await supabase.from('auto_trades').select('*').eq('id', execData.tradeId).single();
  assert.ok(tradeRow, 'trade row missing in DB');
  assert.equal(tradeRow.testnet, true, 'trade must be flagged testnet');
  console.log(`DB trade: ${tradeRow.symbol} qty=${tradeRow.quantity} entry=${tradeRow.entry_price} SL=${tradeRow.entry_sl_price} TP=${tradeRow.entry_tp_prices.join('/')}`);

  console.log('\n=== 4. Prove orders exist ON the exchange (direct testnet query) ===');
  const openOrders = await testnetSigned('openOrders?symbol=BTCUSDT&recvWindow=5000');
  const list = openOrders.body || [];
  console.log(`open orders on testnet for BTCUSDT: ${list.length}`);
  for (const o of list) {
    console.log(`  ${o.type} ${o.side} qty=${o.quantity} price=${o.price} stopPrice=${o.stopPrice} status=${o.status}`);
  }
  assert.ok(list.length >= 2, 'expected OCO (SL+TP) orders visible on the exchange');
  const hasSL = list.some((o: { stopPrice: string }) => Number(o.stopPrice) > 0);
  const hasTP = list.some((o: { type: string; price: string }) => o.type === 'LIMIT_MAKER' || (o.type === 'LIMIT' && Number(o.price) > Number(tradeRow.entry_price)));
  assert.ok(hasSL, 'stop-loss leg missing on the exchange');
  assert.ok(hasTP, 'take-profit leg missing on the exchange');

  const myTrades = await testnetSigned('myTrades?symbol=BTCUSDT&limit=30');
  const entryFills = (myTrades.body || []).filter((t: { isBuyer: boolean }) => t.isBuyer === true);
  console.log(`buy fills on the exchange (last 30 trades): ${entryFills.length}`);
  assert.ok(entryFills.length >= 2, 'entry order must have filled on the testnet (pre-fund + entry)');

  // Pause the connection so the scheduled engine won't place more orders for
  // other fresh signals while we verify the close cycle.
  await supabase.from('exchange_connections').update({ status: 'paused' }).eq('id', createdConnectionId);

  console.log('\n=== 5. Close: cancel protection + real market sell on the exchange ===');
  for (const o of list) {
    const r = await testnetSigned(`order?symbol=BTCUSDT&orderId=${o.orderId}&recvWindow=5000`, 'DELETE');
    if (r.status !== 200) {
      // OCO legs can only be cancelled together; the next sweep handles the rest.
      console.log(`  note: cancel ${o.orderId} -> ${JSON.stringify(r.body).slice(0, 100)}`);
    }
  }
  // Sweep whatever remains (e.g. remaining OCO legs / list ids).
  const remaining = await testnetSigned('openOrders?symbol=BTCUSDT&recvWindow=5000');
  for (const o of (remaining.body || []) as { orderId: string }[]) {
    const r = await testnetSigned(`order?symbol=BTCUSDT&orderId=${o.orderId}&recvWindow=5000`, 'DELETE');
    if (r.status !== 200) console.log(`  note: sweep cancel ${o.orderId} -> ${JSON.stringify(r.body).slice(0, 100)}`);
  }
  const afterCancel = await testnetSigned('openOrders?symbol=BTCUSDT&recvWindow=5000');
  assert.equal((afterCancel.body || []).length, 0, `protection orders still open: ${JSON.stringify(afterCancel.body).slice(0, 200)}`);
  console.log('protection orders cancelled');

  // Sell exactly the position the engine opened (entry qty rounded to the
  // exchange's LOT_SIZE step, like the adapter does for limit orders).
  const sellQty = Math.floor(Number(tradeRow.quantity) * 1e5) / 1e5;
  const sell = await testnetSigned(`order?symbol=BTCUSDT&side=SELL&type=MARKET&quantity=${sellQty}&recvWindow=5000`, 'POST');
  assert.equal(sell.status, 200, `market sell failed: ${JSON.stringify(sell.body).slice(0, 200)}`);
  console.log(`market sell placed on testnet: ${sellQty} BTC @ market (orderId=${sell.body.orderId})`);

  console.log('\n=== 6. Engine reconcile: real fill -> closed trade ===');
  await new Promise((r) => setTimeout(r, 1500));
  const r2 = await runEngine();
  console.log('reconcile report:', JSON.stringify(r2));
  const { data: closed } = await supabase.from('auto_trades').select('*').eq('id', execData.tradeId).maybeSingle();
  assert.ok(closed && closed.status === 'closed', `trade must be closed, got status=${closed?.status}`);
  console.log(`trade closed: reason=${closed.closed_reason} exit=${closed.exit_price} pnl_net=${closed.pnl_net} fees=${closed.fees_paid} commission=${closed.commission_amount} rate=${closed.commission_rate}`);
  assert.ok(Number(closed.exit_price) > 0, 'exit price must be set');
  assert.ok(closed.closed_at, 'closed_at must be set');

  console.log('\n=== REAL TESTNET CYCLE PASSED ===');
  console.log('keys -> validation -> app API (preview+execute) -> OCO SL/TP on testnet.binance.vision -> fill -> real market close -> reconcile -> PnL + commission in DB');

  console.log('\n=== 7. Cleanup ===');
  await cleanup();
  console.log('cleanup done');
  process.exit(0);
}

main().catch(async (e) => {
  console.error('REAL TESTNET FAILED:', e);
  if (createdUserId) {
    try {
      const { data: evts } = await supabase.from('trading_events').select('event_type,level,message,created_at').eq('user_id', createdUserId).order('created_at', { ascending: false }).limit(10);
      console.error('recent events for the test user:');
      for (const ev of evts || []) console.error(`  ${ev.event_type} [${ev.level}]: ${ev.message}`);
    } catch {
      // ignore
    }
  }
  await cleanup().catch(() => {});
  process.exit(1);
});
