import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/apiAuth';
import { getServiceSupabase } from '@/lib/supabase';
import { buildAdapterForConnection } from '@/lib/trading/connection';
import { logEvent } from '@/lib/trading/events';
import { paperExchange } from '@/lib/trading/paper';

// Approves a pending (confirmation-mode) trade: executes the stored plan with
// SL/TP attached. Expired or already-decided trades cannot be approved.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  const { id } = await params;
  const supabase = getServiceSupabase();

  const { data: trade } = await supabase
    .from('auto_trades')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .maybeSingle();
  if (!trade) {
    return NextResponse.json({ error: 'Pending trade not found or already decided.' }, { status: 404 });
  }
  if (new Date(trade.approval_expires_at).getTime() < Date.now()) {
    await supabase.from('auto_trades').update({ status: 'expired' }).eq('id', id);
    return NextResponse.json({ error: 'This signal expired before you approved it.' }, { status: 410 });
  }

  const { data: conn } = await supabase.from('exchange_connections').select('*').eq('id', trade.connection_id).maybeSingle();
  if (!conn) {
    return NextResponse.json({ error: 'Connection not found.' }, { status: 404 });
  }
  if (conn.status !== 'active') {
    return NextResponse.json({ error: 'This connection is paused. Resume it first.' }, { status: 409 });
  }

  let decrypted;
  try {
    decrypted = process.env.SIMULATE_EXCHANGE === 'true'
      ? { adapter: paperExchange, apiKey: 'paper', apiSecret: 'paper', opts: {} as never }
      : await buildAdapterForConnection(conn);
  } catch (e) {
    await logEvent({ user_id: user.id, connection_id: conn.id, trade_id: id, event_type: 'approval_error', level: 'error', message: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: 'Could not decrypt connection keys.' }, { status: 500 });
  }

  if (!decrypted.adapter.placeProtectedEntry) {
    await logEvent({ user_id: user.id, connection_id: conn.id, trade_id: id, event_type: 'execution_unsupported', level: 'error', message: `${conn.exchange} has no execution implementation yet` });
    return NextResponse.json({ error: 'This exchange does not support order execution yet.' }, { status: 501 });
  }
  const placed = await decrypted.adapter.placeProtectedEntry(
    {
      symbol: trade.symbol,
      side: trade.side,
      entryPrice: Number(trade.entry_price),
      slPrice: Number(trade.entry_sl_price),
      tpPrices: (trade.entry_tp_prices || []) as number[],
      quantity: Number(trade.quantity),
      passphrase: decrypted.opts?.passphrase,
    },
    decrypted.apiKey,
    decrypted.apiSecret,
    decrypted.opts
  );

  if (!placed.ok || !placed.orderId) {
    await supabase.from('auto_trades').update({ status: 'failed', exec_error: placed.error ?? 'unknown' }).eq('id', id);
    await logEvent({ user_id: user.id, connection_id: conn.id, trade_id: id, event_type: 'order_rejected', level: 'error', message: placed.error ?? 'unknown' });
    return NextResponse.json({ error: `The exchange rejected the order: ${placed.error ?? 'unknown'}` }, { status: 502 });
  }

  await supabase.from('auto_trades').update({
    status: 'open',
    exchange_trade_ids: [placed.orderId],
    approval_expires_at: null,
    opened_at: new Date().toISOString(),
  }).eq('id', id);
  await logEvent({ user_id: user.id, connection_id: conn.id, trade_id: id, event_type: 'confirmation_approved', message: `${trade.symbol} approved and placed` });
  return NextResponse.json({ ok: true, orderId: placed.orderId });
}
