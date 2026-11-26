import assert from 'node:assert/strict';
import { test } from 'node:test';
import { legalFromForm } from './legal.ts';

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const valid = {
  legalName: ' Épicerie Atlas SARL ',
  registerKind: 'COMMERCE',
  registerNumber: '16/00-1234567B21',
  taxId: '0002 1600 1234 567',
  address: '12 rue Didouche Mourad, Alger',
  phone: '+213 550 00 00 01',
  contactEmail: 'contact@epicerie.example.dz',
};

test('legal identity is read from the form with spaces in numbers ignored', () => {
  assert.deepEqual(legalFromForm(form(valid)), {
    legalName: 'Épicerie Atlas SARL',
    registerKind: 'COMMERCE',
    registerNumber: '16/00-1234567B21',
    taxId: '000216001234567',
    address: '12 rue Didouche Mourad, Alger',
    phone: '+213550000001',
    email: 'contact@epicerie.example.dz',
  });
});

test('invalid or missing legal fields are refused', () => {
  for (const patch of [
    { taxId: '12345' },
    { registerKind: 'OTHER' },
    { phone: 'abc' },
    { contactEmail: 'not-an-email' },
    { address: '' },
  ])
    assert.equal(legalFromForm(form({ ...valid, ...patch })), null, JSON.stringify(patch));
});
