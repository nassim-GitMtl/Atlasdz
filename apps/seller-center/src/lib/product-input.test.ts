import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { parseProductValues, parseProductReview } from './product-input.ts';
test('validates both languages, identifiers and text bounds without losing entered text', () => {
  const values = {
    requestId: randomUUID(),
    revisionOfSubmissionId: '',
    categoryId: randomUUID(),
    titleFr: ' Test ',
    titleAr: ' تجربة ',
    descriptionFr: 'Description',
    descriptionAr: 'وصف',
  };
  const parsed = parseProductValues(values);
  assert.ok(parsed.success);
  assert.equal(parsed.data.title.fr, 'Test');
  assert.equal(values.titleFr, ' Test ');
  for (const patch of [
    { titleFr: ' ' },
    { titleAr: '' },
    { titleFr: 'x'.repeat(501) },
    { descriptionAr: 'x'.repeat(8001) },
    { requestId: 'bad' },
  ])
    assert.equal(parseProductValues({ ...values, ...patch }).success, false);
});
test('accepts an immutable revision source, rejects malformed identifiers and preserves form values', () => {
  const values = {
    requestId: randomUUID(),
    revisionOfSubmissionId: randomUUID(),
    categoryId: randomUUID(),
    titleFr: 'Corrigé',
    titleAr: 'تصحيح',
    descriptionFr: 'Description',
    descriptionAr: 'وصف',
  };
  const parsed = parseProductValues(values);
  assert.ok(parsed.success);
  assert.equal(parsed.data.revisionOfSubmissionId, values.revisionOfSubmissionId);
  assert.equal(parseProductValues({ ...values, revisionOfSubmissionId: 'bad' }).success, false);
  assert.equal(parseProductValues({ ...values, revisionOfSubmissionId: '' }).success, true);
});
test('requires a bounded rejection reason and an exact integer version', () => {
  const form = new FormData();
  form.set('decision', 'REJECTED');
  form.set('version', '1');
  assert.equal(parseProductReview(form).success, false);
  form.set('reason', 'Informations à corriger');
  assert.equal(parseProductReview(form).success, true);
  form.set('version', '1e2');
  assert.equal(parseProductReview(form).success, false);
  form.set('version', '1');
  form.set('decision', 'APPROVED');
  assert.equal(parseProductReview(form).success, true);
});
