import { calculateCombination } from './calculateOrder';
import type { Coupon, MallPolicy, OptimizationResult, ProductGroup, SelectedProduct } from './types';

export function validateOptimizationInput(products: ProductGroup[], policies: MallPolicy[], coupons: Coupon[]): string[] {
  const errors: string[] = [];
  if (products.length === 0) errors.push('상품을 하나 이상 등록해 주세요.');
  for (const product of products) {
    if (!product.name.trim()) errors.push('모든 상품에 이름을 입력해 주세요.');
    if (product.candidates.length === 0) errors.push(`‘${product.name || '이름 없는 상품'}’에 구매 후보를 추가해 주세요.`);
    for (const candidate of product.candidates) {
      if (!candidate.mallId || !candidate.mallName.trim()) errors.push(`‘${product.name}’ 후보의 쇼핑몰을 선택해 주세요.`);
      if (!Number.isFinite(candidate.salePrice) || candidate.salePrice <= 0) errors.push(`‘${product.name}’ 후보 가격은 0원보다 커야 합니다.`);
      if (candidate.originalPrice < candidate.salePrice) errors.push(`‘${product.name}’ 후보의 정가는 판매가보다 작을 수 없습니다.`);
    }
  }
  for (const policy of policies) {
    if (policy.defaultShippingFee < 0) errors.push(`${policy.name} 배송비는 음수일 수 없습니다.`);
    if (policy.freeShippingThreshold != null && policy.freeShippingThreshold < 0) errors.push(`${policy.name} 무료배송 기준은 0 이상이어야 합니다.`);
  }
  for (const coupon of coupons) {
    if (coupon.value <= 0 || coupon.minOrderAmount < 0) errors.push(`${coupon.name || '쿠폰'} 조건을 확인해 주세요.`);
    if (coupon.type === 'percentage' && coupon.value > 100) errors.push(`${coupon.name || '쿠폰'} 할인율은 100%를 넘을 수 없습니다.`);
    if (coupon.maxDiscount != null && coupon.maxDiscount < 0) errors.push(`${coupon.name || '쿠폰'} 최대 할인금액은 0 이상이어야 합니다.`);
  }
  return [...new Set(errors)];
}

function maximumCouponDiscount(coupons: Coupon[], products: ProductGroup[], selected: SelectedProduct[], index: number): number {
  const selectedByMall = new Map<string, number>();
  for (const item of selected) selectedByMall.set(item.candidate.mallId, (selectedByMall.get(item.candidate.mallId) ?? 0) + item.candidate.salePrice);
  const mallIds = new Set(coupons.filter((c) => c.enabled).map((c) => c.mallId));
  let total = 0;
  for (const mallId of mallIds) {
    let possibleSubtotal = selectedByMall.get(mallId) ?? 0;
    for (let i = index; i < products.length; i += 1) {
      possibleSubtotal += Math.max(0, ...products[i].candidates.filter((c) => c.mallId === mallId).map((c) => c.salePrice));
    }
    const possibleDiscount = coupons
      .filter((coupon) => coupon.enabled && coupon.mallId === mallId)
      .map((coupon) => coupon.type === 'fixed'
        ? coupon.value
        : Math.min(possibleSubtotal * coupon.value / 100, coupon.maxDiscount ?? Number.POSITIVE_INFINITY))
      .reduce((best, value) => Math.max(best, value), 0);
    total += Math.min(possibleDiscount, possibleSubtotal);
  }
  return total;
}

export function optimizeCart(products: ProductGroup[], policies: MallPolicy[], coupons: Coupon[]): OptimizationResult {
  const errors = validateOptimizationInput(products, policies, coupons);
  if (errors.length) throw new Error(errors[0]);

  const sortedProducts = [...products].sort((a, b) => a.candidates.length - b.candidates.length);
  const suffixMinimum = new Array(sortedProducts.length + 1).fill(0);
  for (let i = sortedProducts.length - 1; i >= 0; i -= 1) {
    suffixMinimum[i] = suffixMinimum[i + 1] + Math.min(...sortedProducts[i].candidates.map((c) => c.salePrice));
  }

  let best: OptimizationResult | undefined;
  let exploredCombinations = 0;
  let prunedBranches = 0;
  const selected: SelectedProduct[] = [];

  function search(index: number, selectedSaleTotal: number) {
    const optimisticCoupon = maximumCouponDiscount(coupons, sortedProducts, selected, index);
    const optimisticLowerBound = Math.max(0, selectedSaleTotal + suffixMinimum[index] - optimisticCoupon);
    if (best && optimisticLowerBound >= best.total) {
      prunedBranches += 1;
      return;
    }
    if (index === sortedProducts.length) {
      exploredCombinations += 1;
      const result = calculateCombination(selected, policies, coupons);
      if (!best || result.total < best.total) best = { ...result, exploredCombinations, prunedBranches };
      return;
    }

    const product = sortedProducts[index];
    for (const candidate of [...product.candidates].sort((a, b) => a.salePrice - b.salePrice)) {
      selected.push({ productId: product.id, productName: product.name, candidate });
      search(index + 1, selectedSaleTotal + candidate.salePrice);
      selected.pop();
    }
  }

  search(0, 0);
  if (!best) throw new Error('구매 가능한 조합을 찾지 못했습니다.');
  return { ...best, exploredCombinations, prunedBranches };
}
