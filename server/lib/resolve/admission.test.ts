import assert from 'node:assert/strict';
import { it } from 'node:test';
import sharp from 'sharp';
import { RecognitionBudget, RecognitionBudgetError } from './admission';
import { normalizeRecognitionImage } from './vision';

it('bounds total and per-user concurrent recognition and releases idempotently', () => {
  const budget = new RecognitionBudget(2, 10, 100);
  const first = budget.acquire(1);
  assert.throws(() => budget.acquire(1), RecognitionBudgetError);
  const second = budget.acquire(2);
  assert.throws(() => budget.acquire(3), RecognitionBudgetError);
  first();
  first();
  const third = budget.acquire(3);
  assert.throws(() => budget.acquire(4), RecognitionBudgetError);
  second();
  third();
});
it('enforces per-user/global daily budgets and resets at the next UTC day', () => {
  const budget = new RecognitionBudget(2, 1, 2);
  const today = new Date('2026-11-09T23:59:00Z');
  budget.acquire(1, today)();
  assert.throws(() => budget.acquire(1, today), RecognitionBudgetError);
  budget.acquire(2, today)();
  assert.throws(() => budget.acquire(3, today), RecognitionBudgetError);
  budget.acquire(1, new Date('2026-11-10T00:00:00Z'))();
});
it('decodes a bounded image and rejects a compressed pixel bomb or invalid image', async () => {
  const small = await sharp({
    create: { width: 8, height: 8, channels: 3, background: 'red' },
  })
    .png()
    .toBuffer();
  assert.equal(
    (await sharp(await normalizeRecognitionImage(small)).metadata()).width,
    8
  );
  const large = await sharp({
    create: { width: 2500, height: 2000, channels: 3, background: 'red' },
  })
    .png()
    .toBuffer();
  await assert.rejects(normalizeRecognitionImage(large));
  await assert.rejects(
    normalizeRecognitionImage(Buffer.from('not a valid image'))
  );
});
