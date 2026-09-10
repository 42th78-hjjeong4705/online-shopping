import type {
  Coupon,
  MallOrderResult,
  ProductCandidate,
  SelectedProduct,
} from './types';

export function calculateCandidateShipping(
  candidate: ProductCandidate,
  quantity: number,
): number {
  const rule = candidate.shipping;
  const fee = Math.max(0, rule.fee ?? 0);
  const subtotal = (candidate.price ?? 0) * quantity;

  switch (rule.type) {
    case 'free':
      return 0;
    case 'paid':
      return fee;
    case 'free-over-amount':
      return subtotal >= (rule.thresholdAmount ?? Number.POSITIVE_INFINITY)
        ? 0
        : fee;
    case 'free-over-quantity':
      return quantity >= (rule.thresholdQuantity ?? Number.POSITIVE_INFINITY)
        ? 0
        : fee;
    case 'unknown':
      throw new Error('배송비를 확인하지 않은 구매 후보가 있습니다.');
  }
}

function couponDiscount(coupon: Coupon, subtotal: number): number {
  const value = coupon.value ?? 0;
  if (!coupon.enabled || subtotal < (coupon.minOrderAmount ?? 0)) return 0;
  const raw = coupon.type === 'fixed' ? value : subtotal * (value / 100);
  return Math.max(
    0,
    Math.min(raw, coupon.maxDiscount ?? Number.POSITIVE_INFINITY, subtotal),
  );
}

function couponLabel(coupon: Coupon): string {
  const value = coupon.value ?? 0;
  return coupon.type === 'fixed'
    ? `${Math.round(value).toLocaleString('ko-KR')}원 할인`
    : `${value}% 할인`;
}

export function calculateMallOrder(
  mallId: string,
  items: SelectedProduct[],
  coupons: Coupon[],
): MallOrderResult {
  const subtotal = items.reduce((sum, item) => sum + item.itemSubtotal, 0);
  const shippingFee = items.reduce((sum, item) => sum + item.shippingFee, 0);
  const bestCoupon = coupons
    .filter((coupon) => coupon.mallId === mallId && coupon.enabled)
    .map((coupon) => ({ coupon, discount: couponDiscount(coupon, subtotal) }))
    .sort((a, b) => b.discount - a.discount)[0];
  const discount = bestCoupon?.discount ?? 0;

  return {
    mallId,
    mallName: items[0]?.candidate.mallName ?? '쇼핑몰',
    items,
    subtotal,
    shippingFee,
    couponDiscount: discount,
    couponLabel:
      discount > 0 && bestCoupon ? couponLabel(bestCoupon.coupon) : undefined,
    total: Math.max(0, subtotal + shippingFee - discount),
  };
}

export function calculateCombination(
  selections: SelectedProduct[],
  coupons: Coupon[],
): Omit<
  import('./types').OptimizationResult,
  'exploredCombinations' | 'prunedBranches'
> {
  const grouped = new Map<string, SelectedProduct[]>();
  for (const selection of selections) {
    grouped.set(selection.candidate.mallId, [
      ...(grouped.get(selection.candidate.mallId) ?? []),
      selection,
    ]);
  }
  const orders = [...grouped.entries()].map(([mallId, items]) =>
    calculateMallOrder(mallId, items, coupons),
  );
  const total = orders.reduce((sum, order) => sum + order.total, 0);
  return { total, orders, selections: [...selections] };
}
