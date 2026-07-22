'use client';

import { getLang, t } from '@/lib/i18n';
import LangSwitcher from './LangSwitcher';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

export default function Header() {
  const lang = getLang();
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user || null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });
    return () => listener?.subscription.unsubscribe();
  }, []);

  return (
    <header className="border-b border-border">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="font-mono text-lg font-bold text-accent-green hover:opacity-80 transition-opacity">
          &gt; NOIRAX
        </Link>
        <nav className="hidden md:flex items-center gap-5 text-xs font-mono">
          <Link href="/free" className="text-muted hover:text-foreground transition-colors">{t('nav.free', lang)}</Link>
          <Link href="/premium" className="text-muted hover:text-foreground transition-colors">{t('nav.premium', lang)}</Link>
          <Link href="/track-record" className="text-muted hover:text-foreground transition-colors">{t('nav.trackRecord', lang)}</Link>
          <Link href="/pricing" className="text-muted hover:text-foreground transition-colors">{t('nav.pricing', lang)}</Link>
          {user ? (
            <>
              <Link href="/account" className="text-muted hover:text-foreground transition-colors">{t('nav.account', lang)}</Link>
              <button
                onClick={() => supabase.auth.signOut()}
                className="text-muted hover:text-accent-red transition-colors cursor-pointer"
              >
                {t('nav.logout', lang)}
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-muted hover:text-foreground transition-colors">{t('nav.login', lang)}</Link>
              <Link
                href="/signup"
                className="border border-accent-green text-accent-green px-3 py-1.5 rounded hover:bg-accent-green hover:text-black transition-colors"
              >
                {t('nav.signup', lang)}
              </Link>
            </>
          )}
          <LangSwitcher />
        </nav>
        <button
          className="md:hidden text-muted font-mono text-sm"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? '[X]' : '[=]'}
        </button>
      </div>
      {menuOpen && (
        <div className="md:hidden border-t border-border px-4 py-3 space-y-2 text-xs font-mono">
          <div className="flex flex-col gap-2">
            <Link href="/free" className="text-muted hover:text-foreground">{t('nav.free', lang)}</Link>
            <Link href="/premium" className="text-muted hover:text-foreground">{t('nav.premium', lang)}</Link>
            <Link href="/track-record" className="text-muted hover:text-foreground">{t('nav.trackRecord', lang)}</Link>
            <Link href="/pricing" className="text-muted hover:text-foreground">{t('nav.pricing', lang)}</Link>
            {user ? (
              <button onClick={() => supabase.auth.signOut()} className="text-left text-muted hover:text-accent-red">
                {t('nav.logout', lang)}
              </button>
            ) : (
              <>
                <Link href="/login" className="text-muted hover:text-foreground">{t('nav.login', lang)}</Link>
                <Link href="/signup" className="text-muted hover:text-foreground">{t('nav.signup', lang)}</Link>
              </>
            )}
            <LangSwitcher />
          </div>
        </div>
      )}
    </header>
  );
}
