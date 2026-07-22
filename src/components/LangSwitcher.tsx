'use client';

import { getLang, setLang, LOCALES } from '@/lib/i18n';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';

const LANG_LABELS: Record<string, string> = {
  en: 'EN', es: 'ES', pt: 'PT', fr: 'FR', de: 'DE', it: 'IT', ar: 'AR',
};

export default function LangSwitcher() {
  const [lang, setLangState] = useState('en');
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLangState(getLang());
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const select = (l: string) => {
    setLang(l);
    setLangState(l);
    setOpen(false);
    router.refresh();
  };

  return (
    <div ref={ref} className="relative font-mono text-xs">
      <button
        onClick={() => setOpen(!open)}
        className="text-muted hover:text-foreground transition-colors cursor-pointer"
      >
        [{LANG_LABELS[lang] || 'EN'} ▾]
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 bg-black border border-border rounded p-1 min-w-[80px] z-50">
          {LOCALES.map((l) => (
            <button
              key={l}
              onClick={() => select(l)}
              className={`block w-full text-left px-2 py-1 hover:text-accent-green transition-colors cursor-pointer ${lang === l ? 'text-accent-green' : 'text-muted'}`}
            >
              {LANG_LABELS[l]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
