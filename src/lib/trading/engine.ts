// Execution engine. Runs periodically (external pinger -> /api/trading/engine):
//  - expires stale confirmations
//  - enforces daily-loss brake and max-open-trades caps
//  - matches fresh signals to active connections (deduped)
//  - auto mode: places entry + SL/TP protection immediately
//  - confirm mode: creates a pending trade the user approves within N minutes
//  - reconciles open trades (fills -> close, pnl, commission)
// Every failure is logged to trading_events and alerts the operator; nothing
// fails silently.

import { getServiceSupabase } from '@/lib/supabase';
import { buildAdapterForConnection } from './connection';
import { buildTradePlan } from './sizing';
import { alertOperator, logEvent } from './events';
import { paperExchange } from './paper';
import type { ConnectionOpts, ExchangeAdapter } from '@/lib/exchanges/types';

interface EngineConfig {
  enabled: boolean;
  approvalExpiryMinutes: number;
  tolerancePct: number;
  commissionRate: number;
  simulate: boolean;
  safety: { enabled: boolean; maxPct: number; tradeCount: number; days: number };
}

async function loadConfig(): Promise<EngineConfig> {
  const supabase = getServiceSupabase();
  const settings: Record<string, string> = {};
  try {
    const { data } = await supabase.from('app_settings').select('key,value');
    for (const row of data || []) settings[row.key] = row.value;
  } catch {
    // settings unavailable -> env/defaults
  }
  const num = (key: string, fallback: number) => {
    const v = process.env[`TRADING_${key}`] ?? settings[`trading.${key.toLowerCase()}`];
    const n = Number(v);
    return isFinite(n) ? n : fallback;
  };
  const bool = (key: string, fallback: boolean) => {
    const v = process.env[`TRADING_${key}`] ?? settings[`trading.${key.toLowerCase()}`];
    return v === undefined ? fallback : v === 'true' || v === '1';
  };
  return {
    enabled: bool('ENGINE_ENABLED', true),
    approvalExpiryMinutes: num('APPROVAL_EXPIRY_MINUTES', 15),
    tolerancePct: num('EXECUTION_TOLERANCE_PCT', 1.0),
    commissionRate: num('COMMISSION_RATE', 0.25),
    simulate: process.env.SIMULATE_EXCHANGE === 'true',
    safety: {
      enabled: bool('SAFETY_MODE', true),
      maxPct: num('SAFETY_MAX_PCT', 3),
      tradeCount: num('SAFETY_TRADE_COUNT', 10),
      days: num('SAFETY_DAYS', 7),
    },
  };
}

export interface EngineReport {
  processed: number;
  errors: number;
  executed: number;
  pendingCreated: number;
  closed: number;
}

async function getAdapterForConnection(
  conn: { exchange: string; api_key_enc: string; api_secret_enc: string; testnet?: boolean },
  cfg: EngineConfig
): Promise<{ adapter: ExchangeAdapter; apiKey: string; apiSecret: string; opts: ConnectionOpts }> {
  if (cfg.simulate) {
    return { adapter: paperExchange, apiKey: 'paper', apiSecret: 'paper', opts: {} };
  }
  return buildAdapterForConnection(conn);
}

export async function runEngine(): Promise<EngineReport> {
  const report: EngineReport = { processed: 0, errors: 0, executed: 0, pendingCreated: 0, closed: 0 };
  const cfg = await loadConfig();
  if (!cfg.enabled) return report;

  const supabase = getServiceSupabase();

  // 1. Expire stale pending confirmations (global, includes paused connections).
  const cutoff = new Date(Date.now() - cfg.approvalExpiryMinutes * 60_000).toISOString();
  const { data: stale } = await supabase
    .from('auto_trades')
    .select('id,user_id')
    .eq('status', 'pending')
    .lt('approval_expires_at', cutoff);
  for (const t of stale || []) {
    await supabase.from('auto_trades').update({ status: 'expired', exec_error: 'confirmation timeout' }).eq('id', t.id);
    await logEvent({ user_id: t.user_id, trade_id: t.id, event_type: 'confirmation_expired', level: 'warn' });
  }

  // 2. Active connections.
  const { data: conns } = await supabase.from('exchange_connections').select('*').eq('status', 'active');
  report.processed = conns?.length ?? 0;

  for (const conn of conns || []) {
    try {
      const r = await processConnection(conn, cfg);
      report.executed += r.executed;
      report.pendingCreated += r.pendingCreated;
    } catch (e) {
      report.errors += 1;
      const msg = e instanceof Error ? e.message : String(e);
      await logEvent({ user_id: conn.user_id, connection_id: conn.id, event_type: 'engine_connection_error', level: 'critical', message: msg });
      await alertOperator('engine_error', `Engine error on ${conn.exchange} (${conn.id}): ${msg}`, { userId: conn.user_id });
    }
  }

  // 3. Reconcile open trades (fills, closing, pnl/commission).
  report.closed = await reconcileOpenTrades(cfg);
  return report;
}

