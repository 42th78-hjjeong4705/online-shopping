export interface ScrapedProduct {
  name?: string;
  originalPrice?: number;
  salePrice?: number;
  discountRate?: number;
  shippingFee?: number;
  freeShipping?: boolean;
  source: 'json-ld' | 'meta' | 'selector' | 'gmarket' | '11st';
}
