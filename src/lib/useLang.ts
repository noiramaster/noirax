'use client';

import { useEffect, useState } from 'react';
import { getLang } from '@/lib/i18n';

// Language for render-time i18n that never causes a hydration mismatch:
// the server and the first client paint both use 'en'; the real language is
// applied in an effect right after hydration.
export function useLang(): string {
  const [lang, setLang] = useState('en');
  useEffect(() => {
    setLang(getLang());
  }, []);
  return lang;
}