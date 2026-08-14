'use client';

import { useEffect, useState } from 'react';
import { getLang, t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import ConnectWizard, { type TradingConfig } from '@/components/trading/ConnectWizard';
import TradesPanel from '@/components/trading/TradesPanel';
import { EXCHANGES, getExchangeInfo } from '@/lib/exchanges';
import { RISK_PROFILES } from '@/lib/trading';
import type { ExchangeConnection } from '@/lib/trading';
import type { User } from '@supabase/supabase-js';

interface AffiliateRow {
  exchange: string;
  url: string;
  is_active: boolean;
}

export default function TradingPage() {
  const lang = getLang();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<TradingConfig | null>(null);
  const [connections, setConnections] = useState<ExchangeConnection[]>([]);
  const [affiliateLinks, setAffiliateLinks] = useState<Record<string, string>>({});
  const [selectedExchange, setSelectedExchange] = useState<string | null>(null);
  const [paperMode, setPaperMode] = useState(false);
  const [exchangeFilter, setExchangeFilter] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const refreshConnections = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return;
    const resp = await fetch('/api/trading/connections', { headers: { Authorization: `Bearer ${token}` } });
    if (resp.ok) {
      const data = await resp.json();
      setConnections(data.connections || []);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.user) {
        router.push('/login');
        return;
      }
      setUser(sessionData.session.user);
      const token = sessionData.session.access_token;

      const [cfgResp, connResp, affResp] = await Promise.all([
        fetch('/api/trading/config'),
        fetch('/api/trading/connections', { headers: { Authorization: `Bearer ${token}` } }),
        supabase.from('affiliate_links').select('exchange,url,is_active').eq('is_active', true),
      ]);
      if (cancelled) return;

      const cfg = await cfgResp.json();
      setConfig(cfg);

      const connData = await connResp.json();
      setConnections(connData.connections || []);

      const aff: Record<string, string> = {};
      for (const row of (affResp.data || []) as AffiliateRow[]) {
        aff[row.exchange] = row.url;
      }
      setAffiliateLinks(aff);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const token = async () => (await supabase.auth.getSession()).data.session?.access_token || '';

  const patchConnection = async (id: string, body: Record<string, unknown>) => {
    const resp = await fetch(`/api/trading/connections/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
      body: JSON.stringify(body),
    });
    return resp.ok;
  };

  const setStatus = async (conn: ExchangeConnection, status: 'active' | 'paused') => {
    setBusyId(conn.id);
    await patchConnection(conn.id, { status, pausedReason: status === 'paused' ? 'Paused by user' : undefined });
    const resp = await fetch('/api/trading/connections', { headers: { Authorization: `Bearer ${await token()}` } });
    const data = await resp.json();
    setConnections(data.connections || []);
    setBusyId(null);
  };

  const disconnect = async (conn: ExchangeConnection) => {
    if (!window.confirm(`${t('trading.dashboard.disconnect', lang)}?`)) return;
    setBusyId(conn.id);
    await fetch(`/api/trading/connections/${conn.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${await token()}` } });
    const resp = await fetch('/api/trading/connections', { headers: { Authorization: `Bearer ${await token()}` } });
    const data = await resp.json();
    setConnections(data.connections || []);
    setBusyId(null);
  };

  const changeProfile = async (conn: ExchangeConnection, profile: string) => {
    if (profile === 'advanced') return;
    setBusyId(conn.id);
    await patchConnection(conn.id, { profile });
    const resp = await fetch('/api/trading/connections', { headers: { Authorization: `Bearer ${await token()}` } });
    const data = await resp.json();
    setConnections(data.connections || []);
    setBusyId(null);
  };

  const changeMode = async (conn: ExchangeConnection, mode: string) => {
    setBusyId(conn.id);
    await patchConnection(conn.id, { mode });
    const resp = await fetch('/api/trading/connections', { headers: { Authorization: `Bearer ${await token()}` } });
    const data = await resp.json();
    setConnections(data.connections || []);
    setBusyId(null);
  };

  if (loading || !config) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <p className="font-mono text-sm text-muted">{t('common.loading', lang)}</p>
      </div>
    );
  }

  if (!user) return null;

  const connectedIds = new Set(connections.filter((c) => c.status !== 'revoked').map((c) => c.exchange));
  const PAPER_EXCHANGE = {
    id: 'paper', name: 'Modo Prueba', signupUrl: '', apiKeyUrl: '', docsUrl: '',
    hasAffiliate: false, supportsSpot: true, supportsFutures: false, needsPassphrase: false,
  };
  const exchangeCard = (id: string) => {
    const info = getExchangeInfo(id);
    if (!info) return null;
    const url = affiliateLinks[id] || info.signupUrl;
    const already = connectedIds.has(id);
    return (
      <div key={id} className="border border-border rounded p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 flex items-center justify-center border border-accent-green text-accent-green font-mono text-sm rounded">{info.name[0]}</span>
          <span className="font-mono text-sm text-foreground flex-1">{info.name}</span>
          {already && <span className="text-[10px] border border-accent-green text-accent-green px-2 py-0.5 rounded font-mono">{t('trading.connected', lang)}</span>}
        </div>
        <div className="space-y-1.5 mt-1">
          <div className="flex items-center gap-1.5">
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted font-mono underline hover:text-foreground">
              {t('trading.noAccount', lang)} {info.name}? {t('trading.createHere', lang)}
            </a>
            {info.hasAffiliate && <span className="text-[9px] text-muted font-mono border border-border rounded px-1 py-0.5">{t('trading.affiliateLabel', lang)}</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <a href={info.apiKeyUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-muted font-mono underline hover:text-foreground">
              {t('trading.haveAccountShort', lang)} — {t('trading.generateApiKey', lang)}
            </a>
          </div>
        </div>
        <div className="flex gap-2 mt-1">
          <a href={info.docsUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-muted font-mono hover:text-foreground">{t('trading.docs', lang)}</a>
          <button
            onClick={() => setSelectedExchange(id)}
            disabled={already}
            className="ml-auto border border-accent-green text-accent-green px-3 py-1 rounded text-xs font-mono hover:bg-accent-green hover:text-black transition-colors cursor-pointer disabled:opacity-40"
          >
            {already ? t('trading.connected', lang) : t('trading.configure', lang)}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <h1 className="font-mono text-3xl text-accent-green mb-2">&gt; {t('trading.title', lang)}</h1>
      <p className="text-sm text-muted mb-8 font-mono">{t('trading.subtitle', lang)}</p>

      {selectedExchange || paperMode ? (
        <>
          <button onClick={() => { setSelectedExchange(null); setPaperMode(false); }} className="text-xs text-muted font-mono mb-4 hover:text-foreground">
            &lt; {t('trading.backToExchange', lang)}
          </button>
          <ConnectWizard
            exchange={paperMode ? PAPER_EXCHANGE : (selectedExchange ? getExchangeInfo(selectedExchange)! : PAPER_EXCHANGE)}
            config={config}
            paperMode={paperMode}
            signupUrl={selectedExchange ? (affiliateLinks[selectedExchange] || getExchangeInfo(selectedExchange)?.signupUrl) : ''}
            onConnected={() => { setSelectedExchange(null); setPaperMode(false); refreshConnections(); }}
            onBack={() => { setSelectedExchange(null); setPaperMode(false); }}
          />
        </>
      ) : connections.length > 0 ? (
        <>
          {/* ---------- Dashboard ---------- */}
          <div className="space-y-6">
            {connections.map((conn) => {
              const info = conn.exchange === 'paper' ? PAPER_EXCHANGE : getExchangeInfo(conn.exchange);
              const preset = conn.profile in RISK_PROFILES ? (RISK_PROFILES as Record<string, { labelKey: string }>)[conn.profile] : undefined;
              const isPaper = conn.exchange === 'paper';
              return (
                <div key={conn.id} className="border border-border rounded p-5 space-y-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="w-8 h-8 flex items-center justify-center border border-accent-green text-accent-green font-mono text-sm rounded">{info?.name[0] || '?'}</span>
                    <h2 className="font-mono text-lg text-foreground">{info?.name || conn.exchange}</h2>
                    {isPaper && (
                      <span className="text-[10px] border border-yellow-400/60 text-yellow-400 px-2 py-0.5 rounded font-mono">
                        {t('trading.paper.badge', lang)}
                      </span>
                    )}
                    <span className={`text-[10px] border px-2 py-0.5 rounded font-mono ${conn.status === 'paused' ? 'border-accent-red text-accent-red' : 'border-accent-green text-accent-green'}`}>
                      {conn.status === 'paused' ? t('trading.dashboard.paused', lang) : t('trading.dashboard.active', lang)}
                    </span>
                    {conn.paused_reason && <span className="text-[10px] text-muted font-mono">{t('trading.dashboard.pausedReason', lang).replace('{reason}', conn.paused_reason)}</span>}
                  </div>
                  {isPaper && (
                    <p className="text-[11px] text-yellow-400 font-mono">
                      {t('trading.paper.balance', lang)}
                    </p>
                  )}

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
                    <div className="border border-border rounded p-3">
                      <p className="text-muted">{t('trading.dashboard.keyHint', lang)}</p>
                      <p className="text-foreground">…{conn.key_hint}</p>
                    </div>
                    <div className="border border-border rounded p-3">
                      <p className="text-muted">{t('trading.dashboard.mode', lang)}</p>
                      <p className="text-foreground">{conn.mode === 'auto' ? t('trading.modeAuto', lang) : t('trading.modeConfirm', lang)}</p>
                    </div>
                    <div className="border border-border rounded p-3">
                      <p className="text-muted">{t('trading.dashboard.perTrade', lang)}</p>
                      <p className="text-accent-green">{conn.position_pct}%</p>
                    </div>
                    <div className="border border-border rounded p-3">
                      <p className="text-muted">{t('trading.dashboard.dailyBrake', lang)}</p>
                      <p className="text-accent-green">{conn.daily_loss_limit_pct}%</p>
                    </div>
                    <div className="border border-border rounded p-3">
                      <p className="text-muted">{t('trading.dashboard.maxTrades', lang)}</p>
                      <p className="text-foreground">{conn.max_positions}</p>
                    </div>
                    <div className="border border-border rounded p-3">
                      <p className="text-muted">{t('trading.dashboard.profile', lang)}</p>
                      <p className="text-foreground">{preset ? t(preset.labelKey, lang) : conn.profile}</p>
                    </div>
                    <div className="border border-border rounded p-3">
                      <p className="text-muted">{t('trading.dashboard.legalVersion') ?? 'Legal'}</p>
                      <p className="text-foreground">{conn.legal_version}</p>
                    </div>
                    {conn.last_validation_error && (
                      <div className="border border-accent-red rounded p-3 col-span-2 md:col-span-4">
                        <p className="text-accent-red">{t('trading.dashboard.validationNote', lang).replace('{note}', conn.last_validation_error)}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-3 items-center">
                    {conn.status === 'paused' ? (
                      <button onClick={() => setStatus(conn, 'active')} disabled={busyId === conn.id} className="border border-accent-green text-accent-green px-4 py-2 rounded text-sm font-mono hover:bg-accent-green hover:text-black transition-colors cursor-pointer disabled:opacity-50">
                        {t('trading.dashboard.resume', lang)}
                      </button>
                    ) : (
                      <button onClick={() => setStatus(conn, 'paused')} disabled={busyId === conn.id} className="border border-accent-red text-accent-red px-4 py-2 rounded text-sm font-mono hover:bg-accent-red hover:text-black transition-colors cursor-pointer disabled:opacity-50">
                        ⚠ {t('trading.dashboard.emergency', lang)}
                      </button>
                    )}
                    <button onClick={() => disconnect(conn)} disabled={busyId === conn.id} className="border border-border text-muted px-4 py-2 rounded text-sm font-mono hover:border-accent-red hover:text-accent-red transition-colors cursor-pointer disabled:opacity-50">
                      {t('trading.dashboard.disconnect', lang)}
                    </button>
                    <select value={conn.mode} onChange={(e) => changeMode(conn, e.target.value)} disabled={busyId === conn.id} className="bg-black border border-border rounded px-2 py-1.5 text-xs font-mono text-foreground">
                      <option value="auto">{t('trading.modeAuto', lang)}</option>
                      <option value="confirm">{t('trading.modeConfirm', lang)}</option>
                    </select>
                    <select value={conn.profile} onChange={(e) => changeProfile(conn, e.target.value)} disabled={busyId === conn.id || conn.profile === 'advanced'} className="bg-black border border-border rounded px-2 py-1.5 text-xs font-mono text-foreground">
                      {Object.keys(RISK_PROFILES).map((id) => (
                        <option key={id} value={id}>{t((RISK_PROFILES as Record<string, { labelKey: string }>)[id].labelKey, lang)}</option>
                      ))}
                      {conn.profile === 'advanced' && <option value="advanced">{t('trading.advanced', lang)}</option>}
                    </select>
                  </div>
                </div>
              );
            })}

            <p className="text-xs text-muted font-mono">
              {t('trading.dashboard.commission', lang).replace('{rate}', String(Math.round((config.commissionRate || 0.25) * 100)))}
            </p>

            <TradesPanel />

            <button onClick={() => setConnections([])} className="text-xs text-muted font-mono underline hover:text-foreground">
              {t('trading.connectAnother', lang)}
            </button>
          </div>
        </>
      ) : (
        <>
          {/* ---------- How it works + paper mode + exchange grid ---------- */}
          <div className="border border-border rounded p-5 mb-6">
            <h2 className="font-mono text-sm text-accent-green mb-3">&gt; {t('trading.howItWorksTitle', lang)}</h2>
            <ul className="space-y-2 text-xs text-terminal-text font-mono">
              {[1, 2, 3, 4].map((i) => (
                <li key={i} className="flex gap-2"><span className="text-accent-green">&gt;</span> {t(`trading.howIt${i}`, lang)}</li>
              ))}
            </ul>
            <p className="text-xs text-muted font-mono mt-3">
              {t('trading.dashboard.commission', lang).replace('{rate}', String(Math.round((config.commissionRate || 0.25) * 100)))}
            </p>
          </div>

          <div className="border border-yellow-400/60 rounded p-5 mb-6 flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-1">
              <h2 className="font-mono text-lg text-yellow-400">&gt; {t('trading.paper.title', lang)}</h2>
              <p className="text-xs text-terminal-text font-mono mt-1">{t('trading.paper.ctaDesc', lang)}</p>
              <p className="text-[11px] text-muted font-mono mt-1">{t('trading.paper.disclaimer', lang)}</p>
            </div>
            <button
              onClick={() => setPaperMode(true)}
              className="border border-yellow-400/60 text-yellow-400 px-4 py-2 rounded text-sm font-mono hover:bg-yellow-400 hover:text-black transition-colors cursor-pointer"
            >
              {t('trading.paper.start', lang)}
            </button>
          </div>

          <h2 className="font-mono text-xl text-accent-green mb-4">&gt; {t('trading.selectExchange', lang)}</h2>
          <input
            type="text"
            value={exchangeFilter}
            onChange={(e) => setExchangeFilter(e.target.value)}
            placeholder={t('trading.searchExchange', lang)}
            className="w-full bg-black border border-border rounded px-3 py-2 text-sm font-mono text-foreground focus:border-accent-green outline-none mb-4"
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {EXCHANGES.filter((e) => e.name.toLowerCase().includes(exchangeFilter.trim().toLowerCase())).map((e) => exchangeCard(e.id))}
            {EXCHANGES.filter((e) => e.name.toLowerCase().includes(exchangeFilter.trim().toLowerCase())).length === 0 && (
              <p className="text-sm text-muted font-mono col-span-full">{t('trading.searchNoResults', lang)}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
