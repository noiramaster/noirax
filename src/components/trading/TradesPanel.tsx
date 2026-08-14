'use client';

import { useCallback, useEffect, useState } from 'react';
import { getLang, t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

interface TradeLike {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  entry_price: number | null;
  entry_sl_price: number | null;
  entry_tp_prices: number[] | null;
  quantity: number | null;
  status: string;
  approval_expires_at: string | null;
  opened_at: string | null;
  closed_at: string | null;
  exit_price: number | null;
  pnl_net: number | null;
  commission_amount: number | null;
  closed_reason: string | null;
  current_price?: number | null;
  unrealized_pnl?: number | null;
}

interface Stats {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  commissionTotal: number;
  cumulative: { label: string; value: number }[];
  distribution: { bucket: string; count: number }[];
  byCoin: Record<string, { wins: number; losses: number; pnl: number }>;
  byProfile: Record<string, { wins: number; losses: number; pnl: number }>;
  byMode: Record<string, { wins: number; losses: number; pnl: number }>;
}

interface TradesData {
  pending: TradeLike[];
  open: TradeLike[];
  closed: TradeLike[];
  stats: Stats;
  paper?: { active: boolean; balance?: number; trialDays?: number; daysActive?: number; cumulativePnl?: number };
}

export default function TradesPanel() {
  const lang = getLang();
  const [data, setData] = useState<TradesData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return;
    const resp = await fetch('/api/trading/trades', { headers: { Authorization: `Bearer ${token}` } });
    if (resp.ok) {
      setData(await resp.json());
      setError(null);
    } else {
      setError('dashboard load failed');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data fetch with session token
    load();
  }, [load]);

  const decide = async (id: string, action: 'approve' | 'decline') => {
    setBusy(id);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (token) {
      await fetch(`/api/trading/trades/${id}/${action}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    }
    setBusy(null);
    load();
  };

  if (error) {
    return <p className="text-xs text-accent-red font-mono">{error}</p>;
  }
  if (!data) {
    return <p className="text-xs text-muted font-mono">{t('common.loading', lang)}</p>;
  }

  const fmt = (n: number | null | undefined, d = 2) => (n === null || n === undefined ? '—' : n.toFixed(d));
  const fmtMoney = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2)} USDT`);
  const statusLabel = (s: string): string => {
    const map: Record<string, string> = {
      pending: t('trading.dashboard.pending', lang),
      expired: t('trading.dashboard.expiredTrade', lang),
      cancelled: t('trading.dashboard.cancelledTrade', lang),
      failed: t('trading.dashboard.failedTrade', lang),
      open: t('trading.dashboard.tradeOpen', lang),
    };
    return map[s] ?? s;
  };
  const maxBar = Math.max(1, ...data.stats.distribution.map((d) => d.count));
  const maxBucketPnl = Math.max(
    1,
    ...Object.values({ ...data.stats.byCoin, ...data.stats.byProfile, ...data.stats.byMode })
      .map((b) => Math.abs(b.pnl))
  );

  const pnlColor = (n: number | null | undefined) => (n === null || n === undefined ? 'text-muted' : n >= 0 ? 'text-accent-green' : 'text-accent-red');
  const barWidth = (v: number) => `${Math.max(4, Math.min(100, (Math.abs(v) / maxBucketPnl) * 100))}%`;

  const comparisonRows = (buckets: Record<string, { wins: number; losses: number; pnl: number }>) => {
    const entries = Object.entries(buckets);
    if (entries.length === 0) return <p className="text-[11px] text-muted font-mono">{t('trading.dashboard.noHistory', lang)}</p>;
    return (
      <div className="space-y-1">
        {entries.map(([key, b]) => (
          <div key={key} className="flex items-center gap-2 text-[11px] font-mono">
            <span className="text-muted w-20 truncate">{key}</span>
            <span className="text-foreground">{b.wins}W/{b.losses}L</span>
            <div className="flex-1 h-2 bg-border rounded overflow-hidden">
              <div className={`h-full ${b.pnl >= 0 ? 'bg-accent-green' : 'bg-accent-red'}`} style={{ width: barWidth(b.pnl) }} />
            </div>
            <span className={pnlColor(b.pnl)}>{fmtMoney(b.pnl)}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Paper mode banner + trial summary */}
      {data.paper?.active && (
        <div className="border border-yellow-400/60 rounded p-4 space-y-2">
          <p className="text-xs font-mono text-yellow-400">⚠ {t('trading.paper.badge', lang)}</p>
          <p className="text-xs text-terminal-text font-mono">{t('trading.paper.balance', lang)}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-mono">
            <div className="border border-border rounded p-2">
              <p className="text-muted">{t('trading.paper.trialResult', lang)}</p>
              <p className={data.stats.netPnl >= 0 ? 'text-accent-green' : 'text-accent-red'}>{fmtMoney(data.stats.netPnl)}</p>
            </div>
            <div className="border border-border rounded p-2">
              <p className="text-muted">{t('trading.dashboard.winRateLabel', lang)}</p>
              <p className="text-foreground">{data.stats.winRate}%</p>
            </div>
            <div className="border border-border rounded p-2">
              <p className="text-muted">{t('trading.paper.tradesCount', lang)}</p>
              <p className="text-foreground">{data.stats.total}</p>
            </div>
            <div className="border border-border rounded p-2">
              <p className="text-muted">{t('trading.paper.simBalance', lang)}</p>
              <p className="text-foreground">{fmtMoney(10000 + (data.paper.cumulativePnl ?? 0))}</p>
            </div>
          </div>
          {(data.paper.daysActive ?? 0) >= (data.paper.trialDays ?? 7) && (
            <p className="text-[11px] font-mono text-yellow-400">{t('trading.paper.trialEnded', lang)}</p>
          )}
          <p className="text-[10px] text-muted font-mono">{t('trading.paper.disclaimer', lang)}</p>
        </div>
      )}

      {/* Engine status */}
      <p className="text-xs text-accent-green font-mono border border-accent-green rounded p-3">
        &gt; {t('trading.dashboard.engineActive', lang)}
      </p>

      {/* Pending confirmations */}
      <div className="border border-border rounded p-4">
        <h3 className="font-mono text-sm text-accent-green mb-2">&gt; {t('trading.dashboard.pendingTitle', lang)}</h3>
        {data.pending.length === 0 ? (
          <p className="text-xs text-muted font-mono">{t('trading.dashboard.noPending', lang)}</p>
        ) : (
          <div className="space-y-2">
            {data.pending.map((p) => {
              const expiresAt = p.approval_expires_at ? new Date(p.approval_expires_at).getTime() : 0;
              // eslint-disable-next-line react-hooks/purity -- countdown display, intentionally re-computed on render
              const mins = Math.max(0, Math.round((expiresAt - Date.now()) / 60000));
              return (
                <div key={p.id} className="border border-border rounded p-3 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-52">
                    <p className="text-sm font-mono text-foreground">{p.symbol} · {p.side.toUpperCase()}</p>
                    <p className="text-[11px] text-muted font-mono">
                      {t('signal.entryZone', lang)}: {fmt(p.entry_price)} · {t('trading.dashboard.sl', lang)}: {fmt(p.entry_sl_price)} · {t('trading.dashboard.tp', lang)}: {(p.entry_tp_prices || []).join('/')} · qty {fmt(p.quantity, 6)}
                    </p>
                  </div>
                  <span className="text-[11px] text-muted font-mono">{t('trading.dashboard.expiresIn', lang)} {mins} min</span>
                  <div className="flex gap-2">
                    <button onClick={() => decide(p.id, 'approve')} disabled={busy === p.id} className="border border-accent-green text-accent-green px-3 py-1.5 rounded text-xs font-mono hover:bg-accent-green hover:text-black transition-colors cursor-pointer disabled:opacity-50">
                      {t('trading.dashboard.approve', lang)}
                    </button>
                    <button onClick={() => decide(p.id, 'decline')} disabled={busy === p.id} className="border border-accent-red text-accent-red px-3 py-1.5 rounded text-xs font-mono hover:bg-accent-red hover:text-black transition-colors cursor-pointer disabled:opacity-50">
                      {t('trading.dashboard.decline', lang)}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Open trades */}
      <div className="border border-border rounded p-4">
        <h3 className="font-mono text-sm text-accent-green mb-2">&gt; {t('trading.dashboard.openTitle', lang)}</h3>
        {data.open.length === 0 ? (
          <p className="text-xs text-muted font-mono">{t('trading.dashboard.noActiveTrades', lang)}</p>
        ) : (
          <div className="space-y-2">
            {data.open.map((o) => (
              <div key={o.id} className="border border-border rounded p-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-mono">
                <div>
                  <p className="text-muted">{o.symbol} · {o.side.toUpperCase()}</p>
                  <p className="text-foreground">{t('signal.entryZone', lang)} {fmt(o.entry_price)}</p>
                </div>
                <div>
                  <p className="text-muted">{t('trading.dashboard.sl', lang)} / {t('trading.dashboard.tp', lang)}</p>
                  <p className="text-foreground">{fmt(o.entry_sl_price)} / {(o.entry_tp_prices || []).join('/')}</p>
                </div>
                <div>
                  <p className="text-muted">{t('trading.dashboard.currentPrice', lang)}</p>
                  <p className="text-foreground">{fmt(o.current_price)}</p>
                </div>
                <div>
                  <p className="text-muted">{t('trading.dashboard.unrealized', lang)}</p>
                  <p className={pnlColor(o.unrealized_pnl)}>{fmtMoney(o.unrealized_pnl)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Closed history */}
      <div className="border border-border rounded p-4">
        <h3 className="font-mono text-sm text-accent-green mb-2">&gt; {t('trading.dashboard.historyTitle', lang)}</h3>
        {data.closed.length === 0 ? (
          <p className="text-xs text-muted font-mono">{t('trading.dashboard.noHistory', lang)}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-muted text-left border-b border-border">
                  <th className="py-1 pr-3">{t('trading.dashboard.mode', lang)}</th>
                  <th className="py-1 pr-3">Coin</th>
                  <th className="py-1 pr-3">{t('signal.entryZone', lang)}</th>
                  <th className="py-1 pr-3">Exit</th>
                  <th className="py-1 pr-3">{t('trading.dashboard.pnl', lang)}</th>
                  <th className="py-1 pr-3">{t('trading.dashboard.commissionTotalLabel', lang)}</th>
                  <th className="py-1 pr-3">{t('trading.dashboard.closedAt', lang)}</th>
                </tr>
              </thead>
              <tbody>
                {data.closed.map((c) => (
                  <tr key={c.id} className="border-b border-border/50">
                    <td className="py-1.5 pr-3 text-muted">{statusLabel(c.status)}</td>
                    <td className="py-1.5 pr-3 text-foreground">{c.symbol}</td>
                    <td className="py-1.5 pr-3 text-foreground">{fmt(c.entry_price)}</td>
                    <td className="py-1.5 pr-3 text-foreground">{fmt(c.exit_price)} <span className="text-muted">({c.closed_reason ?? '—'})</span></td>
                    <td className={`py-1.5 pr-3 ${pnlColor(c.pnl_net)}`}>{fmtMoney(c.pnl_net)}</td>
                    <td className="py-1.5 pr-3 text-muted">{fmtMoney(c.commission_amount)}</td>
                    <td className="py-1.5 pr-3 text-muted">{(c.closed_at || '').slice(0, 16).replace('T', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Charts */}
      <div className="border border-border rounded p-4">
        <h3 className="font-mono text-sm text-accent-green mb-3">&gt; {t('trading.dashboard.chartsTitle', lang)}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div className="border border-border rounded p-3">
            <p className="text-xs text-muted font-mono">{t('trading.dashboard.winRateLabel', lang)}</p>
            <p className="text-2xl font-mono text-accent-green">{data.stats.winRate}%</p>
            <p className="text-[11px] text-muted font-mono">{data.stats.wins}W / {data.stats.losses}L · {data.stats.total} {t('trackRecord.totalSignals', lang)}</p>
          </div>
          <div className="border border-border rounded p-3">
            <p className="text-xs text-muted font-mono">{t('trading.dashboard.netPnlLabel', lang)}</p>
            <p className={`text-2xl font-mono ${data.stats.netPnl >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>{fmtMoney(data.stats.netPnl)}</p>
          </div>
          <div className="border border-border rounded p-3">
            <p className="text-xs text-muted font-mono">{t('trading.dashboard.commissionTotalLabel', lang)}</p>
            <p className="text-2xl font-mono text-foreground">{fmtMoney(data.stats.commissionTotal)}</p>
          </div>
        </div>

        {/* Cumulative PnL line */}
        <div className="border border-border rounded p-3 mb-3">
          <p className="text-xs text-muted font-mono mb-2">{t('trading.dashboard.capitalEvolution', lang)}</p>
          {data.stats.cumulative.length < 2 ? (
            <p className="text-[11px] text-muted font-mono">{t('trading.dashboard.noHistory', lang)}</p>
          ) : (
            <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-20">
              <polyline
                points={data.stats.cumulative
                  .map((p, i) => `${(i / (data.stats.cumulative.length - 1)) * 100},${30 - ((p.value - Math.min(...data.stats.cumulative.map((c) => c.value))) / (Math.max(...data.stats.cumulative.map((c) => c.value)) - Math.min(...data.stats.cumulative.map((c) => c.value)) || 1)) * 28 - 1}`)
                  .join(' ')}
                fill="none"
                stroke="#39FF14"
                strokeWidth="0.5"
              />
            </svg>
          )}
        </div>

        {/* Distribution bars */}
        <div className="border border-border rounded p-3 mb-3">
          <p className="text-xs text-muted font-mono mb-2">{t('trading.dashboard.distributionTitle', lang)}</p>
          <div className="flex items-end gap-3 h-16">
            {data.stats.distribution.map((d) => (
              <div key={d.bucket} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] text-muted font-mono">{d.count}</span>
                <div className="w-full bg-accent-green/30 rounded-t" style={{ height: `${(d.count / maxBar) * 48}px` }} />
                <span className="text-[9px] text-muted font-mono text-center leading-tight">{d.bucket}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Comparisons */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="border border-border rounded p-3">
            <p className="text-xs text-muted font-mono mb-2">{t('trading.dashboard.byCoinTitle', lang)}</p>
            {comparisonRows(data.stats.byCoin)}
          </div>
          <div className="border border-border rounded p-3">
            <p className="text-xs text-muted font-mono mb-2">{t('trading.dashboard.byProfileTitle', lang)}</p>
            {comparisonRows(data.stats.byProfile)}
          </div>
          <div className="border border-border rounded p-3">
            <p className="text-xs text-muted font-mono mb-2">{t('trading.dashboard.byModeTitle', lang)}</p>
            {comparisonRows(data.stats.byMode)}
          </div>
        </div>
      </div>

      <button onClick={load} className="text-xs text-muted font-mono underline hover:text-foreground">
        {t('trading.dashboard.refresh', lang)}
      </button>
    </div>
  );
}
