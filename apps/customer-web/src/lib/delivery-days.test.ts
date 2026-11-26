import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deliveryDaysLabel } from './delivery-days.ts';

test('delivery days read naturally in each language', () => {
  assert.equal(deliveryDaysLabel({ min: 2, max: 4 }, 'fr'), '2 à 4 jours');
  assert.equal(deliveryDaysLabel({ min: 1, max: 1 }, 'fr'), '1 jour');
  assert.equal(deliveryDaysLabel({ min: 3, max: 3 }, 'en'), '3 days');
  assert.equal(deliveryDaysLabel({ min: 2, max: 4 }, 'ar'), 'من 2 إلى 4 أيام');
  assert.equal(deliveryDaysLabel({ min: 2, max: 2 }, 'ar'), 'يومان');
});
