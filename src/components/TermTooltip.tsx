'use client';

import { useState } from 'react';

interface TermTooltipProps {
  term: string;
  definition: string;
  children: React.ReactNode;
}

export default function TermTooltip({ term, definition, children }: TermTooltipProps) {
  const [show, setShow] = useState(false);

  return (
    <span
      className="relative inline-block cursor-help border-b border-dotted border-muted"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-black border border-border rounded text-xs text-terminal-text z-50 shadow-lg">
          <strong className="text-accent-green">{term}</strong>: {definition}
        </span>
      )}
    </span>
  );
}
