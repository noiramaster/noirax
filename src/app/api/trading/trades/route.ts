import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/apiAuth';
import { getServiceSupabase } from '@/lib/supabase';
import { fetchMarketPrice } from '@/lib/trading/prices';

// User's trades for the dashboard: pending confirmations, open trades (with
// unrealized PnL), closed history, and simple stats/charts data.
export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  const supabase = getServiceSupabase();

  const [pending, open, closed, connections] = await Promise.all([
    supabase.from('auto_trades').select('*').eq('user_id', user.id).eq('status', 'pending').order('created_at', { ascending: false }).limit(20),
    supabase.from('auto_trades').select('*').eq('user_id', user.id).eq('status', 'open').order('created_at', { ascending: false }),
    supabase.from('auto_trades').select('*').eq('user_id', user.id).eq('status', 'closed').order('closed_at', { ascending: false }).limit(200),
    supabase.from('exchange_connections').select('id,exchange,status,key_hint,mode,profile,created_at').eq('user_id', user.id),
  ]);
  const paperConn = (connections.data || []).find((c) => c.exchange === 'paper' && c.status === 'active');

  // Current prices for open trades (unrealized PnL) — resilient multi-source.
  const openWithPnl = [];
  for (const t of open.data || []) {
    let current = null;
    try {
      current = await fetchMarketPrice(t.symbol);
    } catch {
      current = null;
    }
    const entry = Number(t.entry_price || 0);
    const qty = Number(t.quantity || 0);
    const unrealized = current && entry ? (t.side === 'buy' ? (current - entry) * qty : (entry - current) * qty) : null;
    openWithPnl.push({ ...t, current_price: current, unrealized_pnl: unrealized });
  }

  // Stats for charts (computed server-side so the UI stays simple).
  const closedRows = (closed.data || []) as Array<Record<string, unknown>>;
  const wins = closedRows.filter((t) => (t.pnl_net as number) > 0).length;
  const losses = closedRows.filter((t) => (t.pnl_net as number) <= 0).length;
  const cumulative: { label: string; value: number }[] = [];
  let acc = 0;
  for (const t of [...closedRows].reverse()) {
    acc += Number(t.pnl_net ?? 0);
    cumulative.push({ label: String((t.closed_at as string) || '').slice(0, 10), value: Math.round(acc * 100) / 100 });
  }
  const distribution = [
    { bucket: '> +2%', count: 0 },
    { bucket: '0% a +2%', count: 0 },
    { bucket: '-2% a 0%', count: 0 },
    { bucket: '< -2%', count: 0 },
  ];
  for (const t of closedRows) {
    const entry = Number(t.entry_price || 1);
    const exit = Number(t.exit_price || 0);
    const pct = entry > 0 ? ((exit - entry) / entry) * 100 : 0;
    if (pct > 2) distribution[0].count += 1;
    else if (pct > 0) distribution[1].count += 1;
    else if (pct > -2) distribution[2].count += 1;
    else distribution[3].count += 1;
  }
  const byCoin: Record<string, { wins: number; losses: number; pnl: number }> = {};
  const byProfile: Record<string, { wins: number; losses: number; pnl: number }> = {};
  const byMode: Record<string, { wins: number; losses: number; pnl: number }> = {};
  for (const t of closedRows) {
    const coin = String(t.symbol_base || t.symbol);
    const profile = String(t.mode ?? 'n/a');
    const mode = String((t as { mode?: string }).mode ?? 'n/a');
    for (const [map, key] of [[byCoin, coin], [byProfile, profile], [byMode, mode]] as Array<[Record<string, { wins: number; losses: number; pnl: number }>, string]>) {
      const bucket = (map[key] ??= { wins: 0, losses: 0, pnl: 0 });
      if ((t.pnl_net as number) > 0) bucket.wins += 1;
      else bucket.losses += 1;
      bucket.pnl += Number(t.pnl_net ?? 0);
    }
  }

  return NextResponse.json({
    pending: pending.data || [],
    open: openWithPnl,
    closed: closedRows.slice(0, 50),
    connections: connections.data || [],
    paper: paperConn
      ? {
          active: true,
          balance: 10000,
          trialDays: 7,
          daysActive: Math.floor((Date.now() - new Date(paperConn.created_at).getTime()) / 86_400_000),
          cumulativePnl: Math.round(closedRows.reduce((a, t) => a + Number(t.pnl_net ?? 0), 0) * 100) / 100,
        }
      : { active: false },
    stats: {
      total: closedRows.length,
      wins,
      losses,
      winRate: closedRows.length ? Math.round((wins / closedRows.length) * 100) : 0,
      netPnl: Math.round(closedRows.reduce((a, t) => a + Number(t.pnl_net ?? 0), 0) * 100) / 100,
      commissionTotal: Math.round(closedRows.reduce((a, t) => a + Number(t.commission_amount ?? 0), 0) * 100) / 100,
      cumulative,
      distribution,
      byCoin,
      byProfile,
      byMode,
    },
  });
}
