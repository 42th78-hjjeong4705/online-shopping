import type { Coupon, MallPolicy, ProductGroup } from './optimizer/types';

export const samplePolicies: MallPolicy[] = [
  { id: 'gmarket', name: 'G마켓', defaultShippingFee: 3000, freeShippingThreshold: 50000, noShippingFee: false },
  { id: '11st', name: '11번가', defaultShippingFee: 2500, freeShippingThreshold: 60000, noShippingFee: false },
  { id: 'coupang', name: '쿠팡', defaultShippingFee: 0, noShippingFee: true },
];

export const sampleProducts: ProductGroup[] = [
  { id: 'mouse', name: '무선 마우스', candidates: [
    { id: 'mouse-g', mallId: 'gmarket', mallName: 'G마켓', url: 'https://browse.gmarket.co.kr/', originalPrice: 36000, salePrice: 32000, discountRate: 11, shippingFee: 3000 },
    { id: 'mouse-11', mallId: '11st', mallName: '11번가', url: 'https://www.11st.co.kr/', originalPrice: 35000, salePrice: 30500, discountRate: 13, shippingFee: 2500 },
    { id: 'mouse-c', mallId: 'coupang', mallName: '쿠팡', url: 'https://www.coupang.com/', originalPrice: 37000, salePrice: 33500, discountRate: 9, shippingFee: 0 },
  ]},
  { id: 'hub', name: 'USB-C 허브', candidates: [
    { id: 'hub-g', mallId: 'gmarket', mallName: 'G마켓', url: 'https://browse.gmarket.co.kr/', originalPrice: 22000, salePrice: 19000, discountRate: 14, shippingFee: 3000 },
    { id: 'hub-11', mallId: '11st', mallName: '11번가', url: 'https://www.11st.co.kr/', originalPrice: 21000, salePrice: 17500, discountRate: 17, shippingFee: 2500 },
    { id: 'hub-c', mallId: 'coupang', mallName: '쿠팡', url: 'https://www.coupang.com/', originalPrice: 22500, salePrice: 20500, discountRate: 9, shippingFee: 0 },
  ]},
  { id: 'keyboard', name: '저소음 키보드', candidates: [
    { id: 'key-g', mallId: 'gmarket', mallName: 'G마켓', url: 'https://browse.gmarket.co.kr/', originalPrice: 48000, salePrice: 43000, discountRate: 10, shippingFee: 3000 },
    { id: 'key-11', mallId: '11st', mallName: '11번가', url: 'https://www.11st.co.kr/', originalPrice: 47000, salePrice: 42000, discountRate: 11, shippingFee: 2500 },
    { id: 'key-c', mallId: 'coupang', mallName: '쿠팡', url: 'https://www.coupang.com/', originalPrice: 49000, salePrice: 44500, discountRate: 9, shippingFee: 0 },
  ]},
];

export const sampleCoupons: Coupon[] = [
  { id: 'g-10', name: 'G마켓 10% 장바구니 쿠폰', mallId: 'gmarket', type: 'percentage', value: 10, minOrderAmount: 50000, maxDiscount: 8000, enabled: true },
  { id: '11-5', name: '11번가 5천원 쿠폰', mallId: '11st', type: 'fixed', value: 5000, minOrderAmount: 70000, maxDiscount: 5000, enabled: true },
];
