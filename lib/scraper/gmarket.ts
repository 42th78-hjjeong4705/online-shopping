import { parsePrice } from './generic';
import type { ScrapedProduct } from './types';

export function parseGmarket(html: string): ScrapedProduct | undefined {
  const salePrice = parsePrice(html.match(/class=["'][^"']*price_real[^"']*["'][^>]*>[\s\S]{0,100}?([0-9][0-9,]+)/i)?.[1]);
  if (!salePrice) return undefined;
  const originalPrice = parsePrice(html.match(/class=["'][^"']*price_original[^"']*["'][^>]*>[\s\S]{0,100}?([0-9][0-9,]+)/i)?.[1]) ?? salePrice;
  return { salePrice, originalPrice, discountRate: originalPrice > salePrice ? Math.round((1 - salePrice / originalPrice) * 100) : undefined, source: 'gmarket' };
}
