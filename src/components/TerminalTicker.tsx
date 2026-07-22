'use client';

import { useEffect, useState } from 'react';
import { getLang, t } from '@/lib/i18n';

export default function TerminalTicker() {
  const [displayText, setDisplayText] = useState('');
  const [showCursor, setShowCursor] = useState(true);
  const lang = getLang();
  const fullText = `> ${t('home.typingText', lang)}`;

  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      if (index <= fullText.length) {
        setDisplayText(fullText.slice(0, index));
        index++;
      } else {
        clearInterval(interval);
      }
    }, 30);
    return () => clearInterval(interval);
  }, [fullText]);

  useEffect(() => {
    const cursorInterval = setInterval(() => {
      setShowCursor((prev) => !prev);
    }, 500);
    return () => clearInterval(cursorInterval);
  }, []);

  return (
    <div className="font-mono text-sm text-terminal-text mb-6 min-h-[1.5em]">
      {displayText}
      <span className={`${showCursor ? 'opacity-100' : 'opacity-0'} text-accent-green`}>_</span>
    </div>
  );
}
