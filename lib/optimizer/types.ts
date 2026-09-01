export type CouponType = 'fixed' | 'percentage';

export interface ProductCandidate {
  id: string;
  mallId: string;
  mallName: string;
  url: string;
  originalPrice: number;
  salePrice: number;
  discountRate?: number;
  shippingFee?: number;
}

export interface ProductGroup {
  id: string;
  name: string;
  candidates: ProductCandidate[];
}

export interface MallPolicy {
  id: string;
  name: string;
  defaultShippingFee: number;
  freeShippingThreshold?: number;
  noShippingFee: boolean;
}

export interface Coupon {
  id: string;
  name: string;
  mallId: string;
  type: CouponType;
  value: number;
  minOrderAmount: number;
  maxDiscount?: number;
  enabled: boolean;
}

export interface SelectedProduct {
  productId: string;
  productName: string;
  candidate: ProductCandidate;
}

export interface MallOrderResult {
  mallId: string;
  mallName: string;
  items: SelectedProduct[];
  subtotal: number;
  shippingFee: number;
  couponDiscount: number;
  couponName?: string;
  total: number;
}

export interface OptimizationResult {
  total: number;
  orders: MallOrderResult[];
  selections: SelectedProduct[];
  savings?: number;
  exploredCombinations: number;
  prunedBranches: number;
}
