import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { changedRows, parseDinars, parseStock } from './quick-edit.ts';

test('prices are dinars with optional centimes', () => {
  assert.equal(parseDinars('1500'), 150000);
  assert.equal(parseDinars('1 500,5'), 150050);
  assert.equal(parseDinars('1500.05'), 150005);
  for (const bad of ['', '0', '-1', '12.345', 'abc', '1e3', '20000001'])
    assert.equal(parseDinars(bad), undefined, bad);
});

test('stock is a whole number up to one million', () => {
  assert.equal(parseStock(' 12 '), 12);
  assert.equal(parseStock('0'), 0);
  for (const bad of ['', '-1', '1.5', '1000001']) assert.equal(parseStock(bad), undefined, bad);
});

test('only changed rows are sent; invalid ones are reported', () => {
  const [same, changed, broken] = [randomUUID(), randomUUID(), randomUUID()];
  const form = new FormData();
  for (const [id, price, stock] of [
    [same, '1500', '3'],
    [changed, '1400', '3'],
    [broken, '-2', '3'],
  ] as const) {
    form.append('offer', id);
    form.set(`version-${id}`, '4');
    form.set(`was-price-${id}`, '1500');
    form.set(`was-stock-${id}`, '3');
    form.set(`price-${id}`, price);
    form.set(`stock-${id}`, stock);
  }
  form.append('offer', 'not-a-uuid');
  const result = changedRows(form);
  assert.deepEqual(result.rows, [
    { id: changed, version: 4, priceMinor: 140000, availableQuantity: 3 },
  ]);
  assert.deepEqual(result.invalid, [broken]);
});
