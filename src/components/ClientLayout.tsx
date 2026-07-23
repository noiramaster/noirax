'use client';

import { useEffect, useState } from 'react';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { getLang, isRTL } from '@/lib/i18n';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PremiumPrompt from '@/components/PremiumPrompt';
import CookieBanner from '@/components/CookieBanner';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState('en');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const detected = getLang();
    setLang(detected);
    setMounted(true);
  }, []);

  const rtl = isRTL(lang);

  return (
    <div
      dir={rtl ? 'rtl' : 'ltr'}
      className={`${inter.variable} ${jetbrainsMono.variable} flex flex-col min-h-full`}
    >
      <Header />
      <main className="flex-1">{mounted ? children : null}</main>
      <Footer />
      <PremiumPrompt />
      <CookieBanner />
    </div>
  );
}
