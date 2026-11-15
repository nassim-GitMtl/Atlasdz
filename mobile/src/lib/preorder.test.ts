import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parsePreorder, preorderDates, preorderSpan, preorderText } from './preorder';
import { strings } from './strings';

const t = strings.fr.preorder;
const terms = { minDays: 20, maxDays: 35, origin: 'Turquie' };

describe('pre-orders', () => {
  it('reads the terms as one line', () => {
    assert.equal(
      preorderText(terms, t),
      'Livraison estimée sous 20 à 35 jours · Provenance : Turquie',
    );
    assert.equal(
      preorderText({ ...terms, origin: null }, t),
      'Livraison estimée sous 20 à 35 jours',
    );
  });
  it('asks the buyer to accept the widest window', () => {
    assert.equal(preorderSpan([{}, { preorder: null }]), null);
    assert.deepEqual(
      preorderSpan([{ preorder: terms }, { preorder: { minDays: 5, maxDays: 50, origin: null } }]),
      { min: 5, max: 50 },
    );
  });
  it('counts estimated dates from the order date', () => {
    assert.match(
      preorderDates('2026-11-01T10:00:00.000Z', terms, t, 'fr'),
      /21 nov\. 2026.*6 déc\. 2026/u,
    );
  });
  it('validates the seller form', () => {
    assert.equal(parsePreorder(false, '', '', ''), null);
    assert.deepEqual(parsePreorder(true, '20', '35', ' Chine '), {
      minDays: 20,
      maxDays: 35,
      origin: 'Chine',
    });
    assert.equal(parsePreorder(true, '20', '10', ''), 'invalid');
    assert.equal(parsePreorder(true, '0', '10', ''), 'invalid');
    assert.equal(parsePreorder(true, '10', '200', ''), 'invalid');
  });
});
