'use client';

import type { Signal } from '@/lib/types';
import { getLang, t } from '@/lib/i18n';
import Link from 'next/link';

interface SignalCardProps {
  signal: Signal;
  isPremium?: boolean;
}

const riskColors: Record<string, string> = {
  low: 'text-accent-green border-accent-green',
  medium: 'text-yellow-400 border-yellow-400',
  high: 'text-accent-red border-accent-red',
};

const riskLabels: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export default function SignalCard({ signal, isPremium = false }: SignalCardProps) {
  const lang = getLang();
  const isBuy = signal.signal_type === 'buy';
  const accentColor = isBuy ? 'text-accent-green' : 'text-accent-red';
  const explanation = signal[`explanation_${lang}` as keyof Signal] || signal.explanation_en || '';
  const slug = signal.slug || '';

  return (
    <div className={`border border-border rounded p-4 font-mono text-sm ${isPremium ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <span className="text-accent-green">&gt;</span>
        <Link href={`/senales/${slug}`} className="font-bold text-foreground hover:text-accent-green transition-colors">
          {signal.coin}
        </Link>
        <span className="text-muted">·</span>
        <span className={`font-bold ${accentColor}`}>
          {signal.signal_type === 'buy' ? t('signal.buySignal', lang) : t('signal.sellSignal', lang)}
        </span>
        <span className="text-muted">·</span>
        <span className={accentColor}>{signal.confidence}%</span>
        {signal.tier === 'premium' && (
          <span className="text-xs border border-accent-magenta text-accent-magenta px-1.5 py-0.5 rounded">
            PREMIUM
          </span>
        )}
        {signal.resolved_result === 'win' && (
          <span className="text-xs text-accent-green border border-accent-green px-1.5 py-0.5 rounded">
            ✓ {t('signal.verified', lang)}
          </span>
        )}
        {signal.risk_level && (
          <span className={`text-xs border px-1.5 py-0.5 rounded ${riskColors[signal.risk_level] || ''}`}>
            {t(`premium.${signal.risk_level}`, lang) || riskLabels[signal.risk_level]}
          </span>
        )}
      </div>

      {signal.entry_price_min && signal.entry_price_max && (
        <div className="flex gap-4 text-muted text-xs mb-1 flex-wrap">
          <span>{t('signal.entryZone', lang)}: ${signal.entry_price_min.toLocaleString()} - ${signal.entry_price_max.toLocaleString()}</span>
          {signal.take_profit_1 && <span>TP1: ${signal.take_profit_1.toLocaleString()}</span>}
          {signal.take_profit_2 && <span>TP2: ${signal.take_profit_2.toLocaleString()}</span>}
          {signal.take_profit_3 && <span>TP3: ${signal.take_profit_3.toLocaleString()}</span>}
        </div>
      )}

      {signal.stop_loss && (
        <div className="flex gap-4 text-accent-red text-xs mb-1">
          <span>{t('signal.stopLoss', lang)}: ${signal.stop_loss.toLocaleString()}</span>
        </div>
      )}

      {signal.risk_reward_ratio && (
        <div className="text-xs text-muted mb-1">
          {t('signal.riskReward', lang)}: 1:{signal.risk_reward_ratio}
        </div>
      )}

      {signal.indicators_used && signal.indicators_used.length > 0 && (
        <div className="flex gap-1 mb-1 flex-wrap">
          {signal.indicators_used.map((ind: string) => (
            <span key={ind} className="text-xs border border-border text-muted px-1.5 py-0.5 rounded">
              {ind}
            </span>
          ))}
        </div>
      )}

      {signal.fundamental_signals && signal.fundamental_signals.length > 0 && (
        <div className="flex gap-1 mb-1 flex-wrap">
          {signal.fundamental_signals.map((tag: string) => (
            <span key={tag} className="text-xs border border-border text-accent-magenta px-1.5 py-0.5 rounded">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="text-terminal-text text-xs mt-1">{typeof explanation === 'string' ? explanation : ''}</div>
      <div className="text-muted text-xs mt-1 flex gap-3">
        <span>{signal.timeframe}</span>
        <span>{new Date(signal.created_at).toLocaleString()}</span>
        {slug && (
          <Link href={`/senales/${slug}`} className="text-accent-green hover:underline">
            {t('signal.learnMoreAbout', lang)}
          </Link>
        )}
        <Link href={`/track-record?coin=${encodeURIComponent(signal.coin)}`} className="text-muted hover:text-foreground">
          {t('signal.viewOnTrackRecord', lang)}
        </Link>
      </div>
    </div>
  );
}