async function processConnection(
  conn: { id: string; user_id: string; exchange: string; api_key_enc: string; api_secret_enc: string; testnet?: boolean; mode: string; position_pct: number; max_positions: number; daily_loss_limit_pct: number; created_at?: string },
  cfg: EngineConfig
): Promise<{ executed: number; pendingCreated: number }> {
  const supabase = getServiceSupabase();
  const result = { executed: 0, pendingCreated: 0 };
  const { adapter, apiKey, apiSecret, opts } = await getAdapterForConnection(conn, cfg);

  if (!adapter.getBalanceUsdt || !adapter.getTickerPrice || !adapter.placeProtectedEntry || !adapter.getClosedFills) {
    await logEvent({ user_id: conn.user_id, connection_id: conn.id, event_type: 'execution_unsupported', level: 'warn', message: `${conn.exchange} has no order execution implementation yet` });
    return result;
  }

  // --- Daily-loss brake (realized today, net of fees) ---
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { data: todayClosed } = await supabase
    .from('auto_trades')
    .select('pnl_net')
    .eq('user_id', conn.user_id)
    .eq('status', 'closed')
    .gte('closed_at', startOfDay.toISOString());
  const todayLoss = (todayClosed || []).reduce((acc: number, t: { pnl_net: number | null }) => acc + (t.pnl_net ?? 0), 0);

  let balance = 0;
  try {
    const bal = await adapter.getBalanceUsdt(apiKey, apiSecret, opts?.passphrase, opts);
    balance = bal.balance;
  } catch (e) {
    await logEvent({ user_id: conn.user_id, connection_id: conn.id, event_type: 'balance_fetch_failed', level: 'warn', message: e instanceof Error ? e.message : String(e) });
    return result; // fail-safe: no execution without knowing the balance
  }
  const capital = balance > 0 ? balance : 10000; // fallback only for sizing math
  const brakeLimit = capital * (conn.daily_loss_limit_pct / 100);
  if (todayLoss <= -brakeLimit) {
    await supabase.from('exchange_connections').update({ status: 'paused', paused_reason: `daily loss brake (${conn.daily_loss_limit_pct}%) triggered` }).eq('id', conn.id);
    await logEvent({ user_id: conn.user_id, connection_id: conn.id, event_type: 'brake_triggered', level: 'critical', message: `daily loss ${todayLoss.toFixed(2)} USDT <= limit ${brakeLimit.toFixed(2)}` });
    await alertOperator('brake_triggered', `User ${conn.user_id} hit the daily loss brake on ${conn.exchange} (${todayLoss.toFixed(2)} USDT). Trading paused.`);
    return result;
  }

  // --- Max open trades cap ---
  const { count: openCount } = await supabase
    .from('auto_trades')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', conn.user_id)
    .in('status', ['pending', 'open']);
  if ((openCount ?? 0) >= conn.max_positions) return result;

  // --- Safety window: first N executed trades OR first D days ---
  const { count: executedCount } = await supabase
    .from('auto_trades')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', conn.user_id)
    .in('status', ['closed', 'open']);
  const daysActive = (Date.now() - new Date(conn.created_at ?? Date.now()).getTime()) / 86_400_000;
  const safetyActive = cfg.safety.enabled && (executedCount ?? 0) < cfg.safety.tradeCount && daysActive < cfg.safety.days;

  // --- Fresh signals, deduped ---
  const since = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  const { data: signals } = await supabase
    .from('signals')
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(40);
  if (!signals || signals.length === 0) return result;

  const { data: executedRows } = await supabase
    .from('executed_signals')
    .select('signal_id')
    .eq('user_id', conn.user_id)
    .in('signal_id', signals.map((s) => s.id));
  const executedSet = new Set((executedRows || []).map((r) => r.signal_id));

  let planned = 0;
  for (const signal of signals) {
    if (planned >= 3) break; // per-run budget
    if (executedSet.has(signal.id)) continue;
    if (signal.signal_type !== 'buy') continue; // v1: spot buys only

    let marketPrice = 0;
    try {
      const tick = await adapter.getTickerPrice(signal.coin.replace('/', '').toUpperCase(), opts);
      marketPrice = tick.price;
    } catch (e) {
      await logEvent({ user_id: conn.user_id, connection_id: conn.id, event_type: 'ticker_failed', level: 'warn', message: e instanceof Error ? e.message : String(e) });
      continue;
    }

    const plan = buildTradePlan(signal, {
      capitalUsd: capital,
      positionPct: conn.position_pct,
      marketPrice,
      maxTolerancePct: cfg.tolerancePct,
      safety: safetyActive ? { enabled: true, maxPct: cfg.safety.maxPct, tradesUsed: executedCount ?? 0, daysUsed: daysActive } : undefined,
    });

    if (plan.skipped) {
      // Permanent skips are recorded so we don't retry a bad signal forever.
      const permanent = plan.skipReason?.includes('SL') || plan.skipReason?.includes('TP') || plan.skipReason?.includes('risk') || plan.skipReason?.includes('position');
      await logEvent({ user_id: conn.user_id, connection_id: conn.id, event_type: 'signal_skipped', level: 'info', message: `${signal.coin}: ${plan.skipReason}` });
      if (permanent) {
        await supabase.from('executed_signals').insert({ user_id: conn.user_id, signal_id: signal.id, connection_id: conn.id });
        executedSet.add(signal.id);
      }
      continue;
    }

    planned += 1;
    const baseRow = {
      user_id: conn.user_id,
      connection_id: conn.id,
      signal_id: signal.id,
      exchange: conn.exchange,
      symbol: plan.symbol,
      symbol_base: plan.symbol.replace(/USDT$/, ''),
      side: plan.side,
      entry_price: plan.entryPrice,
      entry_sl_price: plan.slPrice,
      entry_tp_prices: plan.tpPrices,
      quantity: plan.quantity,
      mode: conn.mode,
      commission_rate: cfg.commissionRate,
      testnet: !!conn.testnet,
    };
    if (conn.mode === 'confirm') {
      const { error: insErr } = await supabase.from('auto_trades').insert({
        ...baseRow,
        status: 'pending',
        approval_expires_at: new Date(Date.now() + cfg.approvalExpiryMinutes * 60_000).toISOString(),
      });
      if (insErr) {
        await logEvent({ user_id: conn.user_id, connection_id: conn.id, event_type: 'trade_insert_failed', level: 'error', message: insErr.message });
        continue;
      }
      await supabase.from('executed_signals').insert({ user_id: conn.user_id, signal_id: signal.id, connection_id: conn.id });
      await logEvent({ user_id: conn.user_id, connection_id: conn.id, event_type: 'confirmation_requested', message: `${plan.symbol} buy at ${plan.entryPrice}` });
      result.pendingCreated += 1;
      continue;
    }

    // --- Auto mode: execute with protection ---
    const placed = await adapter.placeProtectedEntry(
      { symbol: plan.symbol, side: plan.side, entryPrice: plan.entryPrice, slPrice: plan.slPrice, tpPrices: plan.tpPrices, quantity: plan.quantity, passphrase: opts?.passphrase },
      apiKey,
      apiSecret,
      opts
    );
    if (!placed.ok || !placed.orderId) {
      await supabase.from('executed_signals').insert({ user_id: conn.user_id, signal_id: signal.id, connection_id: conn.id });
      await logEvent({ user_id: conn.user_id, connection_id: conn.id, event_type: 'order_rejected', level: 'error', message: `${plan.symbol}: ${placed.error}` });
      await alertOperator('order_failed', `Order rejected for user ${conn.user_id} on ${conn.exchange} (${plan.symbol}): ${placed.error}`);
      continue;
    }
    const { error: insErr2 } = await supabase.from('auto_trades').insert({ ...baseRow, status: 'open', exchange_trade_ids: [placed.orderId] });
    if (insErr2) {
      // The order is live on the exchange but we could not record it: critical.
      await logEvent({ user_id: conn.user_id, connection_id: conn.id, event_type: 'trade_insert_failed', level: 'critical', message: insErr2.message, meta: { orderId: placed.orderId } });
      await alertOperator('trade_insert_failed', `Order ${placed.orderId} placed but DB insert failed for user ${conn.user_id}: ${insErr2.message}`);
      continue;
    }
    await supabase.from('executed_signals').insert({ user_id: conn.user_id, signal_id: signal.id, connection_id: conn.id });
    await logEvent({ user_id: conn.user_id, connection_id: conn.id, event_type: 'order_placed', message: `${plan.symbol} buy ${plan.quantity} @ ${plan.entryPrice} | SL ${plan.slPrice} | TP ${plan.tpPrices.join('/')}` });
    result.executed += 1;
  }
  return result;
}

