'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, ArrowUpRight, BadgePercent, Calculator, CheckCircle2, LoaderCircle, PackagePlus, Plus, RotateCcw, ShoppingBasket, Sparkles, Trash2, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { optimizeCart, validateOptimizationInput } from '@/lib/optimizer/optimizer';
import type { Coupon, MallPolicy, OptimizationResult, ProductCandidate, ProductGroup } from '@/lib/optimizer/types';
import { sampleCoupons, samplePolicies, sampleProducts } from '@/lib/sampleData';

const won = new Intl.NumberFormat('ko-KR');
const money = (value: number) => `${won.format(Math.round(value))}원`;
const uid = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

function NumberField({ value, onChange, placeholder, optional = false }: { value?: number; onChange: (value: number | undefined) => void; placeholder?: string; optional?: boolean }) {
  return <Input type="number" min="0" value={value ?? ''} placeholder={placeholder} onChange={(event) => onChange(event.target.value === '' && optional ? undefined : Number(event.target.value))} />;
}

export default function ProductOptimizer() {
  const [products, setProducts] = useState<ProductGroup[]>([]);
  const [policies, setPolicies] = useState<MallPolicy[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [result, setResult] = useState<OptimizationResult>();
  const [errors, setErrors] = useState<string[]>([]);
  const [scrapeState, setScrapeState] = useState<Record<string, { loading?: boolean; message?: string; ok?: boolean }>>({});

  const combinationCount = useMemo(() => products.reduce((count, product) => count * Math.max(product.candidates.length, 1), products.length ? 1 : 0), [products]);

  function loadSample() {
    setProducts(structuredClone(sampleProducts));
    setPolicies(structuredClone(samplePolicies));
    setCoupons(structuredClone(sampleCoupons));
    setErrors([]);
    setResult(undefined);
  }

  function resetAll() {
    setProducts([]); setPolicies([]); setCoupons([]); setResult(undefined); setErrors([]); setScrapeState({});
  }

  function addProduct() {
    const firstMall = policies[0];
    setProducts((items) => [...items, { id: uid(), name: '', candidates: [{ id: uid(), mallId: firstMall?.id ?? '', mallName: firstMall?.name ?? '', url: '', originalPrice: 0, salePrice: 0, shippingFee: firstMall?.defaultShippingFee ?? 0 }] }]);
  }

  function updateProduct(productId: string, patch: Partial<ProductGroup>) {
    setProducts((items) => items.map((item) => item.id === productId ? { ...item, ...patch } : item));
  }

  function updateCandidate(productId: string, candidateId: string, patch: Partial<ProductCandidate>) {
    setProducts((items) => items.map((product) => product.id === productId ? { ...product, candidates: product.candidates.map((candidate) => candidate.id === candidateId ? { ...candidate, ...patch } : candidate) } : product));
  }

  function addCandidate(productId: string) {
    const firstMall = policies[0];
    setProducts((items) => items.map((product) => product.id === productId ? { ...product, candidates: [...product.candidates, { id: uid(), mallId: firstMall?.id ?? '', mallName: firstMall?.name ?? '', url: '', originalPrice: 0, salePrice: 0, shippingFee: firstMall?.defaultShippingFee ?? 0 }] } : product));
  }

  async function scrape(productId: string, candidate: ProductCandidate) {
    if (!candidate.url.trim()) { setScrapeState((state) => ({ ...state, [candidate.id]: { message: '먼저 상품 URL을 입력해 주세요.' } })); return; }
    setScrapeState((state) => ({ ...state, [candidate.id]: { loading: true } }));
    try {
      const response = await fetch('/api/scrape', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: candidate.url }) });
      const data = await response.json() as { product?: { name?: string; originalPrice?: number; salePrice?: number; discountRate?: number; shippingFee?: number }; error?: string };
      if (!response.ok || !data.product) throw new Error(data.error ?? '상품 정보를 불러오지 못했습니다.');
      const product = data.product;
      updateCandidate(productId, candidate.id, {
        originalPrice: product.originalPrice ?? product.salePrice ?? candidate.originalPrice,
        salePrice: product.salePrice ?? candidate.salePrice,
        discountRate: product.discountRate,
        shippingFee: product.shippingFee ?? candidate.shippingFee,
      });
      const group = products.find((item) => item.id === productId);
      if (product.name && group && !group.name.trim()) updateProduct(productId, { name: product.name });
      setScrapeState((state) => ({ ...state, [candidate.id]: { ok: true, message: '가져온 정보를 확인해 주세요.' } }));
    } catch (error) {
      setScrapeState((state) => ({ ...state, [candidate.id]: { message: `${error instanceof Error ? error.message : '자동 분석에 실패했습니다.'} 수동으로 입력할 수 있습니다.` } }));
    }
  }

  function calculate() {
    const nextErrors = validateOptimizationInput(products, policies, coupons);
    setErrors(nextErrors);
    if (nextErrors.length) { setResult(undefined); document.getElementById('errors')?.scrollIntoView({ behavior: 'smooth' }); return; }
    try { setResult(optimizeCart(products, policies, coupons)); }
    catch (error) { setErrors([error instanceof Error ? error.message : '계산 중 오류가 발생했습니다.']); setResult(undefined); }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-card/92 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground"><ShoppingBasket className="size-5" /></span>
            <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Cartwise</p><p className="text-sm font-semibold sm:text-base">장바구니 최적 구매 조합 계산기</p></div>
          </div>
          <Button variant="ghost" onClick={resetAll} disabled={!products.length && !policies.length}><RotateCcw /> 초기화</Button>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] px-4 py-7 sm:px-6 lg:px-8">
        <div className="mb-7 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div className="max-w-3xl">
            <span className="inline-flex rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">가격·배송비·쿠폰 통합 비교</span>
            <h1 className="mt-3 text-balance text-3xl font-bold tracking-tight md:text-4xl">개별 최저가보다 더 싼<br className="hidden sm:block" /> 장바구니 조합을 찾아보세요.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">상품 후보를 입력하면 쇼핑몰별 무료배송과 가장 유리한 쿠폰까지 반영해 최종 결제 금액을 계산합니다.</p>
          </div>
          <Button variant="outline" className="h-10 self-start" onClick={loadSample}><Sparkles /> 샘플 데이터로 시작</Button>
        </div>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-5">
            <Card className="border-0 shadow-none ring-border">
              <CardHeader className="border-b">
                <div className="flex items-start justify-between gap-4">
                  <div><CardTitle className="flex items-center gap-2 text-lg"><PackagePlus className="text-primary" /> 1. 상품 등록</CardTitle><CardDescription className="mt-1">한 상품마다 쇼핑몰 후보 중 정확히 한 곳이 선택됩니다.</CardDescription></div>
                  <Button onClick={addProduct}><Plus /> 상품 추가</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                {!products.length && <Empty title="등록한 상품이 없습니다" description="샘플을 불러오거나 상품을 직접 추가해 주세요." />}
                {products.map((product, productIndex) => (
                  <div key={product.id} className="rounded-xl border bg-background p-4">
                    <div className="mb-4 flex items-center gap-3">
                      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">{productIndex + 1}</span>
                      <Input aria-label="상품명" value={product.name} placeholder="상품명 (예: 무선 마우스)" onChange={(event) => updateProduct(product.id, { name: event.target.value })} />
                      <Button variant="ghost" size="icon" aria-label="상품 삭제" onClick={() => setProducts((items) => items.filter((item) => item.id !== product.id))}><Trash2 /></Button>
                    </div>
                    <div className="space-y-3">
                      {product.candidates.map((candidate, candidateIndex) => {
                        const status = scrapeState[candidate.id];
                        return <div key={candidate.id} className="rounded-lg bg-muted/45 p-3">
                          <div className="mb-3 flex items-center justify-between"><p className="text-xs font-bold text-muted-foreground">구매 후보 {candidateIndex + 1}</p><Button variant="ghost" size="xs" onClick={() => updateProduct(product.id, { candidates: product.candidates.filter((item) => item.id !== candidate.id) })}><Trash2 /> 삭제</Button></div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <label className="field-label">쇼핑몰<select className="native-field" value={candidate.mallId} onChange={(event) => { const mall = policies.find((item) => item.id === event.target.value); updateCandidate(product.id, candidate.id, { mallId: event.target.value, mallName: mall?.name ?? '', shippingFee: mall?.defaultShippingFee ?? 0 }); }}><option value="">쇼핑몰 선택</option>{policies.map((mall) => <option key={mall.id} value={mall.id}>{mall.name}</option>)}</select></label>
                            <label className="field-label">상품 URL<div className="flex gap-2"><Input type="url" value={candidate.url} placeholder="https://..." onChange={(event) => updateCandidate(product.id, candidate.id, { url: event.target.value })} /><Button variant="outline" className="shrink-0" onClick={() => scrape(product.id, candidate)} disabled={status?.loading}>{status?.loading ? <LoaderCircle className="animate-spin" /> : <ArrowUpRight />} 정보 불러오기</Button></div></label>
                            <label className="field-label">정가 (원)<NumberField value={candidate.originalPrice} onChange={(value) => updateCandidate(product.id, candidate.id, { originalPrice: value ?? 0 })} /></label>
                            <label className="field-label">최종 판매가 (원)<NumberField value={candidate.salePrice} onChange={(value) => updateCandidate(product.id, candidate.id, { salePrice: value ?? 0 })} /></label>
                            <label className="field-label">표시 할인율 (%)<NumberField optional value={candidate.discountRate} onChange={(value) => updateCandidate(product.id, candidate.id, { discountRate: value })} placeholder="선택 입력" /></label>
                            <label className="field-label">후보 배송비 (원)<NumberField optional value={candidate.shippingFee} onChange={(value) => updateCandidate(product.id, candidate.id, { shippingFee: value })} placeholder="쇼핑몰 조건이 우선" /></label>
                          </div>
                          {status?.message && <p className={`mt-2 flex items-start gap-1.5 text-xs ${status.ok ? 'text-emerald-700' : 'text-amber-700'}`}>{status.ok ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" /> : <AlertCircle className="mt-0.5 size-3.5 shrink-0" />}{status.message}</p>}
                        </div>;
                      })}
                    </div>
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => addCandidate(product.id)}><Plus /> 후보 추가</Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-0 shadow-none ring-border">
              <CardHeader className="border-b"><div className="flex items-start justify-between gap-4"><div><CardTitle className="flex items-center gap-2 text-lg"><Truck className="text-primary" /> 2. 쇼핑몰 배송 조건</CardTitle><CardDescription className="mt-1">같은 쇼핑몰 상품을 합친 금액으로 무료배송을 판단합니다.</CardDescription></div><Button variant="outline" onClick={() => setPolicies((items) => [...items, { id: uid(), name: '', defaultShippingFee: 0, noShippingFee: false }])}><Plus /> 쇼핑몰 추가</Button></div></CardHeader>
              <CardContent className="space-y-3 pt-4">
                {!policies.length && <Empty title="쇼핑몰 조건이 없습니다" description="상품 후보를 추가하기 전에 쇼핑몰을 등록해 주세요." />}
                {policies.map((policy) => <div key={policy.id} className="grid gap-3 rounded-xl border bg-background p-3 md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-end">
                  <label className="field-label">쇼핑몰 이름<Input value={policy.name} placeholder="예: G마켓" onChange={(event) => { const name = event.target.value; setPolicies((items) => items.map((item) => item.id === policy.id ? { ...item, name } : item)); setProducts((items) => items.map((product) => ({ ...product, candidates: product.candidates.map((candidate) => candidate.mallId === policy.id ? { ...candidate, mallName: name } : candidate) }))); }} /></label>
                  <label className="field-label">기본 배송비<NumberField value={policy.defaultShippingFee} onChange={(value) => setPolicies((items) => items.map((item) => item.id === policy.id ? { ...item, defaultShippingFee: value ?? 0 } : item))} /></label>
                  <label className="field-label">무료배송 기준<NumberField optional value={policy.freeShippingThreshold} placeholder="비워두면 없음" onChange={(value) => setPolicies((items) => items.map((item) => item.id === policy.id ? { ...item, freeShippingThreshold: value } : item))} /></label>
                  <div className="flex items-center gap-2 pb-0.5"><label className="flex h-8 items-center gap-2 whitespace-nowrap text-xs font-medium"><input type="checkbox" checked={policy.noShippingFee} onChange={(event) => setPolicies((items) => items.map((item) => item.id === policy.id ? { ...item, noShippingFee: event.target.checked } : item))} /> 항상 무료</label><Button variant="ghost" size="icon" aria-label="쇼핑몰 삭제" onClick={() => setPolicies((items) => items.filter((item) => item.id !== policy.id))}><Trash2 /></Button></div>
                </div>)}
              </CardContent>
            </Card>

            <Card className="border-0 shadow-none ring-border">
              <CardHeader className="border-b"><div className="flex items-start justify-between gap-4"><div><CardTitle className="flex items-center gap-2 text-lg"><BadgePercent className="text-primary" /> 3. 쿠폰 등록</CardTitle><CardDescription className="mt-1">쇼핑몰 주문마다 조건을 만족하는 가장 유리한 쿠폰 한 장을 적용합니다.</CardDescription></div><Button variant="outline" onClick={() => setCoupons((items) => [...items, { id: uid(), name: '', mallId: policies[0]?.id ?? '', type: 'fixed', value: 0, minOrderAmount: 0, enabled: true }])}><Plus /> 쿠폰 추가</Button></div></CardHeader>
              <CardContent className="space-y-3 pt-4">
                {!coupons.length && <Empty title="등록한 쿠폰이 없습니다" description="쿠폰이 없어도 최적 조합을 계산할 수 있습니다." compact />}
                {coupons.map((coupon) => <div key={coupon.id} className="grid gap-3 rounded-xl border bg-background p-3 md:grid-cols-3">
                  <label className="field-label">쿠폰 이름<Input value={coupon.name} placeholder="예: 10% 장바구니 쿠폰" onChange={(event) => setCoupons((items) => items.map((item) => item.id === coupon.id ? { ...item, name: event.target.value } : item))} /></label>
                  <label className="field-label">적용 쇼핑몰<select className="native-field" value={coupon.mallId} onChange={(event) => setCoupons((items) => items.map((item) => item.id === coupon.id ? { ...item, mallId: event.target.value } : item))}><option value="">선택</option>{policies.map((mall) => <option key={mall.id} value={mall.id}>{mall.name}</option>)}</select></label>
                  <label className="field-label">할인 방식<select className="native-field" value={coupon.type} onChange={(event) => setCoupons((items) => items.map((item) => item.id === coupon.id ? { ...item, type: event.target.value as Coupon['type'] } : item))}><option value="fixed">정액 할인</option><option value="percentage">정률 할인</option></select></label>
                  <label className="field-label">{coupon.type === 'fixed' ? '할인 금액 (원)' : '할인율 (%)'}<NumberField value={coupon.value} onChange={(value) => setCoupons((items) => items.map((item) => item.id === coupon.id ? { ...item, value: value ?? 0 } : item))} /></label>
                  <label className="field-label">최소 주문금액<NumberField value={coupon.minOrderAmount} onChange={(value) => setCoupons((items) => items.map((item) => item.id === coupon.id ? { ...item, minOrderAmount: value ?? 0 } : item))} /></label>
                  <label className="field-label">최대 할인금액<NumberField optional value={coupon.maxDiscount} placeholder="비워두면 제한 없음" onChange={(value) => setCoupons((items) => items.map((item) => item.id === coupon.id ? { ...item, maxDiscount: value } : item))} /></label>
                  <div className="flex items-center justify-between md:col-span-3"><label className="flex items-center gap-2 text-xs font-medium"><input type="checkbox" checked={coupon.enabled} onChange={(event) => setCoupons((items) => items.map((item) => item.id === coupon.id ? { ...item, enabled: event.target.checked } : item))} /> 이번 계산에 사용</label><Button variant="ghost" size="sm" onClick={() => setCoupons((items) => items.filter((item) => item.id !== coupon.id))}><Trash2 /> 삭제</Button></div>
                </div>)}
              </CardContent>
            </Card>

            {!!errors.length && <div id="errors" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p className="mb-2 flex items-center gap-2 font-bold"><AlertCircle className="size-4" /> 입력 내용을 확인해 주세요</p><ul className="list-disc space-y-1 pl-5">{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
          </div>

          <aside className="xl:sticky xl:top-20">
            <Card className="border-0 bg-primary text-primary-foreground shadow-[0_20px_70px_-32px_var(--shadow-color)] ring-0">
              <CardHeader><p className="text-xs font-semibold text-primary-foreground/65">4. 최적 조합 계산</p><CardTitle className="text-xl">추천 구매 조합</CardTitle><CardDescription className="text-primary-foreground/65">{products.length ? `${products.length}개 상품 · 최대 ${won.format(combinationCount)}개 조합` : '상품을 입력하면 결과가 표시됩니다.'}</CardDescription></CardHeader>
              <CardContent>
                {result ? <Result result={result} /> : <div className="rounded-xl border border-primary-foreground/15 bg-white/5 p-5 text-center"><Calculator className="mx-auto mb-3 size-8 text-primary-foreground/50" /><p className="font-semibold">아직 계산 전입니다</p><p className="mt-1 text-xs leading-5 text-primary-foreground/60">상품과 조건을 입력한 뒤 아래 버튼을 눌러 주세요.</p></div>}
                <Button className="mt-5 h-12 w-full bg-white text-primary hover:bg-white/90" onClick={calculate}><Calculator /> 최적 조합 계산하기</Button>
              </CardContent>
            </Card>
            <div className="mt-4 rounded-xl border bg-card p-4 text-xs leading-5 text-muted-foreground"><p className="font-semibold text-foreground">계산 방식</p><p className="mt-1">백트래킹으로 모든 유효 조합을 살피되, 남은 상품의 낙관적 최저 비용도 현재 최적값보다 비싸면 해당 가지를 탐색하지 않습니다.</p></div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function Empty({ title, description, compact = false }: { title: string; description: string; compact?: boolean }) {
  return <div className={`rounded-xl border border-dashed bg-muted/30 text-center ${compact ? 'p-4' : 'p-7'}`}><p className="font-semibold">{title}</p><p className="mt-1 text-xs text-muted-foreground">{description}</p></div>;
}

function Result({ result }: { result: OptimizationResult }) {
  return <div>
    <div className="mb-5"><p className="text-xs text-primary-foreground/60">전체 최종 결제 금액</p><p className="mt-1 text-4xl font-bold tracking-tight">{money(result.total)}</p>{result.savings != null && result.savings > 0 && <p className="mt-2 inline-flex rounded-full bg-emerald-300/15 px-2.5 py-1 text-xs font-semibold text-emerald-100">정가 기준 {money(result.savings)} 절약</p>}</div>
    <div className="space-y-3">
      {result.orders.map((order) => <div key={order.mallId} className="rounded-xl bg-white/8 p-4 ring-1 ring-white/12">
        <div className="mb-3 flex items-center justify-between"><p className="font-bold">{order.mallName}</p><p className="font-bold">{money(order.total)}</p></div>
        <div className="space-y-2 text-xs text-primary-foreground/75">{order.items.map((item) => <div key={item.productId} className="flex items-start justify-between gap-3"><a className="min-w-0 truncate underline decoration-white/30 underline-offset-2 hover:text-white" href={item.candidate.url || undefined} target="_blank" rel="noopener noreferrer">{item.productName}</a><span className="shrink-0">{money(item.candidate.salePrice)}</span></div>)}</div>
        <div className="my-3 h-px bg-white/12" />
        <dl className="space-y-1.5 text-xs"><div className="flex justify-between"><dt className="text-primary-foreground/60">상품 합계</dt><dd>{money(order.subtotal)}</dd></div><div className="flex justify-between"><dt className="text-primary-foreground/60">배송비</dt><dd>{order.shippingFee ? money(order.shippingFee) : '무료'}</dd></div><div className="flex justify-between"><dt className="text-primary-foreground/60">쿠폰 할인{order.couponName ? ` · ${order.couponName}` : ''}</dt><dd>{order.couponDiscount ? `-${money(order.couponDiscount)}` : '—'}</dd></div></dl>
      </div>)}
    </div>
    <p className="mt-3 text-[11px] text-primary-foreground/45">완성 조합 {won.format(result.exploredCombinations)}개 확인 · 가지 {won.format(result.prunedBranches)}개 제외</p>
  </div>;
}
