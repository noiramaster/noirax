'use client';

import { useEffect, useRef } from 'react';
import { getLang, t, isRTL } from '@/lib/i18n';
import TermTooltip from '@/components/TermTooltip';
import Link from 'next/link';
import type { Signal } from '@/lib/types';

const riskColors: Record<string, string> = {
  low: 'text-accent-green',
  medium: 'text-yellow-400',
  high: 'text-accent-red',
};

interface SignalDetailClientProps {
  signal: Signal;
}

export default function SignalDetailClient({ signal }: SignalDetailClientProps) {
  const lang = getLang();
  const rtl = isRTL(lang);
  const isBuy = signal.signal_type === 'buy';
  const accentColor = isBuy ? 'text-accent-green' : 'text-accent-red';
  const explanation = (signal as any)[`explanation_${lang}`] || signal.explanation_en || '';
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load lightweight chart
    if (chartRef.current && typeof window !== 'undefined') {
      import('lightweight-charts').then(({ createChart, LineSeries }) => {
        const chart = createChart(chartRef.current!, {
          width: chartRef.current!.clientWidth,
          height: 300,
          layout: {
            background: { color: '#000000' },
            textColor: '#666666',
          },
          grid: {
            vertLines: { color: '#222222' },
            horzLines: { color: '#222222' },
          },
          crosshair: {
            mode: 0,
          },
          timeScale: {
            borderColor: '#222222',
          },
        });

        const lineSeries = chart.addSeries(LineSeries, {
          color: '#39FF14',
          lineWidth: 2,
        });

        // Sample data - in production this would come from API
        const now = Math.floor(Date.now() / 1000);
        const data = [];
        for (let i = 100; i >= 0; i--) {
          data.push({
            time: (now - i * 3600) as any,
            value: (signal.entry_price || 50000) * (1 + (Math.random() - 0.5) * 0.02),
          });
        }
        lineSeries.setData(data);

        // Mark entry would go here with the current version's API
        // lineSeries.setMarkers(...) was removed; we show entry zone in the UI below

        chart.timeScale().fitContent();
      });
    }
  }, [signal]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-12" dir={rtl ? 'rtl' : 'ltr'}>
      <div className="mb-6">
        <Link href="/" className="text-xs text-muted hover:text-foreground font-mono transition-colors">
          &lt; {t('common.backToHome', lang)}
        </Link>
      </div>

      <div className="border border-border rounded p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <h1 className="font-mono text-2xl font-bold text-foreground">{signal.coin}</h1>
          <span className={`font-mono text-lg font-bold ${accentColor}`}>
            {signal.signal_type === 'buy' ? t('signal.buySignal', lang) : t('signal.sellSignal', lang)}
          </span>
          <span className={`font-mono ${accentColor}`}>{signal.confidence}%</span>
          {signal.tier === 'premium' && (
            <span className="text-xs border border-accent-magenta text-accent-magenta px-2 py-1 rounded">PREMIUM</span>
          )}
          {signal.resolved_result === 'win' && (
            <span className="text-xs text-accent-green border border-accent-green px-2 py-1 rounded">
              ✓ {t('signal.verified', lang)}
            </span>
          )}
          {signal.risk_level && (
            <span className={`text-xs border px-2 py-1 rounded ${riskColors[signal.risk_level]} border-current`}>
              {t(`premium.${signal.risk_level}`, lang) || signal.risk_level}
            </span>
          )}
        </div>

        {/* Price Chart */}
        <div ref={chartRef} className="w-full mb-6 border border-border rounded" />

        {/* Entry Zone */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="border border-border rounded p-3">
            <p className="text-xs text-muted mb-1">{t('signal.entryZone', lang)}</p>
            <p className="font-mono text-lg text-foreground">
              ${signal.entry_price_min?.toLocaleString()} - ${signal.entry_price_max?.toLocaleString()}
            </p>
          </div>
          <div className="border border-border rounded p-3">
            <p className="text-xs text-muted mb-1">
              <TermTooltip term="Stop Loss" definition="Precio al que la señal se invalida automáticamente">
                {t('signal.stopLoss', lang)}
              </TermTooltip>
            </p>
            <p className="font-mono text-lg text-accent-red">
              ${signal.stop_loss?.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Take Profit Ladder */}
        <div className="border border-border rounded p-3 mb-6">
          <p className="text-xs text-muted mb-2">
            <TermTooltip term="Take Profit" definition="Objetivos de ganancia escalonados">
              {t('signal.takeProfit', lang)}
            </TermTooltip>
          </p>
          <div className="grid grid-cols-3 gap-3">
            {[signal.take_profit_1, signal.take_profit_2, signal.take_profit_3].map((tp, i) => {
              if (!tp) return null;
              const gainPct = signal.entry_price ? (((tp - signal.entry_price) / signal.entry_price) * 100).toFixed(1) : '0';
              return (
                <div key={i} className="text-center border border-border rounded p-2">
                  <p className="font-mono text-sm text-accent-green">TP{i + 1}</p>
                  <p className="font-mono text-xs text-foreground">${tp.toLocaleString()}</p>
                  <p className="text-xs text-accent-green">+{gainPct}%</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Risk/Reward */}
        {signal.risk_reward_ratio && (
          <div className="border border-border rounded p-3 mb-6">
            <p className="text-xs text-muted mb-1">
              <TermTooltip term="Risk/Reward Ratio" definition="Relación entre la pérdida máxima y la ganancia potencial">
                {t('signal.riskReward', lang)}
              </TermTooltip>
            </p>
            <p className="font-mono text-lg text-foreground">1:{signal.risk_reward_ratio}</p>
          </div>
        )}

        {/* Indicators */}
        {signal.indicators_used && signal.indicators_used.length > 0 && (
          <div className="mb-6">
            <p className="text-xs text-muted mb-2">{t('signal.indicators', lang)}</p>
            <div className="flex gap-2 flex-wrap">
              {signal.indicators_used.map((ind: string) => (
                <span key={ind} className="text-xs border border-border text-muted px-2 py-1 rounded">
                  {ind}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Explanation */}
        <div className="border border-border rounded p-4 mb-6">
          <p className="text-xs text-muted mb-2 font-mono text-accent-green">&gt; {t('signal.whyThisSignal', lang)}</p>
          <p className="text-sm text-terminal-text leading-relaxed">{typeof explanation === 'string' ? explanation : ''}</p>
        </div>

        {/* Related Links */}
        <div className="flex flex-wrap gap-3 text-xs font-mono">
          <Link href={`/track-record?coin=${encodeURIComponent(signal.coin)}`} className="text-muted hover:text-foreground transition-colors border border-border px-3 py-1.5 rounded">
            {t('signal.viewOnTrackRecord', lang)}
          </Link>
          <Link href="/blog" className="text-muted hover:text-foreground transition-colors border border-border px-3 py-1.5 rounded">
            {t('nav.blog', lang)}
          </Link>
          <span className="text-muted">{t('signal.generated', lang)}: {new Date(signal.created_at).toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}
