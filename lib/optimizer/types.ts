export type CouponType = 'fixed' | 'percentage';
export type ShippingRuleType =
  | 'unknown'
  | 'free'
  | 'paid'
  | 'free-over-amount'
  | 'free-over-quantity';

export interface ShippingRule {
  type: ShippingRuleType;
  fee?: number;
  thresholdAmount?: number;
  thresholdQuantity?: number;
}

export interface ProductCandidate {
  id: string;
  mallId: string;
  mallName: string;
  price?: number;
  shipping: ShippingRule;
}

export interface ProductGroup {
  id: string;
  name: string;
  quantity: number;
  candidates: ProductCandidate[];
}

export interface Coupon {
  id: string;
  mallId: string;
  type: CouponType;
  value?: number;
  minOrderAmount?: number;
  maxDiscount?: number;
  enabled: boolean;
}

export interface SelectedProduct {
  productId: string;
  productName: string;
  quantity: number;
  candidate: ProductCandidate;
  itemSubtotal: number;
}

export interface MallOrderResult {
  mallId: string;
  mallName: string;
  items: SelectedProduct[];
  subtotal: number;
  shippingFee: number;
  couponDiscount: number;
  couponLabel?: string;
  total: number;
}

export interface OptimizationResult {
  total: number;
  orders: MallOrderResult[];
  selections: SelectedProduct[];
  exploredCombinations: number;
  prunedBranches: number;
}
