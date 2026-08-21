'use client';

import { useEffect, useState } from 'react';
import { useLang } from '@/lib/useLang';
import { t } from '@/lib/i18n';
import SignalCard from '@/components/SignalCard';
import type { Signal } from '@/lib/types';

const DURATIONS = ['all', 'scalping', 'swing', 'long'];

const durationLabels: Record<string, string> = {
  all: 'duration.all',
  scalping: 'duration.scalping',
  swing: 'duration.swing',
  long: 'duration.long',
};

const durationDescriptions: Record<string, string> = {
  all: '',
  scalping: 'duration.scalpingDesc',
  swing: 'duration.swingDesc',
  long: 'duration.longDesc',
};

export default function FreePage() {
  const lang = useLang();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [duration, setDuration] = useState('all');

  useEffect(() => {
    fetch('/api/signals?tier=free')
      .then((r) => r.json())
      .then((data) => setSignals(data.signals || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = duration === 'all' ? signals : signals.filter((s) => s.duration_type === duration);

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="font-mono text-3xl text-accent-green mb-2">&gt; {t('free.title', lang)}</h1>
      <p className="text-sm text-muted mb-6">{t('free.subtitle', lang)}</p>

      {/* Duration tabs */}
      <div className="flex gap-1 mb-6 flex-wrap border-b border-border pb-2">
        {DURATIONS.map((d) => (
          <button
            key={d}
            onClick={() => setDuration(d)}
            className={`px-3 py-1.5 text-xs font-mono rounded-t transition-colors cursor-pointer ${
              duration === d
                ? 'text-accent-green border-b-2 border-accent-green'
                : 'text-muted hover:text-foreground'
            }`}
          >
            {t(durationLabels[d], lang)}
          </button>
        ))}
      </div>
      {duration !== 'all' && (
        <p className="text-xs text-muted mb-4 font-mono">{t(durationDescriptions[duration], lang)}</p>
      )}

      {loading ? (
        <div className="text-muted text-sm font-mono">{t('common.loading', lang)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-muted text-sm font-mono">{t('free.noSignals', lang)}</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => (
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
