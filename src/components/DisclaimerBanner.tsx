'use client';

import { getLang, t } from '@/lib/i18n';
import { useEffect, useState } from 'react';

export default function DisclaimerBanner() {
  const [lang, setLang] = useState('en');

  useEffect(() => {
    setLang(getLang());
  }, []);

  return (
    <div className="border-t border-border py-3 px-4 text-center">
      <p className="text-xs text-muted font-mono">
        &gt; {t('disclaimerBanner.text', lang)}
      </p>
    </div>
  );
}
