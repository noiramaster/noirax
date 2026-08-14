'use client';

import { useState } from 'react';
import { getLang, t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { HARD_CAPS, RISK_PROFILES, LEGAL_VERSION, DEFAULT_MODE } from '@/lib/trading';
import type { RiskProfile, TradingMode } from '@/lib/trading';
import type { ExchangeInfo } from '@/lib/exchanges';

export interface TradingConfig {
  commissionRate: number;
  approvalExpiryMinutes: number;
  legalVersion: string;
  caps: typeof HARD_CAPS;
  profiles: Record<string, { positionPct: number; dailyLossLimitPct: number; maxPositions: number }>;
}

interface ConnectWizardProps {
  exchange: ExchangeInfo;
  config: TradingConfig;
  onConnected: () => void;
  onBack: () => void;
  /** Official exchange signup URL. */
  signupUrl?: string;
  /** Paper mode: simulated 10,000 USDT, no exchange, no keys. */
  paperMode?: boolean;
}

// Onboarding order: the user configures EVERYTHING (mode, profile, brake, legal)
// before ever being asked to paste API keys. Keys are the LAST step, so a user
// without keys yet is never blocked: the two buttons below are shown before the
// form at every point where keys are needed.
type Step = 'mode' | 'profile' | 'brake' | 'legal' | 'credentials' | 'done';

const PRESET_IDS: RiskProfile[] = ['conservative', 'moderate', 'aggressive', 'small_frequent'];

export default function ConnectWizard({ exchange, config, onConnected, onBack, signupUrl, paperMode = false }: ConnectWizardProps) {
  const lang = getLang();
  const [step, setStep] = useState<Step>('mode');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [mode, setMode] = useState<TradingMode>(DEFAULT_MODE);
  const [profile, setProfile] = useState<RiskProfile>('moderate');
  const [advancedValues, setAdvancedValues] = useState({ positionPct: 10, dailyLossLimitPct: 5, maxPositions: 5 });
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [testnet, setTestnet] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preset = profile in RISK_PROFILES ? (RISK_PROFILES as Record<string, { positionPct: number; dailyLossLimitPct: number; maxPositions: number }>)[profile] : undefined;

  const currentValues = profile === 'advanced'
    ? advancedValues
    : { positionPct: preset?.positionPct ?? 10, dailyLossLimitPct: preset?.dailyLossLimitPct ?? 5, maxPositions: preset?.maxPositions ?? 5 };

  const stepBar = (): string => {
    const order: Step[] = paperMode ? ['mode', 'profile', 'brake', 'legal'] : ['mode', 'profile', 'brake', 'legal', 'credentials'];
    return `[${order.indexOf(step) + 1}/${order.length}]`;
  };

  const handleConnect = async () => {
    setSubmitting(true);
    setError(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError('auth.error');
      setSubmitting(false);
      return;
    }
    const resp = await fetch('/api/trading/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        exchange: paperMode ? 'paper' : exchange.id,
        apiKey: paperMode ? '' : apiKey,
        apiSecret: paperMode ? '' : apiSecret,
        passphrase: !paperMode && exchange.needsPassphrase ? passphrase : undefined,
        mode,
        profile,
        positionPct: profile === 'advanced' ? advancedValues.positionPct : undefined,
        dailyLossLimitPct: profile === 'advanced' ? advancedValues.dailyLossLimitPct : undefined,
        maxPositions: profile === 'advanced' ? advancedValues.maxPositions : undefined,
        legalAccepted,
        legalVersion: LEGAL_VERSION,
        testnet,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      setError(data.error || 'trading.connectError');
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    setStep('done');
  };

  const inputCls = 'w-full bg-black border border-border rounded px-3 py-2 text-sm font-mono text-foreground focus:border-accent-green outline-none';
  const btnPrimary = 'border border-accent-green text-accent-green px-4 py-2 rounded text-sm font-mono hover:bg-accent-green hover:text-black transition-colors cursor-pointer disabled:opacity-50';
  const btnGhost = 'border border-border text-muted px-4 py-2 rounded text-sm font-mono hover:border-accent-green hover:text-foreground transition-colors cursor-pointer';

  // Two clearly differentiated options depending on the user's situation:
  //  A) new to the exchange -> official signup page
  //  B) already has an account -> go straight to the exchange's API-key page
  const signupUrlResolved = signupUrl || exchange.signupUrl;
  const twoButtonsBlock = (
    <div className="border border-border rounded p-4 space-y-3">
      <p className="text-xs text-muted font-mono">{t('trading.getKeysReminder', lang)}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="border border-border rounded p-3 flex flex-col gap-2">
          <p className="text-xs text-foreground font-mono">{t('trading.noAccountShort', lang)}</p>
          <p className="text-[11px] text-muted font-mono">{t('trading.noAccountDesc', lang).replace('{exchange}', exchange.name)}</p>
          <div className="flex items-center gap-2">
            <a href={signupUrlResolved} target="_blank" rel="noopener noreferrer" className={btnPrimary}>
              {t('trading.createHere', lang)}
            </a>
          </div>
        </div>
        <div className="border border-border rounded p-3 flex flex-col gap-2">
          <p className="text-xs text-foreground font-mono">{t('trading.haveAccountShort', lang)}</p>
          <p className="text-[11px] text-muted font-mono">{t('trading.haveAccountDesc', lang).replace('{exchange}', exchange.name)}</p>
          <a href={exchange.apiKeyUrl} target="_blank" rel="noopener noreferrer" className={btnPrimary}>
            {t('trading.generateApiKey', lang)}
          </a>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto">
      <p className="text-xs text-muted font-mono mb-4">{stepBar()} &gt; {paperMode ? t('trading.paper.title', lang) : exchange.name}</p>

      {paperMode && (
        <div className="border border-yellow-400/60 rounded p-3 mb-4 text-[11px] font-mono text-yellow-400">
          ⚠ {t('trading.paper.banner', lang)}
        </div>
      )}

      {step === 'mode' && (
        <div className="border border-border rounded p-6 space-y-3">
          <h2 className="font-mono text-xl text-accent-green">&gt; {t('trading.stepMode', lang)}</h2>
          {(['auto', 'confirm'] as TradingMode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`block w-full text-left border rounded p-4 font-mono transition-colors cursor-pointer ${mode === m ? 'border-accent-green' : 'border-border hover:border-accent-green'}`}>
              <span className="text-sm text-foreground">{m === 'auto' ? t('trading.modeAuto', lang) : t('trading.modeConfirm', lang)}</span>
              <span className="block text-xs text-muted mt-1">{m === 'auto' ? t('trading.modeAutoDesc', lang) : t('trading.modeConfirmDesc', lang)}</span>
              {m === 'confirm' && <span className="block text-[11px] text-accent-green mt-1">&gt; {t('trading.modeExpiryNote', lang)}</span>}
            </button>
          ))}
          <div className="flex gap-3">
            <button onClick={onBack} className={btnGhost}>{t('trading.guideBack', lang)}</button>
            <button onClick={() => setStep('profile')} className={btnPrimary}>{t('trading.guideContinue', lang)}</button>
          </div>
        </div>
      )}

      {step === 'profile' && (
        <div className="border border-border rounded p-6 space-y-3">
          <h2 className="font-mono text-xl text-accent-green">&gt; {t('trading.stepProfile', lang)}</h2>
          <p className="text-sm text-muted font-mono">{t('trading.profileIntro', lang)}</p>
          {PRESET_IDS.map((id) => {
            const p = (RISK_PROFILES as Record<string, { labelKey: string; descriptionKey: string; positionPct: number; dailyLossLimitPct: number; maxPositions: number }>)[id];
            const active = profile === id;
            return (
              <button key={id} onClick={() => setProfile(id)} className={`block w-full text-left border rounded p-4 font-mono transition-colors cursor-pointer ${active ? 'border-accent-green' : 'border-border hover:border-accent-green'}`}>
                <span className="text-sm text-foreground">{t(p.labelKey, lang)}</span>
                <span className="block text-xs text-muted mt-1">{t(p.descriptionKey, lang)}</span>
                <span className="block text-[11px] text-accent-green mt-1">&gt; {t('trading.profileValues', lang).replace('{pos}', String(p.positionPct)).replace('{max}', String(p.maxPositions)).replace('{loss}', String(p.dailyLossLimitPct))}</span>
              </button>
            );
          })}
          <button onClick={() => setProfile('advanced')} className={`block w-full text-left border rounded p-4 font-mono transition-colors cursor-pointer ${profile === 'advanced' ? 'border-accent-magenta' : 'border-border hover:border-accent-magenta'}`}>
            <span className="text-sm text-foreground">{t('trading.advanced', lang)}</span>
            <span className="block text-xs text-muted mt-1">{t('trading.advancedDesc', lang)}</span>
          </button>
          {profile === 'advanced' && (
            <div className="space-y-3 border border-border rounded p-4">
              <div>
                <label className="text-xs text-muted font-mono block mb-1">{t('trading.positionPct', lang)} (1–{config.caps.maxPositionPct}%)</label>
                <input type="number" min={1} max={config.caps.maxPositionPct} value={advancedValues.positionPct} onChange={(e) => setAdvancedValues({ ...advancedValues, positionPct: Math.min(config.caps.maxPositionPct, Math.max(1, Number(e.target.value) || 1)) })} className={inputCls} />
              </div>
              <div>
                <label className="text-xs text-muted font-mono block mb-1">{t('trading.dailyLoss', lang)} ({config.caps.dailyLossMinPct}–{config.caps.dailyLossMaxPct}%)</label>
                <input type="number" min={config.caps.dailyLossMinPct} max={config.caps.dailyLossMaxPct} value={advancedValues.dailyLossLimitPct} onChange={(e) => setAdvancedValues({ ...advancedValues, dailyLossLimitPct: Math.min(config.caps.dailyLossMaxPct, Math.max(config.caps.dailyLossMinPct, Number(e.target.value) || 1)) })} className={inputCls} />
              </div>
              <div>
                <label className="text-xs text-muted font-mono block mb-1">{t('trading.maxPositions', lang)} (1–{config.caps.maxPositions})</label>
                <input type="number" min={1} max={config.caps.maxPositions} value={advancedValues.maxPositions} onChange={(e) => setAdvancedValues({ ...advancedValues, maxPositions: Math.min(config.caps.maxPositions, Math.max(1, Number(e.target.value) || 1)) })} className={inputCls} />
              </div>
              <p className="text-[11px] text-accent-red font-mono">{t('trading.advancedCapsNote', lang).replace('{pos}', String(config.caps.maxPositionPct)).replace('{loss}', String(config.caps.dailyLossMaxPct)).replace('{max}', String(config.caps.maxPositions))}</p>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={() => setStep('mode')} className={btnGhost}>{t('common.backToHome', lang)}</button>
            <button onClick={() => setStep('brake')} className={btnPrimary}>{t('trading.guideContinue', lang)}</button>
          </div>
        </div>
      )}

      {step === 'brake' && (
        <div className="border border-border rounded p-6 space-y-4">
          <h2 className="font-mono text-xl text-accent-green">&gt; {t('trading.stepBrake', lang)}</h2>
          <p className="text-sm text-muted font-mono">{t('trading.brakeIntro', lang)}</p>
          <div>
            <label className="text-xs text-muted font-mono block mb-1">{t('trading.dailyLoss', lang)}</label>
            <input type="range" min={1} max={15} step={1} value={currentValues.dailyLossLimitPct}
              onChange={(e) => setAdvancedValues({ ...advancedValues, dailyLossLimitPct: Number(e.target.value) })}
              className="w-full accent-green-400" />
            <p className="text-sm font-mono text-accent-green mt-1">{currentValues.dailyLossLimitPct}%</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep('profile')} className={btnGhost}>{t('common.backToHome', lang)}</button>
            <button onClick={() => setStep('legal')} className={btnPrimary}>{t('trading.guideContinue', lang)}</button>
          </div>
        </div>
      )}

      {step === 'legal' && (
        <div className="border border-border rounded p-6 space-y-4">
          <h2 className="font-mono text-xl text-accent-green">&gt; {t('trading.stepLegal', lang)}</h2>
          <div className="border border-border rounded p-4 max-h-80 overflow-y-auto space-y-3">
            <p className="text-xs text-foreground font-mono font-bold">{t('trading.legalTitle', lang)}</p>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <p key={n} className="text-xs text-terminal-text font-mono leading-relaxed">{t(`trading.legalS${n}`, lang)}</p>
            ))}
          </div>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={legalAccepted} onChange={(e) => setLegalAccepted(e.target.checked)} className="mt-0.5 accent-green-400" />
            <span className="text-xs text-terminal-text font-mono">{t('trading.legalAccept', lang)}</span>
          </label>
          <div className="flex gap-3">
            <button onClick={() => setStep('brake')} className={btnGhost}>{t('common.backToHome', lang)}</button>
            <button onClick={() => (paperMode ? handleConnect() : setStep('credentials'))} className={btnPrimary} disabled={!legalAccepted || submitting}>
              {submitting ? t('trading.connecting', lang) : paperMode ? t('trading.paper.start', lang) : t('trading.guideContinue', lang)}
            </button>
          </div>
        </div>
      )}

      {!paperMode && step === 'credentials' && (
        <div className="border border-border rounded p-6 space-y-4">
          <h2 className="font-mono text-xl text-accent-green">&gt; {t('trading.stepCredentials', lang)}</h2>
          {/* Testnet toggle: sandbox environment of the exchange, no real money */}
          <label className="flex items-start gap-2 cursor-pointer border border-yellow-400/60 rounded p-3">
            <input type="checkbox" checked={testnet} onChange={(e) => setTestnet(e.target.checked)} className="mt-0.5 accent-yellow-400" />
            <span className="text-xs text-yellow-400 font-mono">
              <span className="font-bold">{t('trading.testnetLabel', lang)}</span>
              <span className="block text-muted mt-0.5">{t('trading.testnetDesc', lang)}</span>
            </span>
          </label>
          {/* 1. Escape hatches first: create account / generate API key (no dead ends) */}
          {twoButtonsBlock}
          {/* 2. Security reminder (the former guide step, now inline) */}
          <div className="border border-border rounded p-4 space-y-2">
            <p className="text-xs text-muted font-mono">{t('trading.guideIntro', lang)}</p>
            <ul className="space-y-1.5 text-xs text-terminal-text font-mono">
              <li className="flex gap-2"><span className="text-accent-green">&gt;</span> {t('trading.guideTradingOnly', lang)}</li>
              <li className="flex gap-2"><span className="text-accent-red">&gt;</span> {t('trading.guideNoWithdraw', lang)}</li>
              <li className="flex gap-2"><span className="text-accent-green">&gt;</span> {t('trading.guideIpWhitelist', lang)}</li>
              {exchange.needsPassphrase && <li className="flex gap-2"><span className="text-accent-green">&gt;</span> {t('trading.guidePassphrase', lang)}</li>}
              <li className="flex gap-2"><span className="text-accent-green">&gt;</span> {t('trading.guideNeverShare', lang)}</li>
            </ul>
          </div>
          {/* 3. Then the form */}
          <p className="text-sm text-muted font-mono">{t('trading.credentialsHelp', lang)}</p>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted font-mono block mb-1">{t('trading.apiKey', lang)}</label>
              <input type="text" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className={inputCls} autoComplete="off" />
            </div>
            <div>
              <label className="text-xs text-muted font-mono block mb-1">{t('trading.apiSecret', lang)}</label>
              <input type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} className={inputCls} autoComplete="off" />
            </div>
            {exchange.needsPassphrase && (
              <div>
                <label className="text-xs text-muted font-mono block mb-1">{t('trading.passphrase', lang)}</label>
                <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} className={inputCls} autoComplete="off" />
              </div>
            )}
          </div>
          {error && <p className="text-xs text-accent-red font-mono">{error.startsWith('trading.') || error.startsWith('auth.') ? t(error, lang) : error}</p>}
          <div className="flex gap-3">
            <button onClick={() => setStep('legal')} className={btnGhost}>{t('common.backToHome', lang)}</button>
            <button onClick={handleConnect} disabled={apiKey.length < 8 || apiSecret.length < 8 || submitting} className={btnPrimary}>
              {submitting ? t('trading.connecting', lang) : t('trading.connectButton', lang)}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="border border-accent-green rounded p-6 space-y-4 text-center">
          <h2 className="font-mono text-2xl text-accent-green">&gt; {t('trading.done', lang)}</h2>
          <p className="text-sm text-muted font-mono">{t('trading.doneText', lang)}</p>
          {paperMode && <p className="text-[11px] text-yellow-400 font-mono">⚠ {t('trading.paper.badge', lang)}</p>}
          <p className="text-xs text-muted font-mono">
            {t('trading.dashboard.commission', lang).replace('{rate}', String(Math.round((config.commissionRate || 0.25) * 100)))}
          </p>
          <button onClick={onConnected} className={btnPrimary}>{t('trading.dashboard.title', lang)}</button>
        </div>
      )}
    </div>
  );
}
