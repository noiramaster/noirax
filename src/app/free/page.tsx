'use client';

import { useEffect, useState } from 'react';
import { getLang, t } from '@/lib/i18n';
import SignalCard from '@/components/SignalCard';
import type { Signal } from '@/lib/types';

export default function FreePage() {
  const lang = getLang();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/signals?tier=free')
      .then((r) => r.json())
      .then((data) => setSignals(data.signals || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="font-mono text-3xl text-accent-green mb-2">&gt; {t('free.title', lang)}</h1>
      <p className="text-sm text-muted mb-6">{t('free.subtitle', lang)}</p>

      <TerminalBlock className="mb-6 text-xs">
        {t('free.delayWarning', lang)}
      </TerminalBlock>

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

      <div className="mt-8 border border-border rounded p-4 text-xs text-muted font-mono">
        &gt; {t('free.exchangeDisclaimer', lang)}
      </div>
    </div>
  );
}

function TerminalBlock({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`font-mono text-sm text-terminal-text border border-border rounded p-4 bg-black ${className}`}>
      <span className="text-accent-green">&gt;</span> {children}
    </div>
  );
}
