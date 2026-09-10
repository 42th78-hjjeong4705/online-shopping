import assert from 'node:assert/strict';
import { calculateCandidateShipping } from '../lib/optimizer/calculateOrder';
import {
  optimizeCart,
  validateOptimizationInput,
} from '../lib/optimizer/optimizer';
import { extractPriceCandidates } from '../lib/ocr/extractPrices';
import { sampleCoupons, sampleProducts } from '../lib/sampleData';

const result = optimizeCart(sampleProducts, sampleCoupons);
assert.equal(result.selections.length, sampleProducts.length);
assert.equal(
  result.total,
  result.orders.reduce((sum, order) => sum + order.total, 0),
);
assert.ok(result.total > 0);
assert.ok(
  result.orders.every(
    (order) =>
      order.total === order.subtotal + order.shippingFee - order.couponDiscount,
  ),
);

const amountRule = sampleProducts[0].candidates[0];
assert.equal(calculateCandidateShipping(amountRule, 1), 3000);
assert.equal(calculateCandidateShipping(amountRule, 2), 0);

const quantityRule = sampleProducts[1].candidates[1];
assert.equal(calculateCandidateShipping(quantityRule, 1), 2500);
assert.equal(calculateCandidateShipping(quantityRule, 2), 0);

const unknownShippingProducts = structuredClone(sampleProducts);
unknownShippingProducts[0].candidates[0].shipping = { type: 'unknown' };
assert.ok(
  validateOptimizationInput(unknownShippingProducts, []).some((error) =>
    error.includes('배송비'),
  ),
);

const disabledIncompleteCoupon = {
  ...sampleCoupons[0],
  id: 'disabled-incomplete-coupon',
  mallId: '',
  value: undefined,
  enabled: false,
};
assert.deepEqual(
  validateOptimizationInput(sampleProducts, [disabledIncompleteCoupon]),
  [],
);

assert.deepEqual(
  extractPriceCandidates('정가 39,900원 판매가 29,900원 쿠폰가 27 900'),
  [39900, 29900],
);
assert.deepEqual(
  extractPriceCandidates('정가 39,900 판매가 27 900'),
  [39900, 27900],
);
assert.deepEqual(extractPriceCandidates('25,670 3'), [25670]);
assert.deepEqual(extractPriceCandidates('25,670\n3'), [25670]);
assert.deepEqual(extractPriceCandidates('25 670 3'), [25670]);
assert.deepEqual(extractPriceCandidates('25,6703'), []);
assert.deepEqual(extractPriceCandidates('25,670원 3'), [25670]);
assert.deepEqual(extractPriceCandidates('₩25,670'), [25670]);
assert.deepEqual(extractPriceCandidates('￦ 25,670'), [25670]);
assert.deepEqual(extractPriceCandidates('W25,670 3'), [25670]);
assert.deepEqual(extractPriceCandidates('\\25,670'), [25670]);
assert.deepEqual(
  extractPriceCandidates('상품번호 12345678 가격 ₩25,670'),
  [25670],
);
assert.deepEqual(
  extractPriceCandidates('₩39,900 판매가 29,900원'),
  [39900, 29900],
);
assert.deepEqual(
  extractPriceCandidates('배송비 3,000원 / 판매가 25,670원'),
  [3000, 25670],
);
assert.deepEqual(
  extractPriceCandidates('상품번호 12345678 가격 25,670원'),
  [25670],
);

console.log(
  JSON.stringify(
    {
      total: result.total,
      malls: result.orders.map((order) => order.mallName),
      explored: result.exploredCombinations,
      pruned: result.prunedBranches,
    },
    null,
    2,
  ),
);
