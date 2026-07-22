'use client';

import DisclaimerBanner from './DisclaimerBanner';
import { getLang, t } from '@/lib/i18n';
import Link from 'next/link';

export default function Footer() {
  const lang = getLang();
  return (
    <footer className="border-t border-border mt-auto">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm mb-6">
          <div>
            <h4 className="font-mono text-accent-green mb-3">&gt; NOIRAX</h4>
            <p className="text-xs text-muted">{t('home.disclaimer', lang)}</p>
          </div>
          <div>
            <h4 className="font-mono text-foreground mb-3">{t('nav.free', lang)}</h4>
            <ul className="space-y-1 text-xs text-muted">
              <li><Link href="/free" className="hover:text-foreground transition-colors">{t('nav.free', lang)}</Link></li>
              <li><Link href="/track-record" className="hover:text-foreground transition-colors">{t('nav.trackRecord', lang)}</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-mono text-foreground mb-3">{t('nav.premium', lang)}</h4>
            <ul className="space-y-1 text-xs text-muted">
              <li><Link href="/premium" className="hover:text-foreground transition-colors">{t('nav.premium', lang)}</Link></li>
              <li><Link href="/pricing" className="hover:text-foreground transition-colors">{t('nav.pricing', lang)}</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-mono text-foreground mb-3">{t('nav.blog', lang)}</h4>
            <ul className="space-y-1 text-xs text-muted">
              <li><Link href="/blog" className="hover:text-foreground transition-colors">{t('nav.blog', lang)}</Link></li>
              <li><Link href="/legal" className="hover:text-foreground transition-colors">{t('legal.title', lang)}</Link></li>
            </ul>
          </div>
        </div>
      </div>
      <DisclaimerBanner />
    </footer>
  );
}
