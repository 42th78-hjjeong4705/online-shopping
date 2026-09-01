import assert from 'node:assert/strict';
import { optimizeCart } from '../lib/optimizer/optimizer';
import { sampleCoupons, samplePolicies, sampleProducts } from '../lib/sampleData';

const result = optimizeCart(sampleProducts, samplePolicies, sampleCoupons);
assert.equal(result.selections.length, sampleProducts.length);
assert.equal(result.total, result.orders.reduce((sum, order) => sum + order.total, 0));
assert.ok(result.total > 0);
assert.ok(result.savings != null && result.savings > 0);

// The cheapest individual candidates cost 90,000원 before shipping/coupons.
// The optimizer must account for order-level conditions rather than just choosing them blindly.
assert.ok(result.orders.every((order) => order.total === order.subtotal + order.shippingFee - order.couponDiscount));

console.log(JSON.stringify({ total: result.total, malls: result.orders.map((order) => order.mallName), explored: result.exploredCombinations, pruned: result.prunedBranches }, null, 2));
