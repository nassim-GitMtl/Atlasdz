import assert from 'node:assert/strict';
import { test } from 'node:test';
import { preorderDates, preorderSpan, preorderText } from './preorder.ts';

const terms = { minDays: 20, maxDays: 35, origin: 'Turquie' };

test('pre-order terms read as one line, with the origin when given', () => {
  assert.equal(
    preorderText(terms, 'fr'),
    'Livraison estimée sous 20 à 35 jours · Provenance : Turquie',
  );
  assert.equal(
    preorderText({ ...terms, origin: null }, 'fr'),
    'Livraison estimée sous 20 à 35 jours',
  );
});

test('the buyer accepts the widest window of the cart', () => {
  assert.equal(preorderSpan([{ preorder: null }, {}]), null);
  assert.deepEqual(
    preorderSpan([{ preorder: terms }, { preorder: { minDays: 10, maxDays: 50, origin: null } }]),
    { min: 10, max: 50 },
  );
});

test('estimated dates count from the order date', () => {
  assert.match(
    preorderDates('2026-11-01T10:00:00.000Z', terms, 'fr'),
    /21 nov\. 2026.*6 déc\. 2026/u,
  );
});
