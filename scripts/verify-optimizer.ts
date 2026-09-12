import assert from 'node:assert/strict';
import {
  calculateCandidateShipping,
  calculateMallOrder,
} from '../lib/optimizer/calculateOrder';
import {
  optimizeCart,
  validateOptimizationInput,
} from '../lib/optimizer/optimizer';
import { extractPriceCandidates } from '../lib/ocr/extractPrices';
import { sampleCoupons, sampleProducts } from '../lib/sampleData';
import type { SelectedProduct } from '../lib/optimizer/types';

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

const sameMallPaidItems: SelectedProduct[] = [
  {
    productId: 'paid-a',
    productName: '상품 A',
    quantity: 1,
    candidate: {
      id: 'paid-a-candidate',
      mallId: 'mall-shared',
      mallName: '같은 쇼핑몰',
      price: 20000,
      shipping: { type: 'paid', fee: 3000 },
    },
    itemSubtotal: 20000,
  },
  {
    productId: 'paid-b',
    productName: '상품 B',
    quantity: 1,
    candidate: {
      id: 'paid-b-candidate',
      mallId: 'mall-shared',
      mallName: '같은 쇼핑몰',
      price: 25000,
      shipping: { type: 'paid', fee: 3000 },
    },
    itemSubtotal: 25000,
  },
];
const sameMallPaidOrder = calculateMallOrder(
  'mall-shared',
  sameMallPaidItems,
  [],
);
assert.equal(sameMallPaidOrder.shippingFee, 3000);
assert.equal(sameMallPaidOrder.total, 48000);

const combinedThresholdItems = sameMallPaidItems.map<SelectedProduct>(
  (item) => ({
    ...item,
    candidate: {
      ...item.candidate,
      price: 30000,
      shipping: {
        type: 'free-over-amount',
        fee: 3000,
        thresholdAmount: 50000,
      },
    },
    itemSubtotal: 30000,
  }),
);
assert.equal(
  calculateMallOrder('mall-shared', combinedThresholdItems, []).shippingFee,
  0,
);

const differentFeesItems = sameMallPaidItems.map<SelectedProduct>(
  (item, index) => ({
    ...item,
    candidate: {
      ...item.candidate,
      shipping: { type: 'paid', fee: index === 0 ? 2500 : 4000 },
    },
  }),
);
assert.equal(
  calculateMallOrder('mall-shared', differentFeesItems, []).shippingFee,
  4000,
);

const groupedShippingOptimization = optimizeCart(
  [
    {
      id: 'grouped-a',
      name: '묶음 상품 A',
      quantity: 1,
      candidates: [
        {
          id: 'grouped-a-shared',
          mallId: 'mall-bundle',
          mallName: '묶음 쇼핑몰',
          price: 10000,
          shipping: { type: 'paid', fee: 5000 },
        },
        {
          id: 'grouped-a-separate',
          mallId: 'mall-separate-a',
          mallName: '개별 쇼핑몰 A',
          price: 13000,
          shipping: { type: 'free' },
        },
      ],
    },
    {
      id: 'grouped-b',
      name: '묶음 상품 B',
      quantity: 1,
      candidates: [
        {
          id: 'grouped-b-shared',
          mallId: 'mall-bundle',
          mallName: '묶음 쇼핑몰',
          price: 10000,
          shipping: { type: 'paid', fee: 5000 },
        },
        {
          id: 'grouped-b-separate',
          mallId: 'mall-separate-b',
          mallName: '개별 쇼핑몰 B',
          price: 13000,
          shipping: { type: 'free' },
        },
      ],
    },
  ],
  [],
);
assert.equal(groupedShippingOptimization.total, 25000);
assert.deepEqual(
  groupedShippingOptimization.orders.map((order) => order.mallId),
  ['mall-bundle'],
);

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
