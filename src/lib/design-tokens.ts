export const tokens = {
  colors: {
    background: '#000000',
    foreground: '#e0e0e0',
    accentGreen: '#39FF14',
    accentRed: '#FF3B3B',
    accentMagenta: '#D63384',
    terminalPrompt: '#39FF14',
    terminalText: '#c0c0c0',
    muted: '#666666',
    border: '#222222',
  },
  fonts: {
    sans: "'Inter', system-ui, sans-serif",
    mono: "'JetBrains Mono', monospace",
  },
  signals: {
    buy: { color: '#39FF14', label: 'BUY' },
    sell: { color: '#FF3B3B', label: 'SELL' },
    neutral: { color: '#666666', label: 'NEUTRAL' },
  },
} as const;
