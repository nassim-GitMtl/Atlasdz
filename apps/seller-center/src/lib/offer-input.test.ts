import assert from 'node:assert/strict';
import test from 'node:test';
import { moneyToMinor, parseOfferValues, parseOfferUpdate } from './offer-input.ts';

const values = {
  productId: '018f0c12-8c71-7a4b-9f2a-7f56a3e74519',
  price: '12500,25',
  quantity: '12',
  handlingDays: '2',
  deliveryFee: '500',
};
test('offer edits validate version and mutable fields without product or shipping changes', () => {
  const parsed = parseOfferUpdate(values, '12');
  assert.equal(parsed.success, true);
  if (parsed.success)
    assert.deepEqual(parsed.data, {
      expectedVersion: 12,
      priceMinor: 1250025,
      availableQuantity: 12,
      handlingDays: 2,
    });
  for (const version of ['0', '-1', '1e2', '2147483647', 'bad'])
    assert.equal(parseOfferUpdate(values, version).success, false);
});

test('DZD conversion preserves fractional centimes exactly and accepts French decimal separators', () => {
  assert.equal(moneyToMinor('0.29'), 29);
  assert.equal(moneyToMinor('12500,25'), 1_250_025);
  assert.equal(moneyToMinor('20000000'), 2_000_000_000);
  const result = parseOfferValues(values);
  assert.equal(result.success, true);
  if (result.success)
    assert.deepEqual(result.data, {
      productId: values.productId,
      priceMinor: 1_250_025,
      availableQuantity: 12,
      handlingDays: 2,
      deliveryFeeMinor: 50000,
    });
});

test('ambiguous, negative, exponent and overprecision amounts are rejected instead of silently rounded', () => {
  for (const value of ['', '-1', 'Infinity', '1e3', '12 500', '12,500', '0.001', '20000000.01']) {
    assert.equal(moneyToMinor(value), undefined, value);
  }
});

test('offers reject zero price, invalid product, excessive stock and fractional preparation days', () => {
  for (const invalid of [
    { price: '0' },
    { productId: 'bad' },
    { quantity: '1000001' },
    { quantity: '1e2' },
    { handlingDays: '1.5' },
    { handlingDays: '31' },
    { deliveryFee: '-0.01' },
  ]) {
    assert.equal(parseOfferValues({ ...values, ...invalid }).success, false);
  }
  assert.equal(
    parseOfferValues({ ...values, quantity: '0', deliveryFee: '0', handlingDays: '0' }).success,
    true,
  );
});

test('pre-order terms are sent only when the box is ticked', () => {
  const base = {
    productId: '70000000-0000-4000-8000-000000000001',
    price: '1500',
    quantity: '5',
    handlingDays: '2',
    deliveryFee: '0',
    preorder: '',
    preorderMin: '20',
    preorderMax: '35',
    preorderOrigin: ' Turquie ',
  };
  const inStock = parseOfferValues(base);
  assert.ok(inStock.success);
  assert.equal(inStock.data.preorder, undefined);
  const preorder = parseOfferValues({ ...base, preorder: 'yes' });
  assert.ok(preorder.success);
  assert.deepEqual(preorder.data.preorder, { minDays: 20, maxDays: 35, origin: 'Turquie' });
  assert.equal(parseOfferValues({ ...base, preorder: 'yes', preorderMax: '10' }).success, false);
});
