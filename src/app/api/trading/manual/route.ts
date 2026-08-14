import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/apiAuth';
import { getServiceSupabase } from '@/lib/supabase';
import { getAdapterForConnection, loadConfig } from '@/lib/trading/engine';
import { checkTradingCaps, buildPlanForSignal, executePlan } from '@/lib/trading/engine';
import { logEvent } from '@/lib/trading/events';

export const maxDuration = 60;

// One-click trade from any signal page. Two actions:
//  - preview: returns the exact plan (entry/SL/TP/quantity) BEFORE executing
//  - execute: re-validates everything server-side and places the protected order
// The confirmation modal ALWAYS shows the preview data; direct execution without
// that step is impossible.
export async function POST(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  let body: { action?: string; signalId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const action = body.action === 'execute' ? 'execute' : 'preview';
  const signalId = String(body.signalId || '');
  if (!signalId) {
    return NextResponse.json({ error: 'signalId is required.' }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  const { data: signal } = await supabase.from('signals').select('*').eq('id', signalId).maybeSingle();
  if (!signal) {
    return NextResponse.json({ error: 'Signal not found.' }, { status: 404 });
  }
  if (signal.signal_type !== 'buy') {
    return NextResponse.json({ error: 'One-click trading is available for buy signals.' }, { status: 400 });
  }

  // Active connections: prefer a real one, fall back to paper mode.
  const { data: conns } = await supabase
    .from('exchange_connections')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('exchange', { ascending: true }); // 'paper' sorts first; pick non-paper below
  const conn = (conns || []).find((c) => c.exchange !== 'paper') ?? (conns || [])[0];
  if (!conn) {
    return NextResponse.json({ error: 'You need an active connection (real or paper mode) to trade with one click.' }, { status: 409 });
  }

  const cfg = await loadConfig();
  let adapterCtx;
  try {
    adapterCtx = await getAdapterForConnection(conn, cfg);
  } catch (e) {
    await logEvent({ user_id: user.id, connection_id: conn.id, event_type: 'manual_decrypt_failed', level: 'error', message: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: 'Could not prepare your connection.' }, { status: 500 });
  }
  const { adapter, apiKey, apiSecret, opts } = adapterCtx;

  if (!adapter.getTickerPrice || !adapter.getBalanceUsdt || !adapter.placeProtectedEntry) {
    return NextResponse.json({ error: `Execution is not available for ${conn.exchange} yet.` }, { status: 501 });
  }

  // Server-side re-validation of EVERYTHING (brake, caps, plan).
  const caps = await checkTradingCaps(conn, adapter, apiKey, apiSecret, opts);
  if (!caps.ok) {
    return NextResponse.json({ error: caps.reason === 'brake_triggered' ? 'Daily loss brake triggered — trading paused.' : 'Risk limits reached — no more trades right now.' }, { status: 409 });
  }

  let plan;
  try {
    plan = (await buildPlanForSignal(conn, adapter, apiKey, apiSecret, opts, signal, cfg, caps.capital)).plan;
  } catch (e) {
    return NextResponse.json({ error: `Could not fetch the live price: ${e instanceof Error ? e.message : 'unknown'}` }, { status: 502 });
  }
  if (plan.skipped) {
    return NextResponse.json({ error: plan.skipReason ?? 'This signal cannot be traded right now.' }, { status: 409 });
  }

  const isPaper = conn.exchange === 'paper';
  if (action === 'preview') {
    return NextResponse.json({
      signal: { coin: signal.coin },
      connection: { exchange: conn.exchange, isPaper, testnet: !!conn.testnet || process.env.TRADING_TESTNET_FORCE === 'true' },
      plan: {
        entryPrice: plan.entryPrice,
        slPrice: plan.slPrice,
        tpPrices: plan.tpPrices,
        quantity: plan.quantity,
        notionalUsd: Math.round(plan.notionalUsd * 100) / 100,
        riskPct: Math.round(plan.riskPct * 100) / 100,
        positionPct: plan.positionPct,
      },
    });
  }

  const exec = await executePlan(conn, plan, cfg, adapter, apiKey, apiSecret, opts, signal.id, true);
  if (!exec.ok) {
    return NextResponse.json({ error: exec.error ?? 'The exchange rejected the order.' }, { status: 502 });
  }
  await logEvent({ user_id: user.id, connection_id: conn.id, trade_id: exec.tradeId, event_type: 'manual_trade_executed', message: `${plan.symbol} one-click ${isPaper ? '(paper)' : ''}` });
  return NextResponse.json({ ok: true, tradeId: exec.tradeId, isPaper });
}
