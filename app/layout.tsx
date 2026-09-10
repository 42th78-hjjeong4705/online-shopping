import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cartwise | 캡처로 비교하는 쇼핑 가격 계산기',
  description:
    '상품 캡처에서 가격을 찾고 수량, 배송비와 쿠폰을 함께 비교합니다.',
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:5173',
  ),
  openGraph: {
    title: '장바구니 최적 구매 조합 계산기',
    description: '가격·배송비·쿠폰을 한 번에 비교하세요.',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: '장바구니 최적 구매 조합 계산기',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '장바구니 최적 구매 조합 계산기',
    description: '가격·배송비·쿠폰을 한 번에 비교하세요.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
