const TEST_TEXT_PATTERNS = [
  /\be2e\b/i,
  /\b(test|testing|tester|dummy|debug|placeholder|lorem ipsum|sample)\b/i,
  /\bsimulation signal\b/i,
  /\bse[ññ]al de simulaci[óo]n\b/i,
  /\bfoo\b/i,
  /\bbar\b/i,
];

export function cleanExplanation(value: unknown, fallback: string = ''): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const trimmed = value.trim();
  if (trimmed.length < 20) return fallback;
  for (const pattern of TEST_TEXT_PATTERNS) {
    if (pattern.test(trimmed)) return fallback;
  }
  return trimmed;
}
