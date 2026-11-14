import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  canReviewOrder,
  cleanComment,
  formatRating,
  reviewChanged,
  sharePercent,
  starIcons,
} from './reviews';

describe('reviews', () => {
  it('draws ratings to the nearest half star', () => {
    assert.deepEqual(starIcons(4.5), ['star', 'star', 'star', 'star', 'star-half']);
    assert.deepEqual(starIcons(3.2), ['star', 'star', 'star', 'star-outline', 'star-outline']);
    assert.deepEqual(starIcons(0), Array(5).fill('star-outline'));
    assert.deepEqual(starIcons(9), Array(5).fill('star'));
  });
  it('shows averages with one decimal and bars in percent', () => {
    assert.equal(formatRating(4, 'fr'), '4,0');
    assert.equal(formatRating(4.25, 'fr'), '4,3');
    assert.equal(sharePercent(1, 3), 33);
    assert.equal(sharePercent(2, 0), 0);
  });
  it('rates items only once delivered', () => {
    assert.ok(canReviewOrder('DELIVERED') && canReviewOrder('DELIVERY_REPORTED'));
    assert.ok(!canReviewOrder('SHIPPED') && !canReviewOrder('CANCELLED'));
  });
  it('sends a trimmed comment or none, and saves only real changes', () => {
    assert.equal(cleanComment('  Très bien  '), 'Très bien');
    assert.equal(cleanComment('   '), null);
    assert.ok(reviewChanged(null, 5, ''));
    assert.ok(!reviewChanged({ rating: 5, body: 'Top' }, 5, ' Top '));
    assert.ok(reviewChanged({ rating: 5, body: 'Top' }, 4, 'Top'));
    assert.ok(reviewChanged({ rating: 5, body: null }, 5, 'Bien'));
  });
});
