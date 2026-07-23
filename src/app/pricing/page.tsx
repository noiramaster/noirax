'use client';

import { getLang, t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { useState } from 'react';

export default function PricingPage() {
  const lang = getLang();
  const [loading, setLoading] = useState<string | null>(null);

  const getFeatures = (path: string): string[] => {
    const val = t(path, lang);
    return typeof val === 'string' ? val.split(', ') : [];
  };

  const handleSubscribe = async (priceId: string) => {
    setLoading(priceId);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      window.location.href = '/login';
      return;
    }
    const response = await fetch('/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price_id: priceId, user_id: session.user.id }),
    });
    const data = await response.json();
    if (data.url) {
      window.location.href = data.url;
    }
    setLoading(null);
  };

  const freeFeatures = getFeatures('pricing.free.features');
  const premiumFeatures = getFeatures('pricing.premium.features');
  const annualFeatures = getFeatures('pricing.annual.features');

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="font-mono text-3xl text-accent-green mb-2">&gt; {t('pricing.title', lang)}</h1>
      <p className="text-sm text-muted mb-8">{t('pricing.free.description', lang)}</p>
      <div className="grid md:grid-cols-3 gap-6">
        <div className="border border-border rounded p-6 flex flex-col">
          <h2 className="font-mono text-lg text-foreground mb-1">{t('pricing.free.name', lang)}</h2>
          <p className="font-mono text-3xl text-accent-green mb-4">{t('pricing.free.price', lang)}</p>
          <ul className="space-y-2 text-xs text-muted font-mono flex-1 mb-6">
            {freeFeatures.map((f: string, i: number) => (
              <li key={i} className="flex items-center gap-2">
                <span className="text-accent-green">&gt;</span> {f}
              </li>
            ))}
          </ul>
          <a
            href="/free"
            className="block border border-border text-foreground px-4 py-2 rounded text-sm font-mono text-center hover:border-accent-green transition-colors"
          >
            {t('common.learnMore', lang)}
          </a>
        </div>

        {/* Premium Monthly — €7.99 */}
        <div className="border border-accent-green rounded p-6 flex flex-col relative">
          <div className="absolute -top-3 left-4 bg-black px-2 text-xs font-mono text-accent-green border border-accent-green rounded">
            RECOMMENDED
          </div>
          <h2 className="font-mono text-lg text-foreground mb-1">{t('pricing.premium.name', lang)}</h2>
          <p className="font-mono text-3xl text-accent-green mb-4">{t('pricing.premium.price', lang)}</p>
          <ul className="space-y-2 text-xs text-muted font-mono flex-1 mb-6">
            {premiumFeatures.map((f: string, i: number) => (
              <li key={i} className="flex items-center gap-2">
                <span className="text-accent-green">&gt;</span> {f}
              </li>
            ))}
          </ul>
          <button
            onClick={() => handleSubscribe('price_1Tw615G3dX1nYHD82wxfZPXm')}
            disabled={loading !== null}
            className="border border-accent-green text-accent-green px-4 py-2 rounded text-sm font-mono hover:bg-accent-green hover:text-black transition-colors cursor-pointer disabled:opacity-50"
          >
            {loading === 'price_1Tw615G3dX1nYHD82wxfZPXm' ? t('common.loading', lang) : t('pricing.premium.cta', lang)}
          </button>
        </div>

        {/* Premium Annual — €79 */}
        <div className="border border-border rounded p-6 flex flex-col">
          <h2 className="font-mono text-lg text-foreground mb-1">{t('pricing.annual.name', lang)}</h2>
          <p className="font-mono text-3xl text-accent-green mb-4">{t('pricing.annual.price', lang)}</p>
          <ul className="space-y-2 text-xs text-muted font-mono flex-1 mb-6">
            {annualFeatures.map((f: string, i: number) => (
              <li key={i} className="flex items-center gap-2">
                <span className="text-accent-green">&gt;</span> {f}
              </li>
            ))}
          </ul>
          <button
            onClick={() => handleSubscribe('price_1Tw616G3dX1nYHD8jETcHYOv')}
            disabled={loading !== null}
            className="border border-accent-green text-accent-green px-4 py-2 rounded text-sm font-mono hover:bg-accent-green hover:text-black transition-colors cursor-pointer disabled:opacity-50"
          >
            {loading === 'price_1Tw616G3dX1nYHD8jETcHYOv' ? t('common.loading', lang) : t('pricing.annual.cta', lang)}
          </button>
        </div>
      </div>

      <p className="text-xs text-muted mt-8 font-mono text-center">
        * {t('legal.affiliateDisclaimer', lang)}<br />
        {t('legal.disclaimer', lang)}
      </p>
    </div>
  );
}
