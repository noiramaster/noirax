'use client';

import { useEffect, useState } from 'react';
import { getLang, t } from '@/lib/i18n';
import type { Signal } from '@/lib/types';

export default function TrackRecordPage() {
  const lang = getLang();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/signals?resolved=true')
      .then((r) => r.json())
      .then((data) => setSignals(data.signals || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const wins = signals.filter((s) => s.resolved_result === 'win').length;
  const losses = signals.filter((s) => s.resolved_result === 'loss').length;
  const resolved = wins + losses;
  const winRate = resolved > 0 ? ((wins / resolved) * 100).toFixed(1) : '0';

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="font-mono text-3xl text-accent-green mb-2">&gt; {t('trackRecord.title', lang)}</h1>
      <p className="text-sm text-muted mb-6">{t('trackRecord.subtitle', lang)}</p>

      {loading ? (
        <div className="text-muted text-sm font-mono">{t('common.loading', lang)}</div>
      ) : signals.length === 0 ? (
        <div className="text-muted text-sm font-mono">{t('trackRecord.noData', lang)}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 font-mono text-sm">
            <div className="border border-border rounded p-3">
              <div className="text-accent-green text-lg font-bold">{winRate}%</div>
              <div className="text-muted text-xs">{t('trackRecord.winRate', lang)}</div>
            </div>
            <div className="border border-border rounded p-3">
              <div className="text-foreground text-lg font-bold">{signals.length}</div>
              <div className="text-muted text-xs">{t('trackRecord.totalSignals', lang)}</div>
            </div>
            <div className="border border-border rounded p-3">
              <div className="text-accent-green text-lg font-bold">{wins}</div>
              <div className="text-muted text-xs">{t('trackRecord.wins', lang)}</div>
            </div>
            <div className="border border-border rounded p-3">
              <div className="text-accent-red text-lg font-bold">{losses}</div>
              <div className="text-muted text-xs">{t('trackRecord.losses', lang)}</div>
            </div>
          </div>

          <div className="space-y-2">
            {signals.map((s) => (
              <div key={s.id} className="border border-border rounded p-3 font-mono text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-accent-green">&gt;</span>
                  <span className="text-foreground font-bold">{s.coin}</span>
                  <span className={s.signal_type === 'buy' ? 'text-accent-green' : 'text-accent-red'}>
                    {s.signal_type.toUpperCase()}
                  </span>
                  <span className="text-muted">|</span>
                  <span className={s.resolved_result === 'win' ? 'text-accent-green' : s.resolved_result === 'loss' ? 'text-accent-red' : 'text-muted'}>
                    {s.resolved_result === 'win' ? 'WIN' : s.resolved_result === 'loss' ? 'LOSS' : 'PENDING'}
                  </span>
                </div>
                <div className="text-muted mt-1">
                  {new Date(s.created_at).toLocaleDateString()} · {s.timeframe}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
