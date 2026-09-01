import type { ScrapedProduct } from './types';

export function parsePrice(value: unknown): number | undefined {
  if (typeof value === 'number') return value > 0 ? Math.round(value) : undefined;
  if (typeof value !== 'string') return undefined;
  const numeric = Number(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : undefined;
}

function unescapeHtml(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function walkJson(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(walkJson);
  if (!value || typeof value !== 'object') return [];
  const item = value as Record<string, unknown>;
  return [item, ...Object.values(item).flatMap(walkJson)];
}

function parseJsonLd(html: string): ScrapedProduct | undefined {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of scripts) {
    try {
      const objects = walkJson(JSON.parse(unescapeHtml(match[1]).trim()));
      const product = objects.find((item) => {
        const type = item['@type'];
        return type === 'Product' || (Array.isArray(type) && type.includes('Product'));
      });
      if (!product) continue;
      const offer = walkJson(product.offers).find((item) => item.price != null || item.lowPrice != null);
      const salePrice = parsePrice(offer?.price ?? offer?.lowPrice);
      if (!salePrice) continue;
      const shippingText = JSON.stringify(offer?.shippingDetails ?? '');
      return {
        name: typeof product.name === 'string' ? product.name.trim() : undefined,
        salePrice,
        originalPrice: salePrice,
        freeShipping: /free|무료|0\D/i.test(shippingText),
        shippingFee: /free|무료/i.test(shippingText) ? 0 : undefined,
        source: 'json-ld',
      };
    } catch {
      // Some sites publish invalid JSON-LD. Continue to the meta fallback.
    }
  }
}

function metaValue(html: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i'),
  ];
  return patterns.map((pattern) => html.match(pattern)?.[1]).find(Boolean);
}

function parseMeta(html: string): ScrapedProduct | undefined {
  const salePrice = parsePrice(metaValue(html, 'product:price:amount') ?? metaValue(html, 'og:price:amount'));
  if (!salePrice) return undefined;
  return { name: unescapeHtml(metaValue(html, 'og:title') ?? '').trim() || undefined, salePrice, originalPrice: salePrice, source: 'meta' };
}

function parseKnownSelectors(html: string): ScrapedProduct | undefined {
  const priceMatch = html.match(/(?:class|id)=["'][^"']*(?:sale[_-]?price|discount[_-]?price|product[_-]?price)[^"']*["'][^>]*>[\s\S]{0,180}?([0-9][0-9,]{2,})\s*원?/i);
  const salePrice = parsePrice(priceMatch?.[1]);
  if (!salePrice) return undefined;
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1].replace(/<[^>]+>/g, '').trim();
  return { name: title ? unescapeHtml(title) : undefined, salePrice, originalPrice: salePrice, source: 'selector' };
}

export function parseGenericProduct(html: string): ScrapedProduct | undefined {
  return parseJsonLd(html) ?? parseMeta(html) ?? parseKnownSelectors(html);
}
