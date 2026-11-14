import assert from 'node:assert/strict';
import test from 'node:test';
import { orderProgress } from './order-progress.ts';
test('order summary derives from every seller without confusing reported delivery with receipt', () => {
  assert.equal(orderProgress([{ status: 'DELIVERY_REPORTED' }]), 'DELIVERY_REPORTED');
  assert.equal(
    orderProgress([{ status: 'DELIVERED' }, { status: 'DELIVERY_REPORTED' }]),
    'PARTIALLY_CLOSED',
  );
  assert.equal(orderProgress([{ status: 'DELIVERED' }, { status: 'DELIVERED' }]), 'DELIVERED');
  assert.equal(
    orderProgress([{ status: 'REJECTED' }, { status: 'AWAITING_SELLER' }]),
    'PARTIALLY_CLOSED',
  );
  assert.equal(orderProgress([{ status: 'REJECTED' }, { status: 'CANCELLED' }]), 'CLOSED');
  assert.equal(orderProgress([{ status: 'AWAITING_SELLER' }]), 'AWAITING_SELLER');
  assert.equal(orderProgress([{ status: 'SHIPPED' }, { status: 'PREPARING' }]), 'IN_PROGRESS');
  assert.throws(() => orderProgress([]));
});
