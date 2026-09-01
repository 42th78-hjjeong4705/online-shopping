import { parseElevenSt } from './elevenst';
import { parseGenericProduct } from './generic';
import { parseGmarket } from './gmarket';
import type { ScrapedProduct } from './types';

export function parseProductHtml(html: string, hostname: string): ScrapedProduct | undefined {
  // Generic structured data is the most stable source, so it always gets first chance.
  const generic = parseGenericProduct(html);
  if (generic) return generic;
  if (/(^|\.)gmarket\.co\.kr$/i.test(hostname)) return parseGmarket(html);
  if (/(^|\.)11st\.co\.kr$/i.test(hostname)) return parseElevenSt(html);
  return undefined;
}

export type { ScrapedProduct } from './types';
