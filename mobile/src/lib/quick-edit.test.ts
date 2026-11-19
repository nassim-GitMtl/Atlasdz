import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dinarsText, parseDinars, parseStock } from './quick-edit';

test('prices are dinars with optional centimes', () => {
  assert.equal(parseDinars('1500'), 150000);
  assert.equal(parseDinars('1 500,5'), 150050);
  for (const bad of ['', '0', '-1', '12.345', 'abc', '20000001'])
    assert.equal(parseDinars(bad), undefined, bad);
  assert.equal(dinarsText(150000), '1500');
  assert.equal(dinarsText(150050), '1500.50');
});

test('stock is a whole number up to one million', () => {
  assert.equal(parseStock(' 7 '), 7);
  for (const bad of ['', '-1', '1.5', '1000001']) assert.equal(parseStock(bad), undefined, bad);
});