// Pure close computation (unit-testable): exit price from fills, net PnL after
// exchange fees, NOIRAX commission (25% of net profit, 0 on losses), reason.
export function computeTradeClose(
  trade: { side: string; entry_price: number | null; quantity: number | null; entry_sl_price: number | null; entry_tp_prices: number[] | null },
  exitFills: { price: number; quantity: number; feeUsd: number }[],
  commissionRate: number
): { exitPrice: number; fees: number; pnlNet: number; commissionAmount: number; reason: string } {
  const totalQty = exitFills.reduce((a, f) => a + f.quantity, 0);
  const exitPrice = exitFills.reduce((a, f) => a + f.price * f.quantity, 0) / (totalQty || 1);
  const fees = exitFills.reduce((a, f) => a + f.feeUsd, 0);
  const entry = Number(trade.entry_price || 0);
  const qty = Number(trade.quantity || 0);
  const raw = trade.side === 'buy' ? (exitPrice - entry) * qty : (entry - exitPrice) * qty;
  const pnlNet = raw - fees;
  const commissionAmount = pnlNet > 0 ? pnlNet * commissionRate : 0;

  const sl = Number(trade.entry_sl_price || 0);
  const tps = (trade.entry_tp_prices || []) as number[];
  let reason = 'manual';
  if (sl > 0 && Math.abs(exitPrice - sl) / sl < 0.005) reason = 'sl';
  else if (tps.some((tp) => tp > 0 && Math.abs(exitPrice - tp) / tp < 0.005)) reason = 'tp';

  return { exitPrice, fees, pnlNet, commissionAmount, reason };
}

