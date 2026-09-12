import {
  calculateCandidateShipping,
  calculateCombination,
} from './calculateOrder';
import type {
  Coupon,
  OptimizationResult,
  ProductGroup,
  SelectedProduct,
} from './types';

export function validateProducts(products: ProductGroup[]): string[] {
  const errors: string[] = [];
  if (products.length === 0)
    errors.push('비교할 상품을 하나 이상 추가해 주세요.');
  for (const product of products) {
    if (!product.name.trim()) errors.push('모든 상품의 이름을 입력해 주세요.');
    if (!Number.isInteger(product.quantity) || product.quantity < 1) {
      errors.push(
        `‘${product.name || '이름 없는 상품'}’의 수량을 확인해 주세요.`,
      );
    }
  }
  return [...new Set(errors)];
}

export function validateCandidates(products: ProductGroup[]): string[] {
  const errors = validateProducts(products);
  for (const product of products) {
    if (product.candidates.length === 0) {
      errors.push(
        `‘${product.name || '이름 없는 상품'}’에 구매 후보를 추가해 주세요.`,
      );
    }
    for (const candidate of product.candidates) {
      if (!candidate.mallId || !candidate.mallName.trim()) {
        errors.push(
          `‘${product.name || '이름 없는 상품'}’ 후보의 쇼핑몰을 선택해 주세요.`,
        );
      }
      if (!Number.isFinite(candidate.price) || (candidate.price ?? 0) <= 0) {
        errors.push(
          `‘${product.name || '이름 없는 상품'}’ 후보의 실제 구매가격을 입력해 주세요.`,
        );
      }
    }
  }
  return [...new Set(errors)];
}

export function validateOptimizationInput(
  products: ProductGroup[],
  coupons: Coupon[],
): string[] {
  const errors = validateCandidates(products);
  const availableMallIds = new Set(
    products.flatMap((product) =>
      product.candidates.map((candidate) => candidate.mallId),
    ),
  );
  for (const product of products) {
    for (const candidate of product.candidates) {
      const label = `‘${product.name || '이름 없는 상품'} · ${candidate.mallName || '쇼핑몰 미선택'}’`;
      const rule = candidate.shipping;
      if (rule.type === 'unknown')
        errors.push(`${label} 후보의 배송비를 확인해 주세요.`);
      if (
        rule.type !== 'free' &&
        (!Number.isFinite(rule.fee) || (rule.fee ?? -1) < 0)
      ) {
        errors.push(`${label} 후보의 배송비를 입력해 주세요.`);
      }
      if (
        rule.type === 'free-over-amount' &&
        (!Number.isFinite(rule.thresholdAmount) ||
          (rule.thresholdAmount ?? 0) <= 0)
      ) {
        errors.push(`${label} 후보의 무료배송 주문금액을 입력해 주세요.`);
      }
      if (
        rule.type === 'free-over-quantity' &&
        (!Number.isInteger(rule.thresholdQuantity) ||
          (rule.thresholdQuantity ?? 0) < 1)
      ) {
        errors.push(`${label} 후보의 무료배송 수량을 입력해 주세요.`);
      }
    }
  }
  for (const coupon of coupons) {
    if (!coupon.enabled) continue;
    if (!coupon.mallId || !availableMallIds.has(coupon.mallId)) {
      errors.push('쿠폰을 적용할 쇼핑몰을 선택해 주세요.');
    }
    if (!Number.isFinite(coupon.value) || (coupon.value ?? 0) <= 0) {
      errors.push('쿠폰 할인값을 입력해 주세요.');
    }
    if (coupon.type === 'percentage' && (coupon.value ?? 0) > 100) {
      errors.push('쿠폰 할인율은 100%를 넘을 수 없습니다.');
    }
    if ((coupon.minOrderAmount ?? 0) < 0 || (coupon.maxDiscount ?? 0) < 0) {
      errors.push('쿠폰 금액은 음수일 수 없습니다.');
    }
  }
  return [...new Set(errors)];
}

