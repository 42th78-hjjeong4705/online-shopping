import assert from 'node:assert/strict';
import path from 'node:path';
import { createWorker, OEM, PSM } from 'tesseract.js';
import { extractPriceCandidates } from '../lib/ocr/extractPrices';

const suppliedImage = process.argv[2];
const testImage = suppliedImage
  ? path.resolve(suppliedImage)
  : path.resolve('scripts/fixtures/price-29900.png');

const worker = await createWorker('kor', OEM.LSTM_ONLY, {
  langPath: path.resolve('public/tesseract/lang'),
});

try {
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    tessedit_char_whitelist: '0123456789, 원₩￦Ww\\',
  });
  const response = await worker.recognize(testImage);
  const prices = extractPriceCandidates(response.data.text);
  if (!suppliedImage) {
    assert.ok(
      prices.includes(29900),
      `29,900원을 찾지 못했습니다: ${response.data.text}`,
    );
  }
  console.log(
    JSON.stringify({ recognizedText: response.data.text.trim(), prices }),
  );
} finally {
  await worker.terminate();
}