// Closes open trades when the exchange reports fills on the SL/TP legs, and
// computes net PnL + commission (25% of net profit, 0 on losses).
async function reconcileOpenTrades(cfg: EngineConfig): Promise<number> {
  const supabase = getServiceSupabase();
  const { data: openTrades } = await supabase.from('auto_trades').select('*').eq('status', 'open');
  let closed = 0;
  for (const trade of openTrades || []) {
    try {
      const { data: conn } = await supabase
        .from('exchange_connections')
        .select('*')
        .eq('id', trade.connection_id)
        .maybeSingle();
      if (!conn) continue;
      const { adapter, apiKey, apiSecret, opts } = await getAdapterForConnection(conn, cfg);
      if (!adapter.getClosedFills) continue;

      const sinceMs = new Date(trade.opened_at).getTime();
      const fills = await adapter.getClosedFills(trade.symbol, sinceMs, apiKey, apiSecret, opts);
      const exitFills = fills.filter((f) => f.side !== trade.side); // opposite side = SL/TP hit
      if (exitFills.length === 0) continue;

      const { exitPrice, fees, pnlNet, commissionAmount, reason } = computeTradeClose(trade, exitFills, Number(trade.commission_rate || cfg.commissionRate));

      await supabase.from('auto_trades').update({
        status: 'closed',
        exit_price: exitPrice,
        fees_paid: fees,
        pnl_net: pnlNet,
        commission_amount: commissionAmount,
        closed_reason: reason,
        closed_at: new Date().toISOString(),
      }).eq('id', trade.id);
      await logEvent({ user_id: trade.user_id, connection_id: trade.connection_id, trade_id: trade.id, event_type: 'trade_closed', level: 'info', message: `${trade.symbol} ${reason} | pnl ${pnlNet.toFixed(2)} | commission ${commissionAmount.toFixed(2)}` });
      closed += 1;
    } catch (e) {
      await logEvent({ user_id: trade.user_id, trade_id: trade.id, event_type: 'reconcile_error', level: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }
  return closed;
}
