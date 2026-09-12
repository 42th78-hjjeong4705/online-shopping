'use client';

import { useEffect, useMemo, useState, type DragEvent } from 'react';
import Image from 'next/image';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CircleCheckBig,
  ImageIcon,
  Minus,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
  ShoppingBasket,
  TicketPercent,
  Trash2,
  Truck,
  Upload,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { mallPresets } from '@/lib/malls';
import { extractPriceCandidates } from '@/lib/ocr/extractPrices';
import {
  optimizeCart,
  validateCandidates,
  validateOptimizationInput,
  validateProducts,
} from '@/lib/optimizer/optimizer';
import type {
  Coupon,
  OptimizationResult,
  ProductCandidate,
  ProductGroup,
  ShippingRuleType,
} from '@/lib/optimizer/types';

const DRAFT_KEY = 'cartwise-draft-v2';
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 25_000_000;
const won = new Intl.NumberFormat('ko-KR');
const money = (value: number) => `${won.format(Math.round(value))}원`;
const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

const steps = [
  { number: 1, title: '상품과 수량', icon: Package },
  { number: 2, title: '가격 후보', icon: Camera },
  { number: 3, title: '배송·쿠폰', icon: Truck },
  { number: 4, title: '비교 결과', icon: CircleCheckBig },
] as const;

type OcrState = {
  status: 'idle' | 'loading' | 'done' | 'error';
  progress: number;
  previewUrl?: string;
  fileName?: string;
  prices: number[];
  error?: string;
};

const blankCandidate = (id = uid()): ProductCandidate => ({
  id,
  mallId: '',
  mallName: '',
  shipping: { type: 'unknown' },
});

const blankProduct = (id = uid(), candidateId = uid()): ProductGroup => ({
  id,
  name: '',
  quantity: 1,
  candidates: [blankCandidate(candidateId)],
});

const initialProducts = [blankProduct('initial-product', 'initial-candidate')];

function parseDigits(value: string): number | undefined {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits) : undefined;
}

function MoneyField({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value?: number;
  onChange: (value: number | undefined) => void;
  placeholder?: string;
  ariaLabel: string;
}) {
  return (
    <div className="relative">
      <Input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={ariaLabel}
        value={value == null ? '' : won.format(value)}
        placeholder={placeholder}
        className="h-11 pr-9 text-base tabular-nums"
        onChange={(event) => onChange(parseDigits(event.target.value))}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        원
      </span>
    </div>
  );
}

function QuantityField({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
}) {
  return (
    <div className="inline-flex h-11 items-center rounded-xl border bg-background p-1">
      <Button
        type="button"
        className="size-8 px-0"
        variant="ghost"
        aria-label={`${label} 줄이기`}
        disabled={value <= 1}
        onClick={() => onChange(Math.max(1, value - 1))}
      >
        <Minus />
      </Button>
      <input
        className="w-12 bg-transparent text-center text-base font-bold tabular-nums outline-none"
        inputMode="numeric"
        aria-label={label}
        value={value}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) =>
          onChange(Math.max(1, parseDigits(event.target.value) ?? 1))
        }
      />
      <Button
        type="button"
        className="size-8 px-0"
        variant="ghost"
        aria-label={`${label} 늘리기`}
        onClick={() => onChange(value + 1)}
      >
        <Plus />
      </Button>
    </div>
  );
}

async function preprocessImage(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) {
      throw new Error(
        '이미지가 너무 큽니다. 화면의 가격 부분만 잘라서 다시 올려 주세요.',
      );
    }
    const scale = Math.min(2, 2400 / bitmap.width, 2400 / bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('이미지를 읽을 수 없습니다.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.filter = 'grayscale(1) contrast(1.35)';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    bitmap.close();
  }
}

