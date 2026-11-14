import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { seedSyntheticCatalog, SYNTHETIC_CATALOG_IDS as ids } from '@atlas/catalog';
import { runMigrations, seedSyntheticData } from '@atlas/database';
import { Client, Pool } from 'pg';
import type { DeliveryDestination } from '@atlas/contracts';
import { contact } from '../delivery-contact.fixture.js';
function required<T>(value: T | undefined): T {
  assert.ok(value);
  return value;
}
import {
  DeliveryWriteError,
  OrderWriteError,
  PostgresCartRepository,
  PostgresOrderRepository,
  PostgresDeliveryRepository,
  seedSyntheticDeliveryDestinations,
  seedReferenceDeliveryDestinations,
  REFERENCE_DELIVERY_DATASET_ID,
} from '../../src/index.js';

describe('reference wilayas and commune shipping', () => {
  const source = process.env['DATABASE_URL'];
  if (!source) throw new Error('DATABASE_URL is required');
  const name = `atlas_reference_it_${randomBytes(8).toString('hex')}`;
  const adminUrl = new URL(source);
  adminUrl.pathname = '/postgres';
  const url = new URL(source);
  url.pathname = `/${name}`;
  const admin = new Client({ connectionString: adminUrl.toString() });
  let pool: Pool;
  let created = false;
  let rates: PostgresDeliveryRepository;
  let commune: DeliveryDestination;
  let sibling: DeliveryDestination;
  const seller = ids.sellers[0] as string;
  const other = ids.sellers[1] as string;
  const actor = ids.adminUserId;
  const input = { enabled: true, shippingFeeMinor: 45050, codCollector: 'SELLER_COURIER' as const };
  before(async () => {
    await admin.connect();
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    await runMigrations(url.toString());
    await seedSyntheticData(url.toString(), 'test');
    pool = new Pool({ connectionString: url.toString(), max: 8 });
    await seedSyntheticCatalog(pool, 'test');
    await seedSyntheticDeliveryDestinations(pool, 'test');
    await seedReferenceDeliveryDestinations(pool, 'test');
    rates = new PostgresDeliveryRepository(pool, 'test');
    const all = await rates.listDestinations();
    commune = required(all.find((d) => d.code === 'ons2021-0319'));
    sibling = required(all.find((d) => d.code === 'ons2021-0310'));
    assert.ok(commune?.wilaya);
    assert.ok(sibling);
  });
  after(async () => {
    await pool?.end();
    if (created) await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  });
  const unavailable = (e: unknown) =>
    e instanceof DeliveryWriteError && e.code === 'DELIVERY_UNAVAILABLE';
  async function set(
    target: string,
    patch: Partial<typeof input & { useWilayaRate: boolean }> = {},
    sellerId = seller,
  ) {
    const previous = (await rates.listSellerRates(sellerId)).find(
      (r) => r.destination.id === target,
    );
    return rates.setSellerRate(
      sellerId,
      actor,
      target,
      { ...input, ...patch, expectedVersion: previous?.version ?? 0 },
      randomUUID(),
    );
  }
  async function customer(split = false) {
    const customerId = randomUUID();
    await pool.query(
      "INSERT INTO identity.users(id,status,preferred_locale) VALUES($1,'ACTIVE','fr')",
      [customerId],
    );
    const carts = new PostgresCartRepository(pool);
    const orders = new PostgresOrderRepository(pool, {
      environment: 'test',
      customerId,
      quoteLifetimeSeconds: 600,
      acceptanceWindowSeconds: 3600,
    });
    await carts.setItem(customerId, ids.offers[0] as string, { quantity: 2, expectedVersion: 0 });
    if (split)
      await carts.setItem(customerId, ids.offers[1] as string, { quantity: 1, expectedVersion: 1 });
    return { customerId, orders, carts, version: split ? 2 : 1 };
  }
  it('imports all 69 wilayas and 1541 bilingual communes without inventing rates or enabling commerce', async () => {
    const before = await rates.listDestinations();
    assert.equal(before.filter((d) => d.dataClass === 'reference').length, 1541);
    assert.equal(before.filter((d) => d.dataClass === 'synthetic').length, 2);
    assert.equal(new Set(before.filter((d) => d.wilaya).map((d) => d.wilaya?.id)).size, 69);
    assert.deepEqual(
      [...new Set(before.flatMap((d) => (d.wilaya ? [d.wilaya.code] : [])))],
      Array.from({ length: 69 }, (_, index) => String(index + 1).padStart(2, '0')),
    );
    assert.equal(commune.wilaya?.code, '59');
    assert.equal(sibling.wilaya?.id, commune.wilaya?.id);
    assert.ok(before.every((d) => d.name.fr.length && d.name.ar.length));
    assert.deepEqual(await rates.listSellerRates(seller), []);
    await seedReferenceDeliveryDestinations(pool, 'test');
    assert.deepEqual(await rates.listDestinations(), before);
    assert.equal(
      (
        await pool.query('SELECT is_active FROM locations.dataset_versions WHERE id=$1', [
          REFERENCE_DELIVERY_DATASET_ID,
        ])
      ).rows[0]?.is_active,
      false,
    );
    await assert.rejects(seedReferenceDeliveryDestinations(pool, 'production'));
    const c = await customer();
    await assert.rejects(
      c.orders.createQuote(c.customerId, c.version, commune.id, contact),
      unavailable,
    );
  });
  it('charges each seller once, applies commune overrides/exclusions and restores inheritance', async () => {
    const base = await set(required(commune.wilaya).id);
    await set(required(commune.wilaya).id, { shippingFeeMinor: 70000 }, other);
    const c = await customer(true);
    const original = await c.orders.createQuote(c.customerId, c.version, commune.id, contact);
    assert.equal(original.sellers.find((s) => s.sellerId === seller)?.shippingFeeMinor, 45050);
    assert.equal(original.sellers.find((s) => s.sellerId === other)?.shippingFeeMinor, 70000);
    assert.equal(original.sellers.find((s) => s.sellerId === seller)?.deliveryRate?.id, base.id);
    assert.equal(original.destination?.id, commune.id);
    await set(commune.id, { shippingFeeMinor: 88025 });
    await assert.rejects(
      c.orders.place(c.customerId, original.id, randomUUID()),
      (e: unknown) => e instanceof OrderWriteError && e.code === 'QUOTE_CHANGED',
    );
    const own = await c.orders.createQuote(c.customerId, c.version, commune.id, contact);
    assert.equal(own.sellers.find((s) => s.sellerId === seller)?.shippingFeeMinor, 88025);
    await set(commune.id, { enabled: false });
    await assert.rejects(
      c.orders.createQuote(c.customerId, c.version, commune.id, contact),
      unavailable,
    );
    assert.equal(
      (await c.orders.createQuote(c.customerId, c.version, sibling.id, contact)).sellers.find(
        (s) => s.sellerId === seller,
      )?.shippingFeeMinor,
      45050,
    );
    await set(commune.id, { useWilayaRate: true, enabled: false, shippingFeeMinor: 0 });
    const inherited = await c.orders.createQuote(c.customerId, c.version, commune.id, contact);
    assert.equal(inherited.sellers.find((s) => s.sellerId === seller)?.deliveryRate?.id, base.id);
    const changedBase = await set(required(commune.wilaya).id, { shippingFeeMinor: 56000 });
    await assert.rejects(
      c.orders.place(c.customerId, inherited.id, randomUUID()),
      (e: unknown) => e instanceof OrderWriteError && e.code === 'QUOTE_CHANGED',
    );
    const finalQuote = await c.orders.createQuote(c.customerId, c.version, commune.id, contact);
    const placed = await c.orders.place(c.customerId, finalQuote.id, randomUUID());
    await set(required(commune.wilaya).id, { enabled: false });
    assert.deepEqual(await c.orders.place(c.customerId, finalQuote.id, randomUUID()), placed);
    assert.equal(
      placed.quote.sellers.find((s) => s.sellerId === seller)?.deliveryRate?.version,
      changedBase.version,
    );
    const next = await customer();
    await assert.rejects(
      next.orders.createQuote(next.customerId, 1, commune.id, contact),
      unavailable,
    );
    assert.equal((await rates.listSellerRates(other))[0]?.enabled, true);
    for (const so of placed.sellerOrders)
      await c.orders.closeSellerOrder({
        sellerOrderId: so.id,
        actor: { type: 'customer', id: c.customerId },
        expectedVersion: 1,
        reason: 'CUSTOMER_CANCELLED',
        correlationId: randomUUID(),
      });
  });
  it('fences concurrent wilaya writes, keeps audit evidence and rejects invalid targets', async () => {
    const current = required(
      (await rates.listSellerRates(seller)).find((r) => r.destination.kind === 'WILAYA'),
    );
    const results = await Promise.allSettled(
      [60000, 65000].map((shippingFeeMinor) =>
        rates.setSellerRate(
          seller,
          actor,
          required(commune.wilaya).id,
          { ...input, shippingFeeMinor, expectedVersion: current.version },
          randomUUID(),
        ),
      ),
    );
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
    const saved = required((await rates.listSellerRates(seller)).find((r) => r.id === current.id));
    assert.equal(
      (
        await pool.query(
          'SELECT count(*)::int AS n FROM platform.audit_events WHERE entity_id=$1',
          [saved.id],
        )
      ).rows[0]?.n,
      saved.version,
    );
    await assert.rejects(
      pool.query('DELETE FROM sellers.wilaya_delivery_rates WHERE id=$1', [saved.id]),
    );
    await assert.rejects(set(required(commune.wilaya).id, { useWilayaRate: true }));
    await assert.rejects(set(randomUUID()), unavailable);
    const c = await customer();
    await assert.rejects(
      c.orders.createQuote(c.customerId, 1, required(commune.wilaya).id, contact),
      unavailable,
    );
  });
  it('excludes inactive communes and rejects tampered reference identity without overwriting it', async () => {
    await pool.query('UPDATE locations.communes SET is_active=false WHERE id=$1', [commune.id]);
    assert.equal(
      (await rates.listDestinations()).some((d) => d.id === commune.id),
      false,
    );
    const c = await customer();
    await assert.rejects(c.orders.createQuote(c.customerId, 1, commune.id, contact), unavailable);
    await pool.query("UPDATE locations.communes SET name_fr='TAMPERED' WHERE id=$1", [commune.id]);
    await assert.rejects(seedReferenceDeliveryDestinations(pool, 'test'), /identity conflict/);
    assert.equal(
      (await pool.query('SELECT name_fr FROM locations.communes WHERE id=$1', [commune.id])).rows[0]
        ?.name_fr,
      'TAMPERED',
    );
  });
});
