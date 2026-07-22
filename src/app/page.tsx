'use client';

import { useEffect, useState } from 'react';
import { getLang, t } from '@/lib/i18n';
import TerminalTicker from '@/components/TerminalTicker';
import TerminalBlock from '@/components/TerminalBlock';
import SignalCard from '@/components/SignalCard';
import Link from 'next/link';
import type { Signal } from '@/lib/types';

export default function Home() {
  const lang = getLang();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/signals?tier=free&limit=3')
      .then((r) => r.json())
      .then((data) => {
        setSignals(data.signals || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="mb-12">
        <h1 className="font-mono text-4xl md:text-5xl font-bold text-accent-green mb-4">
          &gt; {t('home.title', lang)}
        </h1>
        <p className="text-sm text-muted mb-6">{t('home.subtitle', lang)}</p>
        <TerminalTicker />
        <TerminalBlock>
          {t('home.terminalIntro', lang)}<br />
          {t('home.terminalAwaiting', lang)}
        </TerminalBlock>
      </div>

      <div className="mb-8">
        <h2 className="font-mono text-lg text-foreground mb-4">
          &gt; {t('home.latestSignals', lang)}
        </h2>
        {loading ? (
          <div className="text-muted text-sm font-mono">{t('common.loading', lang)}</div>
        ) : signals.length === 0 ? (
          <div className="text-muted text-sm font-mono">{t('free.noSignals', lang)}</div>
        ) : (
          <div className="space-y-3">
            {signals.map((s) => (
              <SignalCard key={s.id} signal={s} />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-4 font-mono text-sm">
        <Link
          href="/free"
          className="border border-border text-foreground px-5 py-3 rounded hover:border-accent-green transition-colors text-center"
        >
          {t('home.ctaFree', lang)}
        </Link>
        <Link
          href="/pricing"
          className="border border-accent-green text-accent-green px-5 py-3 rounded hover:bg-accent-green hover:text-black transition-colors text-center"
        >
          {t('home.ctaPremium', lang)}
        </Link>
      </div>
    </div>
  );
}
