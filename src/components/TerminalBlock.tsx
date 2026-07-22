'use client';

interface TerminalBlockProps {
  prompt?: string;
  children: React.ReactNode;
  className?: string;
}

export default function TerminalBlock({ prompt = '>', children, className = '' }: TerminalBlockProps) {
  return (
    <div className={`font-mono text-sm text-terminal-text border border-border rounded p-4 bg-black ${className}`}>
      <span className="text-accent-green">{prompt}</span>{' '}
      {children}
    </div>
  );
}