export default function ProductOptimizer() {
  const [step, setStep] = useState(1);
  const [products, setProducts] = useState<ProductGroup[]>(initialProducts);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [result, setResult] = useState<OptimizationResult>();
  const [errors, setErrors] = useState<string[]>([]);
  const [ocrStates, setOcrStates] = useState<Record<string, OcrState>>({});
  const [hydrated, setHydrated] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const usedMalls = useMemo(() => {
    const malls = new Map<string, string>();
    for (const product of products) {
      for (const candidate of product.candidates) {
        if (candidate.mallId && candidate.mallName)
          malls.set(candidate.mallId, candidate.mallName);
      }
    }
    return [...malls.entries()].map(([id, name]) => ({ id, name }));
  }, [products]);

  const ocrIsRunning = Object.values(ocrStates).some(
    (state) => state.status === 'loading',
  );

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const stored = localStorage.getItem(DRAFT_KEY);
        if (stored) {
          const draft = JSON.parse(stored) as {
            products?: ProductGroup[];
            coupons?: Coupon[];
            step?: number;
            savedAt?: number;
          };
          const savedAt = draft.savedAt ?? 0;
          const draftAge = Date.now() - savedAt;
          if (
            !Number.isFinite(savedAt) ||
            draftAge < 0 ||
            draftAge > DRAFT_TTL_MS
          ) {
            localStorage.removeItem(DRAFT_KEY);
          } else {
            if (Array.isArray(draft.products) && draft.products.length)
              setProducts(draft.products);
            if (Array.isArray(draft.coupons)) setCoupons(draft.coupons);
            if (draft.step && draft.step >= 1 && draft.step <= 3)
              setStep(draft.step);
          }
        }
      } catch {
        localStorage.removeItem(DRAFT_KEY);
      } finally {
        setHydrated(true);
      }
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        products,
        coupons,
        step: Math.min(step, 3),
        savedAt: Date.now(),
      }),
    );
  }, [coupons, hydrated, products, step]);

  function replaceProducts(
    next: ProductGroup[] | ((current: ProductGroup[]) => ProductGroup[]),
  ) {
    setProducts((current) =>
      typeof next === 'function' ? next(current) : next,
    );
    setResult(undefined);
    setErrors([]);
  }

  function updateProduct(productId: string, patch: Partial<ProductGroup>) {
    replaceProducts((items) =>
      items.map((item) =>
        item.id === productId ? { ...item, ...patch } : item,
      ),
    );
  }

  function updateCandidate(
    productId: string,
    candidateId: string,
    patch: Partial<ProductCandidate>,
  ) {
    replaceProducts((items) =>
      items.map((product) =>
        product.id === productId
          ? {
              ...product,
              candidates: product.candidates.map((candidate) =>
                candidate.id === candidateId
                  ? { ...candidate, ...patch }
                  : candidate,
              ),
            }
          : product,
      ),
    );
  }

  function clearPreview(candidateId: string) {
    setOcrStates((states) => {
      const state = states[candidateId];
      if (state?.previewUrl) URL.revokeObjectURL(state.previewUrl);
      const next = { ...states };
      delete next[candidateId];
      return next;
    });
  }

  function removeCandidate(productId: string, candidateId: string) {
    clearPreview(candidateId);
    replaceProducts((items) =>
      items.map((product) =>
        product.id === productId
          ? {
              ...product,
              candidates: product.candidates.filter(
                (item) => item.id !== candidateId,
              ),
            }
          : product,
      ),
    );
  }

  function removeProduct(productId: string) {
    const product = products.find((item) => item.id === productId);
    product?.candidates.forEach((candidate) => clearPreview(candidate.id));
    replaceProducts((items) => items.filter((item) => item.id !== productId));
  }

  function resetAll() {
    Object.values(ocrStates).forEach(
      (state) => state.previewUrl && URL.revokeObjectURL(state.previewUrl),
    );
    setOcrStates({});
    setProducts([blankProduct()]);
    setCoupons([]);
    setResult(undefined);
    setErrors([]);
    setStep(1);
    localStorage.removeItem(DRAFT_KEY);
    setResetOpen(false);
  }

  async function analyzeImage(
    productId: string,
    candidateId: string,
    file?: File,
  ) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setOcrStates((states) => ({
        ...states,
        [candidateId]: {
          status: 'error',
          progress: 0,
          prices: [],
          error: 'JPG, PNG 또는 WebP 이미지로 올려 주세요.',
        },
      }));
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setOcrStates((states) => ({
        ...states,
        [candidateId]: {
          status: 'error',
          progress: 0,
          prices: [],
          error: '15MB 이하 이미지로 올려 주세요.',
        },
      }));
      return;
    }

    const previous = ocrStates[candidateId];
    if (previous?.previewUrl) URL.revokeObjectURL(previous.previewUrl);
    const previewUrl = URL.createObjectURL(file);
    setOcrStates((states) => ({
      ...states,
      [candidateId]: {
        status: 'loading',
        progress: 3,
        prices: [],
        previewUrl,
        fileName: file.name || '붙여넣은 캡처',
      },
    }));

    let worker: import('tesseract.js').Worker | undefined;
    try {
      const canvas = await preprocessImage(file);
      const tesseract = await import('tesseract.js');
      worker = await tesseract.createWorker('kor', tesseract.OEM.LSTM_ONLY, {
        workerPath: '/tesseract/worker.min.js',
        corePath: '/tesseract/core',
        langPath: '/tesseract/lang',
        logger: ({ progress }) => {
          setOcrStates((states) => ({
            ...states,
            [candidateId]: {
              ...(states[candidateId] ?? { status: 'loading', prices: [] }),
              status: 'loading',
              progress: Math.max(5, Math.round(progress * 100)),
            },
          }));
        },
      });
      await worker.setParameters({
        tessedit_pageseg_mode: tesseract.PSM.SPARSE_TEXT,
        tessedit_char_whitelist: '0123456789, 원₩￦Ww\\',
        preserve_interword_spaces: '1',
      });
      const response = await worker.recognize(canvas);
      const prices = extractPriceCandidates(response.data.text);
      setOcrStates((states) => ({
        ...states,
        [candidateId]: {
          ...states[candidateId],
          status: prices.length ? 'done' : 'error',
          progress: 100,
          prices,
          error: prices.length
            ? undefined
            : '가격을 찾지 못했습니다. 가격 부분만 크게 잘라 다시 올리거나 직접 입력해 주세요.',
        },
      }));
    } catch (error) {
      setOcrStates((states) => ({
        ...states,
        [candidateId]: {
          ...(states[candidateId] ?? { prices: [] }),
          status: 'error',
          progress: 0,
          error:
            error instanceof Error
              ? error.message
              : '이미지 분석에 실패했습니다.',
        },
      }));
    } finally {
      await worker?.terminate();
    }
  }

  function handleDrop(
    event: DragEvent<HTMLElement>,
    productId: string,
    candidateId: string,
  ) {
    event.preventDefault();
    void analyzeImage(productId, candidateId, event.dataTransfer.files[0]);
  }

  function goNext() {
    let nextErrors: string[] = [];
    if (step === 1) nextErrors = validateProducts(products);
    if (step === 2) nextErrors = validateCandidates(products);
    if (step === 3) nextErrors = validateOptimizationInput(products, coupons);
    setErrors(nextErrors);
    if (nextErrors.length) {
      document
        .getElementById('step-errors')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (step === 3) {
      try {
        setResult(optimizeCart(products, coupons));
      } catch (error) {
        setErrors([
          error instanceof Error
            ? error.message
            : '계산 중 오류가 발생했습니다.',
        ]);
        return;
      }
    }
    setStep((current) => Math.min(4, current + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <ShoppingBasket className="size-5" />
            </span>
            <div>
              <p className="text-sm font-extrabold tracking-tight">Cartwise</p>
              <p className="hidden text-sm text-muted-foreground sm:block">
                쇼핑 가격 비교
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hydrated && (
              <span className="hidden items-center gap-1.5 text-sm text-muted-foreground sm:flex">
                <Check className="size-4 text-emerald-600" /> 24시간 임시 저장
              </span>
            )}
            <Button variant="ghost" onClick={() => setResetOpen(true)}>
              <RotateCcw /> 모두 지우기
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
        <section
          aria-label="진행 단계"
          className="mb-6 rounded-2xl border bg-card p-4 shadow-sm sm:p-5"
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-primary">{step} / 4</p>
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                {steps[step - 1].title}
              </h1>
            </div>
            <p className="text-sm text-muted-foreground">
              필요한 내용만 차례로 입력하세요
            </p>
          </div>
          <Progress value={step * 25} aria-label={`4단계 중 ${step}단계`} />
          <div className="mt-4 grid grid-cols-4 gap-2">
            {steps.map((item) => {
              const Icon = item.icon;
              const active = item.number === step;
              const complete = item.number < step;
              return (
                <button
                  key={item.number}
                  type="button"
                  disabled={item.number > step}
                  onClick={() => item.number < step && setStep(item.number)}
                  className={`flex min-w-0 items-center gap-2 rounded-xl px-2 py-2 text-left transition-colors sm:px-3 ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : complete
                        ? 'bg-secondary text-secondary-foreground hover:bg-secondary/75'
                        : 'text-muted-foreground'
                  }`}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/15">
                    {complete ? (
                      <Check className="size-4" />
                    ) : (
                      <Icon className="size-4" />
                    )}
                  </span>
                  <span className="hidden truncate text-sm font-semibold md:block">
                    {item.title}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {!!errors.length && <ErrorList errors={errors} />}

        {step === 1 && (
          <ProductsStep
            products={products}
            onAdd={() => replaceProducts((items) => [...items, blankProduct()])}
            onUpdate={updateProduct}
            onRemove={removeProduct}
          />
        )}

        {step === 2 && (
          <CandidatesStep
            products={products}
            ocrStates={ocrStates}
            onUpdateCandidate={updateCandidate}
            onAddCandidate={(productId) =>
              replaceProducts((items) =>
                items.map((product) =>
                  product.id === productId
                    ? {
                        ...product,
                        candidates: [...product.candidates, blankCandidate()],
                      }
                    : product,
                ),
              )
            }
            onRemoveCandidate={removeCandidate}
            onAnalyze={analyzeImage}
            onDrop={handleDrop}
            onClearPreview={clearPreview}
          />
        )}

        {step === 3 && (
          <ConditionsStep
            products={products}
            coupons={coupons}
            usedMalls={usedMalls}
            onUpdateCandidate={updateCandidate}
            onCouponsChange={(next) => {
              setCoupons(next);
              setResult(undefined);
              setErrors([]);
            }}
          />
        )}

        {step === 4 && result && (
          <ResultsStep
            result={result}
            onEdit={(nextStep) => setStep(nextStep)}
          />
        )}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Button
            variant="outline"
            className="h-11 min-w-24"
            disabled={step === 1}
            onClick={() => {
              setErrors([]);
              setStep((current) => Math.max(1, current - 1));
            }}
          >
            <ArrowLeft /> 이전
          </Button>
          {step < 4 ? (
            <Button
              className="h-11 min-w-32"
              disabled={ocrIsRunning}
              onClick={goNext}
            >
              {step === 3 ? '결과 보기' : '다음'} <ArrowRight />
            </Button>
          ) : (
            <Button className="h-11 min-w-32" onClick={() => setStep(1)}>
              <Pencil /> 다시 수정
            </Button>
          )}
        </div>
      </nav>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>입력 내용을 모두 지울까요?</AlertDialogTitle>
            <AlertDialogDescription>
              이 브라우저에 임시 저장된 상품, 가격, 배송비와 쿠폰이 모두
              삭제됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={resetAll}>
              모두 지우기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function ErrorList({ errors }: { errors: string[] }) {
  return (
    <div
      id="step-errors"
      className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900"
    >
      <p className="flex items-center gap-2 font-bold">
        <AlertCircle className="size-5" /> 입력 내용을 확인해 주세요
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-6 text-sm">
        {errors.map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </div>
  );
}

function ProductsStep({
  products,
  onAdd,
  onUpdate,
  onRemove,
}: {
  products: ProductGroup[];
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<ProductGroup>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <Card className="overflow-hidden border-0 shadow-sm ring-1 ring-border">
      <CardHeader className="border-b bg-card">
        <CardTitle className="text-xl">무엇을 몇 개 살 건가요?</CardTitle>
        <CardDescription className="mt-1 text-sm">
          상품 이름과 필요한 수량만 입력하면 됩니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 p-4 sm:p-6">
        {products.length === 0 && (
          <div className="rounded-2xl border border-dashed bg-muted/25 p-8 text-center">
            <p className="font-semibold">비교할 상품이 없습니다.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              아래 버튼으로 상품을 추가해 주세요.
            </p>
          </div>
        )}
        {products.map((product, index) => (
          <div
            key={product.id}
            className="grid gap-4 rounded-2xl border bg-background p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:items-end"
          >
            <span className="grid size-9 place-items-center self-center rounded-xl bg-secondary text-sm font-bold text-secondary-foreground">
              {index + 1}
            </span>
            <div className="grid gap-2 text-sm font-semibold">
              <span>상품 이름</span>
              <Input
                aria-label={`${product.name || `상품 ${index + 1}`} 이름`}
                value={product.name}
                className="h-11 text-base"
                placeholder="예: 무선 마우스"
                onChange={(event) =>
                  onUpdate(product.id, { name: event.target.value })
                }
              />
            </div>
            <div className="grid gap-2 text-sm font-semibold">
              <span>구매 수량</span>
              <QuantityField
                label={`${product.name || `상품 ${index + 1}`} 구매 수량`}
                value={product.quantity}
                onChange={(quantity) => onUpdate(product.id, { quantity })}
              />
            </div>
            <Button
              variant="ghost"
              className="size-11 self-end px-0 text-muted-foreground"
              aria-label={`${product.name || `상품 ${index + 1}`} 삭제`}
              onClick={() => onRemove(product.id)}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          className="h-11 w-full border-dashed"
          onClick={onAdd}
        >
          <Plus /> 상품 추가
        </Button>
      </CardContent>
    </Card>
  );
}

function CandidatesStep({
  products,
  ocrStates,
  onUpdateCandidate,
  onAddCandidate,
  onRemoveCandidate,
  onAnalyze,
  onDrop,
  onClearPreview,
}: {
  products: ProductGroup[];
  ocrStates: Record<string, OcrState>;
  onUpdateCandidate: (
    productId: string,
    candidateId: string,
    patch: Partial<ProductCandidate>,
  ) => void;
  onAddCandidate: (productId: string) => void;
  onRemoveCandidate: (productId: string, candidateId: string) => void;
  onAnalyze: (
    productId: string,
    candidateId: string,
    file?: File,
  ) => Promise<void>;
  onDrop: (
    event: DragEvent<HTMLElement>,
    productId: string,
    candidateId: string,
  ) => void;
  onClearPreview: (candidateId: string) => void;
}) {
  const [pasteTargetId, setPasteTargetId] = useState<string>();
  const availableTargets = products.flatMap((product) =>
    product.candidates.map((candidate) => ({
      productId: product.id,
      candidateId: candidate.id,
    })),
  );
  const pasteTarget =
    availableTargets.find((target) => target.candidateId === pasteTargetId) ??
    availableTargets[0];

  useEffect(() => {
    function pasteClipboardImage(event: globalThis.ClipboardEvent) {
      const clipboardData = event.clipboardData;
      if (!clipboardData) return;
      const item = [...clipboardData.items].find((entry) =>
        entry.type.startsWith('image/'),
      );
      const file = item?.getAsFile();
      if (!file || !pasteTarget) return;
      event.preventDefault();
      void onAnalyze(pasteTarget.productId, pasteTarget.candidateId, file);
    }

    document.addEventListener('paste', pasteClipboardImage);
    return () => document.removeEventListener('paste', pasteClipboardImage);
  }, [onAnalyze, pasteTarget]);

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-700" />
        <div>
          <p className="font-bold">캡처는 이 기기에서만 분석됩니다.</p>
          <p className="mt-1 text-sm leading-6 text-emerald-800">
            원하는 구매 후보를 한 번 누른 뒤, 캡처를 복사해서 Ctrl+V로 붙여넣을
            수 있습니다. 이미지는 서버로 전송되지 않습니다.
          </p>
        </div>
      </div>

      {products.map((product) => (
        <Card
          key={product.id}
          className="overflow-hidden border-0 shadow-sm ring-1 ring-border"
        >
          <CardHeader className="border-b bg-card">
            <CardTitle className="text-lg">{product.name}</CardTitle>
            <CardDescription>
              {product.quantity}개를 살 때 비교할 쇼핑몰과 실제 구매가격을
              등록하세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-4 sm:p-6">
            {product.candidates.map((candidate, index) => {
              const state = ocrStates[candidate.id];
              const inputId = `capture-${candidate.id}`;
              return (
                <article
                  key={candidate.id}
                  className="rounded-2xl border bg-background p-4"
                  onFocusCapture={() => setPasteTargetId(candidate.id)}
                  onPointerDownCapture={() => setPasteTargetId(candidate.id)}
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <p className="font-bold">구매 후보 {index + 1}</p>
                    <Button
                      variant="ghost"
                      className="text-muted-foreground"
                      onClick={() =>
                        onRemoveCandidate(product.id, candidate.id)
                      }
                    >
                      <Trash2 /> 삭제
                    </Button>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-[0.72fr_1.28fr]">
                    <div className="space-y-4">
                      <label className="grid gap-2 text-sm font-semibold">
                        쇼핑몰
                        <select
                          className="native-field h-11 text-base"
                          value={candidate.mallId}
                          onChange={(event) => {
                            const mall = mallPresets.find(
                              (item) => item.id === event.target.value,
                            );
                            onUpdateCandidate(product.id, candidate.id, {
                              mallId: mall?.id ?? '',
                              mallName: mall?.name ?? '',
                            });
                          }}
                        >
                          <option value="">쇼핑몰을 선택하세요</option>
                          {mallPresets.map((mall) => (
                            <option key={mall.id} value={mall.id}>
                              {mall.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="grid gap-2 text-sm font-semibold">
                        <span>실제 구매가격</span>
                        <MoneyField
                          ariaLabel={`${product.name} ${candidate.mallName || `후보 ${index + 1}`} 실제 구매가격`}
                          value={candidate.price}
                          placeholder="예: 29,900"
                          onChange={(price) =>
                            onUpdateCandidate(product.id, candidate.id, {
                              price,
                            })
                          }
                        />
                        <span className="text-sm font-normal leading-5 text-muted-foreground">
                          상품 자체 할인은 반영하고, 아래에서 따로 적용할 쿠폰만
                          제외한 개당 가격을 입력하세요.
                        </span>
                      </div>
                    </div>

                    <fieldset
                      aria-label="상품 캡처 붙여넣기 또는 업로드"
                      className={`rounded-2xl border border-dashed bg-muted/25 p-3 outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 ${
                        pasteTarget?.candidateId === candidate.id
                          ? 'border-primary/70 ring-2 ring-primary/10'
                          : ''
                      }`}
                    >
                      {state?.previewUrl ? (
                        <div className="grid gap-3 sm:grid-cols-[116px_minmax(0,1fr)]">
                          <Image
                            src={state.previewUrl}
                            alt="분석할 상품 캡처 미리보기"
                            width={112}
                            height={112}
                            unoptimized
                            className="h-28 w-full rounded-xl border bg-white object-contain sm:w-28"
                          />
                          <div className="min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">
                                  {state.fileName}
                                </p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                  {state.status === 'loading'
                                    ? `가격을 찾는 중 ${state.progress}%`
                                    : state.status === 'done'
                                      ? `${state.prices.length}개의 가격 후보를 찾았습니다.`
                                      : state.error}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="xs"
                                className="size-7 px-0"
                                aria-label="캡처 제거"
                                disabled={state.status === 'loading'}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onClearPreview(candidate.id);
                                }}
                              >
                                <Trash2 />
                              </Button>
                            </div>
                            {state.status === 'loading' && (
                              <Progress
                                className="mt-3"
                                value={state.progress}
                                aria-label="가격 인식 진행률"
                              />
                            )}
                            {state.prices.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {state.prices.map((price) => (
                                  <button
                                    type="button"
                                    key={price}
                                    className={`rounded-full border px-3 py-1.5 text-sm font-semibold tabular-nums transition-colors ${
                                      candidate.price === price
                                        ? 'border-primary bg-primary text-primary-foreground'
                                        : 'bg-card hover:border-primary hover:text-primary'
                                    }`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      onUpdateCandidate(
                                        product.id,
                                        candidate.id,
                                        { price },
                                      );
                                    }}
                                  >
                                    {money(price)}
                                  </button>
                                ))}
                              </div>
                            )}
                            {state.status !== 'loading' && (
                              <button
                                type="button"
                                className="mt-3 inline-block cursor-pointer text-sm font-semibold text-primary hover:underline"
                                onClick={() =>
                                  document.getElementById(inputId)?.click()
                                }
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={(event) =>
                                  onDrop(event, product.id, candidate.id)
                                }
                              >
                                다른 캡처로 다시 분석
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl text-center"
                          onClick={() =>
                            document.getElementById(inputId)?.click()
                          }
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) =>
                            onDrop(event, product.id, candidate.id)
                          }
                        >
                          <span className="grid size-11 place-items-center rounded-xl bg-secondary text-secondary-foreground">
                            <Upload className="size-5" />
                          </span>
                          <span className="mt-3 font-bold">
                            상품 캡처에서 가격 찾기
                          </span>
                          <span className="mt-1 text-sm text-muted-foreground">
                            클릭해서 파일 선택 · Ctrl+V로 붙여넣기 · 끌어놓기
                          </span>
                        </button>
                      )}
                      <input
                        id={inputId}
                        className="sr-only"
                        type="file"
                        aria-label="상품 캡처 선택"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(event) => {
                          void onAnalyze(
                            product.id,
                            candidate.id,
                            event.target.files?.[0],
                          );
                          event.target.value = '';
                        }}
                      />
                    </fieldset>
                  </div>
                </article>
              );
            })}
            <Button
              variant="outline"
              className="h-11 w-full border-dashed"
              onClick={() => onAddCandidate(product.id)}
            >
              <Plus /> {product.name} 구매 후보 추가
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ConditionsStep({
  products,
  coupons,
  usedMalls,
  onUpdateCandidate,
  onCouponsChange,
}: {
  products: ProductGroup[];
  coupons: Coupon[];
  usedMalls: { id: string; name: string }[];
  onUpdateCandidate: (
    productId: string,
    candidateId: string,
    patch: Partial<ProductCandidate>,
  ) => void;
  onCouponsChange: (coupons: Coupon[]) => void;
}) {
  function updateCoupon(id: string, patch: Partial<Coupon>) {
    onCouponsChange(
      coupons.map((coupon) =>
        coupon.id === id ? { ...coupon, ...patch } : coupon,
      ),
    );
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-0 shadow-sm ring-1 ring-border">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Truck className="text-primary" /> 후보별 배송비
          </CardTitle>
          <CardDescription className="mt-1 text-sm">
            같은 쇼핑몰 상품은 묶어 배송비를 한 번만 계산합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-6">
          {products.flatMap((product) =>
            product.candidates.map((candidate) => (
              <ShippingCard
                key={candidate.id}
                product={product}
                candidate={candidate}
                onChange={(patch) =>
                  onUpdateCandidate(product.id, candidate.id, patch)
                }
              />
            )),
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-0 shadow-sm ring-1 ring-border">
        <CardHeader className="border-b sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <TicketPercent className="text-primary" /> 쿠폰{' '}
              <span className="text-sm font-normal text-muted-foreground">
                선택
              </span>
            </CardTitle>
            <CardDescription className="mt-1 text-sm">
              보유한 쿠폰이 있을 때만 추가하세요.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            disabled={!usedMalls.length}
            onClick={() =>
              onCouponsChange([
                ...coupons,
                {
                  id: uid(),
                  mallId: usedMalls[0]?.id ?? '',
                  type: 'fixed',
                  enabled: true,
                },
              ])
            }
          >
            <Plus /> 쿠폰 추가
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 p-4 sm:p-6">
          {coupons.length === 0 && (
            <div className="rounded-2xl border border-dashed bg-muted/25 p-6 text-center">
              <p className="font-semibold">등록한 쿠폰이 없습니다.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                쿠폰 없이도 바로 비교할 수 있습니다.
              </p>
            </div>
          )}
          {coupons.map((coupon) => (
            <div
              key={coupon.id}
              className="grid gap-4 rounded-2xl border bg-background p-4 md:grid-cols-2"
            >
              <label className="grid gap-2 text-sm font-semibold">
                적용 쇼핑몰
                <select
                  className="native-field h-11 text-base"
                  value={coupon.mallId}
                  onChange={(event) =>
                    updateCoupon(coupon.id, { mallId: event.target.value })
                  }
                >
                  {usedMalls.map((mall) => (
                    <option key={mall.id} value={mall.id}>
                      {mall.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                할인 방식
                <select
                  className="native-field h-11 text-base"
                  value={coupon.type}
                  onChange={(event) =>
                    updateCoupon(coupon.id, {
                      type: event.target.value as Coupon['type'],
                    })
                  }
                >
                  <option value="fixed">금액 할인</option>
                  <option value="percentage">퍼센트 할인</option>
                </select>
              </label>
              <div className="grid gap-2 text-sm font-semibold">
                <span>{coupon.type === 'fixed' ? '할인 금액' : '할인율'}</span>
                {coupon.type === 'fixed' ? (
                  <MoneyField
                    ariaLabel="쿠폰 할인 금액"
                    value={coupon.value}
                    placeholder="예: 5,000"
                    onChange={(value) => updateCoupon(coupon.id, { value })}
                  />
                ) : (
                  <div className="relative">
                    <Input
                      type="text"
                      inputMode="numeric"
                      className="h-11 pr-9 text-base"
                      value={coupon.value ?? ''}
                      placeholder="예: 10"
                      onChange={(event) =>
                        updateCoupon(coupon.id, {
                          value: parseDigits(event.target.value),
                        })
                      }
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      %
                    </span>
                  </div>
                )}
              </div>
              <div className="grid gap-2 text-sm font-semibold">
                <span>
                  최소 주문금액{' '}
                  <span className="font-normal text-muted-foreground">
                    선택
                  </span>
                </span>
                <MoneyField
                  ariaLabel="쿠폰 최소 주문금액"
                  value={coupon.minOrderAmount}
                  placeholder="조건이 없으면 비워두기"
                  onChange={(minOrderAmount) =>
                    updateCoupon(coupon.id, { minOrderAmount })
                  }
                />
              </div>
              {coupon.type === 'percentage' && (
                <div className="grid gap-2 text-sm font-semibold">
                  <span>
                    최대 할인금액{' '}
                    <span className="font-normal text-muted-foreground">
                      선택
                    </span>
                  </span>
                  <MoneyField
                    ariaLabel="쿠폰 최대 할인금액"
                    value={coupon.maxDiscount}
                    placeholder="제한이 없으면 비워두기"
                    onChange={(maxDiscount) =>
                      updateCoupon(coupon.id, { maxDiscount })
                    }
                  />
                </div>
              )}
              <div className="flex items-center justify-between gap-3 md:col-span-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={coupon.enabled}
                    onChange={(event) =>
                      updateCoupon(coupon.id, { enabled: event.target.checked })
                    }
                  />
                  이번 비교에 적용
                </label>
                <Button
                  variant="ghost"
                  onClick={() =>
                    onCouponsChange(
                      coupons.filter((item) => item.id !== coupon.id),
                    )
                  }
                >
                  <Trash2 /> 삭제
                </Button>
              </div>
            </div>
          ))}
          {coupons.length > 1 && (
            <p className="text-sm leading-6 text-muted-foreground">
              같은 쇼핑몰의 쿠폰은 중복하지 않고, 조건을 만족하는 쿠폰 중
              할인액이 가장 큰 한 장을 적용합니다.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ShippingCard({
  product,
  candidate,
  onChange,
}: {
  product: ProductGroup;
  candidate: ProductCandidate;
  onChange: (patch: Partial<ProductCandidate>) => void;
}) {
  const rule = candidate.shipping;
  function updateShipping(patch: Partial<ProductCandidate['shipping']>) {
    onChange({ shipping: { ...rule, ...patch } });
  }

  return (
    <article className="rounded-2xl border bg-background p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-bold">{product.name}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {candidate.mallName} · {money(candidate.price ?? 0)} ×{' '}
            {product.quantity}개
          </p>
        </div>
        {rule.type === 'unknown' && (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-sm font-semibold text-amber-800">
            확인 필요
          </span>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold">
          배송비 조건
          <select
            className="native-field h-11 text-base"
            value={rule.type}
            onChange={(event) => {
              const type = event.target.value as ShippingRuleType;
              onChange({
                shipping:
                  type === 'free'
                    ? { type: 'free' }
                    : type === 'unknown'
                      ? { type: 'unknown' }
                      : { type, fee: rule.fee },
              });
            }}
          >
            <option value="unknown">아직 확인하지 않음</option>
            <option value="free">항상 무료배송</option>
            <option value="paid">배송비 있음</option>
            <option value="free-over-amount">일정 금액 이상 무료</option>
            <option value="free-over-quantity">일정 수량 이상 무료</option>
          </select>
        </label>
        {rule.type !== 'unknown' && rule.type !== 'free' && (
          <div className="grid gap-2 text-sm font-semibold">
            <span>조건 미달 시 배송비</span>
            <MoneyField
              ariaLabel={`${product.name} ${candidate.mallName} 배송비`}
              value={rule.fee}
              placeholder="예: 3,000"
              onChange={(fee) => updateShipping({ fee })}
            />
          </div>
        )}
        {rule.type === 'free-over-amount' && (
          <div className="grid gap-2 text-sm font-semibold">
            <span>무료배송이 되는 주문금액</span>
            <MoneyField
              ariaLabel={`${product.name} ${candidate.mallName} 무료배송 주문금액`}
              value={rule.thresholdAmount}
              placeholder="예: 50,000"
              onChange={(thresholdAmount) =>
                updateShipping({ thresholdAmount })
              }
            />
          </div>
        )}
        {rule.type === 'free-over-quantity' && (
          <div className="grid gap-2 text-sm font-semibold">
            <span>무료배송이 되는 수량</span>
            <QuantityField
              label={`${product.name} ${candidate.mallName} 무료배송 기준 수량`}
              value={rule.thresholdQuantity ?? 1}
              onChange={(thresholdQuantity) =>
                updateShipping({ thresholdQuantity })
              }
            />
          </div>
        )}
      </div>
    </article>
  );
}

function ResultsStep({
  result,
  onEdit,
}: {
  result: OptimizationResult;
  onEdit: (step: number) => void;
}) {
  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl bg-primary p-6 text-primary-foreground shadow-[0_24px_80px_-38px_var(--shadow-color)] sm:p-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold text-primary-foreground/70">
              가장 저렴한 예상 결제액
            </p>
            <p className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">
              {money(result.total)}
            </p>
          </div>
          <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm">
            <p className="text-primary-foreground/70">추천 주문</p>
            <p className="mt-1 font-bold">
              {result.orders.length}개 쇼핑몰에서 나눠 구매
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {result.orders.map((order) => (
          <Card
            key={order.mallId}
            className="overflow-hidden border-0 shadow-sm ring-1 ring-border"
          >
            <CardHeader className="border-b bg-card">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-lg">{order.mallName}</CardTitle>
                <p className="text-xl font-black text-primary">
                  {money(order.total)}
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="space-y-3">
                {order.items.map((item) => (
                  <div
                    key={item.productId}
                    className="rounded-xl bg-muted/40 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold">{item.productName}</p>
                      <p className="shrink-0 font-bold">
                        {money(item.itemSubtotal)}
                      </p>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      개당 {money(item.candidate.price ?? 0)} × {item.quantity}
                      개
                    </p>
                  </div>
                ))}
              </div>
              <dl className="space-y-2 border-t pt-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">상품 합계</dt>
                  <dd>{money(order.subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">배송비</dt>
                  <dd>
                    {order.shippingFee ? money(order.shippingFee) : '무료'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">
                    쿠폰 할인
                    {order.couponLabel ? ` · ${order.couponLabel}` : ''}
                  </dt>
                  <dd
                    className={
                      order.couponDiscount
                        ? 'font-semibold text-emerald-700'
                        : ''
                    }
                  >
                    {order.couponDiscount
                      ? `-${money(order.couponDiscount)}`
                      : '없음'}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button variant="outline" className="h-11" onClick={() => onEdit(2)}>
          <ImageIcon /> 가격 다시 확인
        </Button>
        <Button variant="outline" className="h-11" onClick={() => onEdit(3)}>
          <Truck /> 배송·쿠폰 수정
        </Button>
      </div>
    </div>
  );
}
