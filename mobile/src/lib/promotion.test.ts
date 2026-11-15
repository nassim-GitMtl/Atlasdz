import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { algiersDay, discountPercent, parsePromotion } from './promotion';

describe('seller promotions', () => {
  it('covers whole Algiers days below the regular price', () => {
    assert.deepEqual(parsePromotion(true, '9900', '2026-12-01', '2026-12-15', 1_200_000), {
      priceMinor: 990_000,
      startsAt: '2026-12-01T00:00:00+01:00',
      endsAt: '2026-12-15T23:59:59+01:00',
    });
    assert.equal(parsePromotion(false, '', '', '', 1_200_000), null);
  });
  it('rejects a price not below the regular one, bad dates and windows over 90 days', () => {
    assert.equal(parsePromotion(true, '12000', '2026-12-01', '2026-12-15', 1_200_000), 'invalid');
    assert.equal(parsePromotion(true, '9900', '2026-12-15', '2026-12-01', 1_200_000), 'invalid');
    assert.equal(parsePromotion(true, '9900', '2026-12-01', '2027-06-01', 1_200_000), 'invalid');
    assert.equal(parsePromotion(true, '9900', '01/12/2026', '2026-12-15', 1_200_000), 'invalid');
  });
  it('formats days and discounts', () => {
    assert.equal(algiersDay('2026-11-30T23:30:00.000Z'), '2026-12-01');
    assert.equal(discountPercent(990_000, 1_200_000), 18);
  });
});
