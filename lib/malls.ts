export interface MallPreset {
  id: string;
  name: string;
}

export const mallPresets: readonly MallPreset[] = [
  { id: 'mall-coupang', name: '쿠팡' },
  { id: 'mall-naver-smartstore', name: '네이버 스마트스토어' },
  { id: 'mall-naver-shopping', name: '네이버쇼핑' },
  { id: 'mall-ssg', name: 'SSG.COM' },
  { id: 'mall-auction', name: '옥션' },
  { id: 'mall-gmarket', name: 'G마켓' },
  { id: 'mall-11st', name: '11번가' },
  { id: 'mall-qoo10', name: '큐텐' },
  { id: 'mall-wemakeprice', name: '위메프' },
  { id: 'mall-tmon', name: '티몬' },
  { id: 'mall-interpark', name: '인터파크커머스' },
  { id: 'mall-lotteon', name: '롯데ON' },
  { id: 'mall-kakao-shopping', name: '카카오쇼핑' },
  { id: 'mall-toss-shopping', name: '토스쇼핑' },
  { id: 'mall-tenbyten', name: '텐바이텐' },
  { id: 'mall-artbox', name: '아트박스' },
] as const;
