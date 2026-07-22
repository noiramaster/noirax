'use client';

import { useEffect, useState } from 'react';
import { getLang, t } from '@/lib/i18n';
import SignalCard from '@/components/SignalCard';
import type { Signal, UserProfile } from '@/lib/types';
import { supabase } from '@/lib/supabase';

export default function PremiumPage() {
  const lang = getLang();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [capital, setCapital] = useState('10000');
  const [riskPct, setRiskPct] = useState('1');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        supabase
          .from('users')
          .select('*')
          .eq('id', data.user.id)
          .single()
          .then(({ data: profile }) => setProfile(profile));
      }
    });
    fetch('/api/signals?tier=premium')
      .then((r) => r.json())
      .then((data) => setSignals(data.signals || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const isPremium = profile?.plan === 'premium';
  const positionSize = capital && riskPct
    ? (parseFloat(capital) * parseFloat(riskPct) / 100).toFixed(2)
    : '0.00';

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="font-mono text-3xl text-accent-green mb-2">&gt; {t('premium.title', lang)}</h1>
      <p className="text-sm text-muted mb-6">{t('premium.subtitle', lang)}</p>

      {!isPremium && (
        <div className="border border-accent-magenta rounded p-4 mb-6 font-mono text-sm">
          <p className="text-accent-magenta mb-2">&gt; {t('premium.upgradePrompt', lang)}</p>
          <a
            href="/pricing"
            className="inline-block border border-accent-green text-accent-green px-3 py-1.5 rounded text-xs hover:bg-accent-green hover:text-black transition-colors"
          >
            {t('premium.upgradeButton', lang)}
          </a>
        </div>
      )}

      {loading ? (
        <div className="text-muted text-sm font-mono">{t('common.loading', lang)}</div>
      ) : (
        <>
          <div className="space-y-3 mb-8">
            {signals.length === 0 ? (
              <div className="text-muted text-sm font-mono">{t('free.noSignals', lang)}</div>
            ) : (
              signals.map((s) => (
                <SignalCard key={s.id} signal={s} isPremium={!isPremium} />
              ))
            )}
          </div>

          {isPremium && (
            <div className="border border-border rounded p-4">
              <h3 className="font-mono text-sm text-foreground mb-3">&gt; {t('premium.positionCalculator', lang)}</h3>
              <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                <div>
                  <label className="text-muted block mb-1">{t('premium.capital', lang)}</label>
                  <input
                    type="number"
                    value={capital}
                    onChange={(e) => setCapital(e.target.value)}
                    className="w-full bg-black border border-border rounded px-2 py-1.5 text-foreground"
                  />
                </div>
                <div>
                  <label className="text-muted block mb-1">{t('premium.riskPercent', lang)}</label>
                  <input
                    type="number"
                    value={riskPct}
                    onChange={(e) => setRiskPct(e.target.value)}
                    className="w-full bg-black border border-border rounded px-2 py-1.5 text-foreground"
                  />
                </div>
              </div>
              <p className="mt-3 text-xs text-accent-green font-mono">
                &gt; {t('premium.positionSize', lang)}: ${positionSize}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
