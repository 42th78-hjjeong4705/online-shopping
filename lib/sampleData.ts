import type { Coupon, ProductGroup } from './optimizer/types';

export const sampleProducts: ProductGroup[] = [
  {
    id: 'mouse',
    name: '무선 마우스',
    quantity: 2,
    candidates: [
      {
        id: 'mouse-gmarket',
        mallId: 'mall-gmarket',
        mallName: 'G마켓',
        price: 32000,
        shipping: {
          type: 'free-over-amount',
          fee: 3000,
          thresholdAmount: 50000,
        },
      },
      {
        id: 'mouse-coupang',
        mallId: 'mall-coupang',
        mallName: '쿠팡',
        price: 33500,
        shipping: { type: 'free' },
      },
    ],
  },
  {
    id: 'hub',
    name: 'USB-C 허브',
    quantity: 1,
    candidates: [
      {
        id: 'hub-gmarket',
        mallId: 'mall-gmarket',
        mallName: 'G마켓',
        price: 19000,
        shipping: { type: 'paid', fee: 3000 },
      },
      {
        id: 'hub-11st',
        mallId: 'mall-11st',
        mallName: '11번가',
        price: 17500,
        shipping: {
          type: 'free-over-quantity',
          fee: 2500,
          thresholdQuantity: 2,
        },
      },
    ],
  },
];

export const sampleCoupons: Coupon[] = [
  {
    id: 'gmarket-coupon',
    mallId: 'mall-gmarket',
    type: 'percentage',
    value: 10,
    minOrderAmount: 50000,
    maxDiscount: 8000,
    enabled: true,
  },
];
