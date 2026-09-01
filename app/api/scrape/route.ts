import { parseProductHtml } from '@/lib/scraper';

const MAX_URL_LENGTH = 2048;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8_000;

function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) || parts[0] >= 224;
}

function validateExternalUrl(raw: string): URL {
  if (!raw || raw.length > MAX_URL_LENGTH) throw new Error('URL이 비어 있거나 너무 깁니다.');
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('올바른 상품 URL을 입력해 주세요.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('http 또는 https URL만 사용할 수 있습니다.');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
      host.endsWith('.internal') || host === 'metadata.google.internal' || isPrivateIpv4(host) ||
      host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe8') || host === '0:0:0:0:0:0:0:1') {
    throw new Error('내부 네트워크 주소에는 접근할 수 없습니다.');
  }
  if (url.username || url.password) throw new Error('로그인 정보가 포함된 URL은 사용할 수 없습니다.');
  return url;
}

async function fetchLimited(startUrl: URL): Promise<{ html: string; finalUrl: URL }> {
  let current = startUrl;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: 'manual', signal: controller.signal,
        headers: { 'User-Agent': 'CartwiseProductPreview/1.0 (+manual-user-request)', Accept: 'text/html,application/xhtml+xml' },
      });
    } finally { clearTimeout(timer); }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || redirects === MAX_REDIRECTS) throw new Error('리디렉션 횟수가 너무 많습니다.');
      current = validateExternalUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new Error(`상품 페이지 요청이 실패했습니다. (${response.status})`);
    if (!(response.headers.get('content-type') ?? '').toLowerCase().includes('text/html')) throw new Error('HTML 상품 페이지만 분석할 수 있습니다.');
    const declaredSize = Number(response.headers.get('content-length') ?? 0);
    if (declaredSize > MAX_RESPONSE_BYTES) throw new Error('페이지 크기가 분석 제한을 초과했습니다.');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('페이지 내용을 읽을 수 없습니다.');
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error('페이지 크기가 분석 제한을 초과했습니다.'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { html: new TextDecoder().decode(bytes), finalUrl: current };
  }
  throw new Error('상품 페이지를 불러오지 못했습니다.');
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { url?: unknown };
    if (typeof body.url !== 'string') return Response.json({ error: '상품 URL을 입력해 주세요.' }, { status: 400 });
    const url = validateExternalUrl(body.url);
    const { html, finalUrl } = await fetchLimited(url);
    const product = parseProductHtml(html, finalUrl.hostname);
    if (!product?.salePrice) return Response.json({ error: '가격 정보를 찾지 못했습니다. 직접 입력해 주세요.' }, { status: 422 });
    return Response.json({ product });
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError' ? '상품 페이지 요청 시간이 초과되었습니다.' : error instanceof Error ? error.message : '상품 정보를 불러오지 못했습니다.';
    return Response.json({ error: message }, { status: 400 });
  }
}
