import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterParams, parsePriceBound } from './price-filter';

test('price bounds are whole dinars within the API range', () => {
  assert.equal(parsePriceBound('1500'), 1500);
  assert.equal(parsePriceBound(' 0 '), 0);
  for (const bad of ['', '-5', '12.5', '1e5', 'abc', '20000001'])
    assert.equal(parsePriceBound(bad), undefined, bad);
});

test('filters become catalogue parameters in centimes', () => {
  assert.deepEqual(filterParams({ inStock: false }), {});
  assert.deepEqual(filterParams({ inStock: true, min: 1000, max: 5000 }), {
    available: 'true',
    minPrice: '100000',
    maxPrice: '500000',
  });
});
