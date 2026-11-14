import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { CreateCheckoutQuoteInputSchema, DeliveryContactSchema } from '../src/index.js';

const contact = {
  recipientName: 'TEST Recipient',
  phone: '+00000000000',
  addressLine: '10 TEST Street',
  city: 'TEST City',
};
describe('delivery contact contracts', () => {
  it('accepts bounded French/Arabic text and trims outer spaces without claiming address verification', () => {
    assert.deepEqual(
      DeliveryContactSchema.parse({ ...contact, recipientName: ' TEST Recipient ' }),
      contact,
    );
    assert.equal(
      DeliveryContactSchema.safeParse({
        ...contact,
        recipientName: 'مستلم تجريبي',
        addressLine: '10 شارع تجريبي',
        city: 'مدينة تجريبية',
      }).success,
      true,
    );
  });
  it('rejects missing, oversized, hidden control characters and injected properties', () => {
    for (const invalid of [
      undefined,
      null,
      { ...contact, recipientName: '' },
      { ...contact, recipientName: 'x'.repeat(121) },
      { ...contact, addressLine: 'x'.repeat(241) },
      { ...contact, city: 'x'.repeat(121) },
      { ...contact, addressLine: 'TEST\nStreet' },
      { ...contact, city: 'TEST\u202eCity' },
      { ...contact, phone: '+123' },
      { ...contact, phone: '+1234567890123456' },
      { ...contact, phone: '00 0000000' },
      { ...contact, phone: 'javascript:call()' },
      { ...contact, sellerId: randomUUID() },
    ])
      assert.equal(DeliveryContactSchema.safeParse(invalid).success, false);
  });
  it('requires contact on new quote requests and rejects ownership overrides', () => {
    const input = { expectedCartVersion: 1, destinationId: randomUUID() };
    assert.equal(CreateCheckoutQuoteInputSchema.safeParse(input).success, false);
    assert.equal(
      CreateCheckoutQuoteInputSchema.safeParse({ ...input, deliveryContact: contact }).success,
      true,
    );
    assert.equal(
      CreateCheckoutQuoteInputSchema.safeParse({
        ...input,
        deliveryContact: contact,
        customerId: randomUUID(),
      }).success,
      false,
    );
  });
});
