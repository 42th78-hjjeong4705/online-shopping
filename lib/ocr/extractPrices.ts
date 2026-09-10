export function extractPriceCandidates(text: string): number[] {
  const normalized = text
    .replace(/[Oo]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[，]/g, ',');

  const pricePattern =
    '(?<![\\d,.])(?:\\d{1,3}(?:[,.]\\d{3})+|\\d{1,3}(?:[ \\t]\\d{3})+|\\d{3,9})(?![\\d,.])';
  const currencyMatches = [
    ...normalized.matchAll(
      new RegExp(
        `(?:(${pricePattern})\\s*원|[₩￦Ww\\\\]\\s*(${pricePattern}))`,
        'g',
      ),
    ),
  ]
    .map((match) => match[1] ?? match[2])
    .filter((match): match is string => Boolean(match));
  const matches = currencyMatches.length
    ? currencyMatches
    : (normalized.match(new RegExp(pricePattern, 'g')) ?? []);
  const seen = new Set<number>();
  const prices: number[] = [];

  for (const match of matches) {
    const digits = match.replace(/\D/g, '');
    if (digits.length < 3 || digits.length > 9) continue;
    const value = Number(digits);
    if (!Number.isSafeInteger(value) || value < 100 || value > 100_000_000)
      continue;
    if (!seen.has(value)) {
      seen.add(value);
      prices.push(value);
    }
  }

  return prices.slice(0, 24);
}