function maximumCouponDiscount(
  coupons: Coupon[],
  products: ProductGroup[],
  selected: SelectedProduct[],
  index: number,
): number {
  const selectedByMall = new Map<string, number>();
  for (const item of selected) {
    selectedByMall.set(
      item.candidate.mallId,
      (selectedByMall.get(item.candidate.mallId) ?? 0) + item.itemSubtotal,
    );
  }
  const mallIds = new Set(
    coupons.filter((coupon) => coupon.enabled).map((coupon) => coupon.mallId),
  );
  let total = 0;
  for (const mallId of mallIds) {
    let possibleSubtotal = selectedByMall.get(mallId) ?? 0;
    for (let i = index; i < products.length; i += 1) {
      possibleSubtotal += Math.max(
        0,
        ...products[i].candidates
          .filter((candidate) => candidate.mallId === mallId)
          .map((candidate) => (candidate.price ?? 0) * products[i].quantity),
      );
    }
    const possibleDiscount = coupons
      .filter((coupon) => coupon.enabled && coupon.mallId === mallId)
      .map((coupon) =>
        coupon.type === 'fixed'
          ? (coupon.value ?? 0)
          : Math.min(
              possibleSubtotal * ((coupon.value ?? 0) / 100),
              coupon.maxDiscount ?? Number.POSITIVE_INFINITY,
            ),
      )
      .reduce((best, value) => Math.max(best, value), 0);
    total += Math.min(possibleDiscount, possibleSubtotal);
  }
  return total;
}

export function optimizeCart(
  products: ProductGroup[],
  coupons: Coupon[],
): OptimizationResult {
  const errors = validateOptimizationInput(products, coupons);
  if (errors.length) throw new Error(errors[0]);

  const sortedProducts = [...products].sort(
    (a, b) => a.candidates.length - b.candidates.length,
  );
  const suffixMinimum = Array.from(
    { length: sortedProducts.length + 1 },
    () => 0,
  );
  for (let i = sortedProducts.length - 1; i >= 0; i -= 1) {
    suffixMinimum[i] =
      suffixMinimum[i + 1] +
      Math.min(
        ...sortedProducts[i].candidates.map(
          (candidate) => (candidate.price ?? 0) * sortedProducts[i].quantity,
        ),
      );
  }

  let best: OptimizationResult | undefined;
  let exploredCombinations = 0;
  let prunedBranches = 0;
  const selected: SelectedProduct[] = [];

  function search(index: number, selectedTotal: number) {
    const optimisticCoupon = maximumCouponDiscount(
      coupons,
      sortedProducts,
      selected,
      index,
    );
    const optimisticLowerBound = Math.max(
      0,
      selectedTotal + suffixMinimum[index] - optimisticCoupon,
    );
    if (best && optimisticLowerBound >= best.total) {
      prunedBranches += 1;
      return;
    }
    if (index === sortedProducts.length) {
      exploredCombinations += 1;
      const result = calculateCombination(selected, coupons);
      if (!best || result.total < best.total) {
        best = { ...result, exploredCombinations, prunedBranches };
      }
      return;
    }

    const product = sortedProducts[index];
    const candidates = [...product.candidates].sort(
      (a, b) =>
        (a.price ?? 0) * product.quantity +
        calculateCandidateShipping(a, product.quantity) -
        ((b.price ?? 0) * product.quantity +
          calculateCandidateShipping(b, product.quantity)),
    );
    for (const candidate of candidates) {
      const itemSubtotal = (candidate.price ?? 0) * product.quantity;
      selected.push({
        productId: product.id,
        productName: product.name,
        quantity: product.quantity,
        candidate,
        itemSubtotal,
      });
      search(index + 1, selectedTotal + itemSubtotal);
      selected.pop();
    }
  }

  search(0, 0);
  if (!best) throw new Error('구매 가능한 조합을 찾지 못했습니다.');
  return { ...best, exploredCombinations, prunedBranches };
}
