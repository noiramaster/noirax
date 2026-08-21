'use client';

// "Trade with one click" â€” available on any signal for users with an active
// connection (real or paper). The modal ALWAYS shows the exact plan (entry,
// SL, TP, quantity) before anything is placed; direct execution without that
// confirmation step is impossible (the API also re-validates everything).
import { useEffect, useState } from 'react';
import { useLang } from '@/lib/useLang';
import { t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import type { Signal } from '@/lib/types';

interface Preview {
  signal: { coin: string };
  connection: { exchange: string; isPaper: boolean; testnet: boolean };
  plan: {
    entryPrice: number;
    slPrice: number;
    tpPrices: number[];
    quantity: number;
    notionalUsd: number;
    riskPct: number;
    positionPct: number;
  };
}

export default function OneClickTrade({ signal }: { signal: Signal }) {
  const lang = useLang();
  const [hasConnection, setHasConnection] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setHasConnection(false);
        return;
      }
      const resp = await fetch('/api/trading/connections', { headers: { Authorization: `Bearer ${token}` } });
      if (resp.ok) {
        const data = await resp.json();
        if (!cancelled) setHasConnection((data.connections || []).some((c: { status: string }) => c.status === 'active'));
      } else {
        setHasConnection(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openModal = async () => {
    setOpen(true);
    setLoading(true);
    setError(null);
    setDone(false);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError('auth.error');
      setLoading(false);
      return;
    }
    const resp = await fetch('/api/trading/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'preview', signalId: signal.id }),
    });
    const data = await resp.json();
    setLoading(false);
    if (!resp.ok) {
      setError(data.error || 'trading.connectError');
      return;
    }
    setPreview(data);
  };

  const execute = async () => {
    setLoading(true);
    setError(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError('auth.error');
      setLoading(false);
      return;
    }
    const resp = await fetch('/api/trading/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'execute', signalId: signal.id }),
    });
    const data = await resp.json();
    setLoading(false);
    if (!resp.ok) {
      setError(data.error || 'trading.connectError');
      return;
    }
    setDone(true);
  };

  if (hasConnection === null) return null;
  if (!hasConnection) return null;

  const fmt = (n: number, d = 4) => (n === null || n === undefined ? 'â€”' : Number(n).toFixed(d));
  const btn = 'border border-accent-green text-accent-green px-3 py-1.5 rounded text-xs font-mono hover:bg-accent-green hover:text-black transition-colors cursor-pointer disabled:opacity-50';

  return (
    <>
      <button onClick={openModal} className={btn}>
        {t('trading.oneClick.button', lang)}
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div className="border border-accent-green rounded p-5 max-w-md w-full bg-black space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-mono text-lg text-accent-green">&gt; {t('trading.oneClick.title', lang)} {signal.coin}</h3>

            {loading && <p className="text-xs text-muted font-mono">{t('common.loading', lang)}</p>}

            {!loading && error && (
              <p className="text-xs text-accent-red font-mono">{error.startsWith('trading.') || error.startsWith('auth.') ? t(error, lang) : error}</p>
            )}

            {!loading && done && (
              <div className="space-y-3">
                <p className="text-sm text-accent-green font-mono">{t('trading.oneClick.done', lang)}</p>
                <button onClick={() => setOpen(false)} className={btn}>{t('common.close', lang)}</button>
              </div>
            )}

            {!loading && !done && preview && (
              <div className="space-y-3">
                {preview.connection.isPaper && (
                  <p className="text-[11px] text-yellow-400 font-mono border border-yellow-400/50 rounded p-2">
                    âš  {t('trading.paper.badge', lang)}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="border border-border rounded p-2">
                    <p className="text-muted">{t('signal.entryZone', lang)}</p>
                    <p className="text-foreground">{fmt(preview.plan.entryPrice)}</p>
                  </div>
                  <div className="border border-border rounded p-2">
                    <p className="text-muted">{t('trading.dashboard.sl', lang)}</p>
                    <p className="text-accent-red">{fmt(preview.plan.slPrice)}</p>
                  </div>
                  <div className="border border-border rounded p-2">
                    <p className="text-muted">{t('trading.dashboard.tp', lang)}</p>
                    <p className="text-accent-green">{preview.plan.tpPrices.map((p) => fmt(p)).join(' / ')}</p>
                  </div>
                  <div className="border border-border rounded p-2">
                    <p className="text-muted">Qty</p>
                    <p className="text-foreground">{fmt(preview.plan.quantity, 6)}</p>
                  </div>
                  <div className="border border-border rounded p-2">
                    <p className="text-muted">{t('trading.oneClick.notional', lang)}</p>
                    <p className="text-foreground">â‰ˆ {preview.plan.notionalUsd.toLocaleString()} USDT</p>
                  </div>
                  <div className="border border-border rounded p-2">
                    <p className="text-muted">{t('trading.oneClick.risk', lang)}</p>
                    <p className="text-foreground">{preview.plan.riskPct}%</p>
                  </div>
                </div>
                <p className="text-[11px] text-muted font-mono">{t('trading.oneClick.note', lang)}</p>
                <div className="flex gap-2">
                  <button onClick={() => setOpen(false)} className="border border-border text-muted px-3 py-1.5 rounded text-xs font-mono">{t('common.close', lang)}</button>
                  <button onClick={execute} disabled={loading} className={btn}>
                    {t('trading.oneClick.confirm', lang)}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
