import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dailySales, deliverySlip, lowStock, matchesOrder } from './seller-tools';
import { strings } from './strings';
import type { SellerOffer, SellerOrder } from './types';

const order = (overrides: Partial<SellerOrder> = {}): SellerOrder =>
  ({
    id: 'a1b2c3d4-0000-4000-8000-000000000001',
    status: 'DELIVERED',
    createdAt: '2026-11-10T09:00:00.000Z',
    paymentState: 'CASH_ON_DELIVERY',
    deliveryContact: {
      recipientName: 'Karim B.',
      phone: '0555 66 77 88',
      addressLine: '4 rue des Jasmins',
      city: 'Blida',
    },
    snapshot: {
      items: [{ title: { fr: 'Friteuse', ar: 'مقلاة' }, quantity: 2 }],
      totalMinor: 1300000,
    },
    shipment: { carrier: 'Yalidine', trackingReference: 'YAL-1' },
    history: [{ status: 'DELIVERED', occurredAt: '2026-11-12T10:00:00.000Z' }],
    ...overrides,
  }) as unknown as SellerOrder;

describe('seller tools', () => {
  it('flags approved offers running out, emptiest first', () => {
    const offer = (id: string, availableQuantity: number, status = 'APPROVED') =>
      ({ id, availableQuantity, status }) as unknown as SellerOffer;
    assert.deepEqual(
      lowStock([offer('a', 3), offer('b', 0), offer('c', 9), offer('d', 1, 'PENDING_REVIEW')]).map(
        (o) => o.id,
      ),
      ['b', 'a'],
    );
  });
  it('finds orders by name, phone digits or order number', () => {
    assert.ok(matchesOrder(order(), 'karim'));
    assert.ok(matchesOrder(order(), '0555667'));
    assert.ok(matchesOrder(order(), 'A1B2'));
    assert.ok(matchesOrder(order(), ''));
    assert.ok(!matchesOrder(order(), 'amina'));
    assert.ok(!matchesOrder(order(), '05'));
  });
  it('sums confirmed deliveries per day over the last two weeks', () => {
    const days = dailySales(
      [order(), order({ status: 'SHIPPED' } as Partial<SellerOrder>)],
      new Date(2026, 10, 13, 15),
    );
    assert.equal(days.length, 14);
    assert.equal(days.at(-1)?.day, '2026-11-13');
    assert.equal(
      days.reduce((sum, d) => sum + d.totalMinor, 0),
      1300000,
    );
  });
  it('writes a delivery slip with what the courier must collect', () => {
    const slip = deliverySlip(order(), strings.fr.slip, 'fr');
    assert.match(slip, /Karim B\./u);
    assert.match(slip, /0555 66 77 88/u);
    assert.match(slip, /Friteuse × 2/u);
    assert.match(slip, /À encaisser à la livraison : 13\s?000\sDA/u);
    assert.match(slip, /Yalidine YAL-1/u);
    const test = deliverySlip(
      order({ paymentState: 'NOT_APPLICABLE_TEST' }),
      strings.fr.slip,
      'fr',
    );
    assert.match(test, /rien à encaisser/u);
  });
});
