'use client';

import { useEffect, useRef } from 'react';

interface TradingViewChartProps {
  /** TradingView symbol, e.g. "BYBIT:ZECUSDT". Empty/null -> clean "not available" panel. */
  symbol?: string | null;
  /** Chart interval, TradingView codes: "60" = 1h, "15" = 15m, "D" = daily. */
  interval?: string;
  locale?: string;
  /** Optional note shown inside the "chart not available" panel. */
  unavailableNote?: string;
}

/**
 * TradingView Advanced Chart widget (free embed, iframe-based).
 *
 * IMPORTANT — VISUALIZATION ONLY:
 * This widget renders in the user's browser and is purely a visual aid for the
 * signal pages. It is NOT a data source and does NOT feed the NOIRAX technical
 * analysis in any way. The analysis pipeline obtains its OHLCV data from the
 * Bybit/OKX public APIs (see pipeline/run_signals.py, get_klines()).
 *
 * The widget loads its own iframe from TradingView's CDN at runtime; if the
 * CDN is unreachable the container stays empty and the rest of the page is
 * unaffected. When no valid exchange symbol exists (e.g. a coin delisted
 * everywhere), a clean panel replaces the widget instead of the raw
 * TradingView error.
 */
export default function TradingViewChart({ symbol, interval = '60', locale = 'en', unavailableNote }: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof window === 'undefined') return;

    // Clear any previous render (symbol changes re-create the iframe).
    container.innerHTML = '';

    // TradingView's embed loader (embed-widget-advanced-chart.js) reads the
    // JSON config from the textContent of its own <script> element, then
    // injects the chart iframe. We must append it to the DOM so it executes.
    const widgetContainer = document.createElement('div');
    container.appendChild(widgetContainer);

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.textContent = JSON.stringify({
      autosize: true,
      symbol,
      interval,
      timezone: 'Etc/UTC',
      theme: 'dark',
      style: '1',
      locale,
      backgroundColor: '#000000',
      gridColor: '#1f1f1f',
      allow_symbol_change: true,
      support_host: 'https://www.tradingview.com',
    });
    widgetContainer.appendChild(script);

    return () => {
      container.innerHTML = '';
    };
  }, [symbol, interval, locale]);

  if (symbol === null) {
    return (
      <div className="w-full h-[420px] md:h-[520px] border border-border rounded flex flex-col items-center justify-center gap-2 text-center px-6">
        <p className="font-mono text-sm text-muted">
          {unavailableNote || 'Chart not available for this coin.'}
        </p>
      </div>
    );
  }

  if (symbol === undefined) {
    // Resolution in progress — keep the slot sized so the layout does not jump.
    return <div className="w-full h-[420px] md:h-[520px] border border-border rounded" />;
  }

  return <div ref={containerRef} className="w-full h-[420px] md:h-[520px]" />;
}
