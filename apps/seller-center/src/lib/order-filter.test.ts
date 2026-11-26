import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SellerOrder } from '@atlas/contracts';
import { filterOrders, parseTab } from './order-filter.ts';

const order = (
  id: string,
  status: SellerOrder['status'],
  name: string,
  phone: string,
  title: string,
) =>
  ({
    id,
    status,
    deliveryContact: { recipientName: name, phone, addressLine: '1 rue', city: 'Alger' },
    snapshot: { items: [{ title: { fr: title, ar: 'منتج' } }] },
  }) as unknown as SellerOrder;

const orders = [
  order(
    'aaaa1111-0000-4000-8000-000000000001',
    'AWAITING_SELLER',
    'Amina Benali',
    '+213555000111',
    'Friteuse sans huile',
  ),
  order(
    'bbbb2222-0000-4000-8000-000000000002',
    'SHIPPED',
    'Yacine Haddad',
    '0661 22 33 44',
    'Théière en cuivre',
  ),
  order(
    'cccc3333-0000-4000-8000-000000000003',
    'DELIVERED',
    'Nadia K.',
    '0770998877',
    'Friteuse XL',
  ),
];

test('tabs group statuses and count every tab', () => {
  const result = filterOrders(orders, 'todo', '');
  assert.deepEqual(
    result.items.map((o) => o.id.slice(0, 4)),
    ['aaaa'],
  );
  assert.deepEqual(result.counts, { todo: 1, shipped: 1, closed: 1, all: 3 });
  assert.equal(parseTab('nope'), 'todo');
  assert.equal(parseTab('closed'), 'closed');
});

test('search covers name (accents ignored), phone digits, order number and product', () => {
  assert.deepEqual(
    filterOrders(orders, 'all', 'theiere').items.map((o) => o.id.slice(0, 4)),
    ['bbbb'],
  );
  assert.deepEqual(
    filterOrders(orders, 'all', '661 22').items.map((o) => o.id.slice(0, 4)),
    ['bbbb'],
  );
  assert.deepEqual(
    filterOrders(orders, 'all', 'cccc33').items.map((o) => o.id.slice(0, 4)),
    ['cccc'],
  );
  assert.deepEqual(filterOrders(orders, 'all', 'friteuse').counts, {
    todo: 1,
    shipped: 0,
    closed: 1,
    all: 2,
  });
  assert.deepEqual(filterOrders(orders, 'all', 'amina').items.length, 1);
});
