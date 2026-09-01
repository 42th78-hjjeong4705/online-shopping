import type { Coupon, MallOrderResult, MallPolicy, SelectedProduct } from './types';

function couponDiscount(coupon: Coupon, subtotal: number): number {
  if (!coupon.enabled || subtotal < coupon.minOrderAmount) return 0;
  const raw = coupon.type === 'fixed' ? coupon.value : subtotal * (coupon.value / 100);
  return Math.max(0, Math.min(raw, coupon.maxDiscount ?? Number.POSITIVE_INFINITY, subtotal));
}

export function calculateMallOrder(
  mallId: string,
  items: SelectedProduct[],
  policies: MallPolicy[],
  coupons: Coupon[],
): MallOrderResult {
  const subtotal = items.reduce((sum, item) => sum + item.candidate.salePrice, 0);
  const policy = policies.find((item) => item.id === mallId);
  const fallbackShipping = Math.max(0, ...items.map((item) => item.candidate.shippingFee ?? 0));
  const hasFreeThreshold = policy?.freeShippingThreshold != null;
  const shippingFee = policy
    ? policy.noShippingFee || (hasFreeThreshold && subtotal >= policy.freeShippingThreshold!)
      ? 0
      : policy.defaultShippingFee
    : fallbackShipping;

  const bestCoupon = coupons
    .filter((coupon) => coupon.mallId === mallId && coupon.enabled)
    .map((coupon) => ({ coupon, discount: couponDiscount(coupon, subtotal) }))
    .sort((a, b) => b.discount - a.discount)[0];
  const discount = bestCoupon?.discount ?? 0;

  return {
    mallId,
    mallName: policy?.name ?? items[0]?.candidate.mallName ?? '쇼핑몰',
    items,
    subtotal,
    shippingFee,
    couponDiscount: discount,
    couponName: discount > 0 ? bestCoupon?.coupon.name : undefined,
    total: Math.max(0, subtotal + shippingFee - discount),
  };
}

export function calculateCombination(
  selections: SelectedProduct[],
  policies: MallPolicy[],
  coupons: Coupon[],
): Omit<import('./types').OptimizationResult, 'exploredCombinations' | 'prunedBranches'> {
  const grouped = new Map<string, SelectedProduct[]>();
  for (const selection of selections) {
    grouped.set(selection.candidate.mallId, [...(grouped.get(selection.candidate.mallId) ?? []), selection]);
  }
  const orders = [...grouped.entries()].map(([mallId, items]) => calculateMallOrder(mallId, items, policies, coupons));
  const total = orders.reduce((sum, order) => sum + order.total, 0);
  const originalTotal = selections.reduce((sum, item) => sum + Math.max(item.candidate.originalPrice, item.candidate.salePrice), 0)
    + orders.reduce((sum, order) => sum + order.shippingFee, 0);
  return { total, orders, selections: [...selections], savings: Math.max(0, originalTotal - total) };
}
