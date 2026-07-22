'use client';

import { useEffect, useState } from 'react';
import { getLang, t } from '@/lib/i18n';
import Link from 'next/link';

const STORAGE_KEY = 'noirax_premium_prompt_seen';

export default function PremiumPrompt() {
  const [visible, setVisible] = useState(false);
  const lang = getLang();

  useEffect(() => {
    const timer = setTimeout(() => {
      const lastSeen = localStorage.getItem(STORAGE_KEY);
      if (lastSeen) {
        const elapsed = Date.now() - parseInt(lastSeen, 10);
        if (elapsed < 24 * 60 * 60 * 1000) return;
      }
      setVisible(true);
    }, 10000);

    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 border border-accent-magenta bg-black p-4 rounded max-w-xs">
      <div className="font-mono text-sm text-accent-magenta mb-2">
        &gt; {t('premiumPrompt.title', lang)}
      </div>
      <p className="text-xs text-terminal-text mb-3">
        {t('premiumPrompt.description', lang)}
      </p>
      <div className="flex gap-2">
        <Link
          href="/pricing"
          className="text-xs border border-accent-green text-accent-green px-3 py-1.5 rounded hover:bg-accent-green hover:text-black transition-colors"
        >
          {t('premiumPrompt.cta', lang)}
        </Link>
        <button
          onClick={dismiss}
          className="text-xs text-muted hover:text-foreground transition-colors cursor-pointer"
        >
          {t('premiumPrompt.later', lang)}
        </button>
      </div>
    </div>
  );
}
