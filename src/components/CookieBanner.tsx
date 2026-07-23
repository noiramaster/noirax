'use client';

import { useState, useEffect } from 'react';
import { getLang, t } from '@/lib/i18n';

export default function CookieBanner() {
  const lang = getLang();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('noirax_cookies');
    if (!consent) setVisible(true);
  }, []);

  const accept = () => {
    localStorage.setItem('noirax_cookies', 'accepted');
    setVisible(false);
  };

  const reject = () => {
    localStorage.setItem('noirax_cookies', 'rejected');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-black/95 backdrop-blur p-4">
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center gap-4">
        <p className="text-xs text-muted font-mono flex-1">
          {t('cookies.text', lang)}{' '}
          <a href="/privacidad" className="text-accent-green hover:underline">{t('cookies.moreInfo', lang)}</a>
        </p>
        <div className="flex gap-2">
          <button onClick={reject} className="text-xs text-muted hover:text-foreground font-mono px-3 py-1.5 border border-border rounded transition-colors cursor-pointer">
            {t('cookies.reject', lang)}
          </button>
          <button onClick={accept} className="text-xs text-accent-green font-mono px-3 py-1.5 border border-accent-green rounded hover:bg-accent-green hover:text-black transition-colors cursor-pointer">
            {t('cookies.accept', lang)}
          </button>
        </div>
      </div>
    </div>
  );
}
