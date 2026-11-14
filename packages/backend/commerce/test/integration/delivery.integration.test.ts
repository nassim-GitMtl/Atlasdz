import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { seedSyntheticCatalog, SYNTHETIC_CATALOG_IDS } from '@atlas/catalog';
import { runMigrations, seedSyntheticData } from '@atlas/database';
import { Client, Pool } from 'pg';
import { contact } from '../delivery-contact.fixture.js';
import {
  DeliveryWriteError,
  OrderWriteError,
  PostgresCartRepository,
  PostgresOrderRepository,
  PostgresDeliveryRepository,
  seedSyntheticDeliveryDestinations,
  SYNTHETIC_DELIVERY_IDS,
} from '../../src/index.js';

describe('seller destination shipping configuration', () => {
  const source = process.env['DATABASE_URL'];
  if (!source) throw new Error('DATABASE_URL is required');
  const name = `atlas_delivery_it_${randomBytes(8).toString('hex')}`;
  const adminUrl = new URL(source);
  adminUrl.pathname = '/postgres';
  const url = new URL(source);
  url.pathname = `/${name}`;
  const admin = new Client({ connectionString: adminUrl.toString() });
  let pool: Pool;
  let repo: PostgresDeliveryRepository;
  let created = false;
  const seller = SYNTHETIC_CATALOG_IDS.sellers[0] as string;
  const other = SYNTHETIC_CATALOG_IDS.sellers[1] as string;
  const destination = SYNTHETIC_DELIVERY_IDS.destinations[0];
  const actor = randomUUID();
  const initial = {
    expectedVersion: 0,
    enabled: true,
    shippingFeeMinor: 45050,
    codCollector: 'SELLER_COURIER' as const,
  };
  before(async () => {
    await admin.connect();
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    await runMigrations(url.toString());
    await seedSyntheticData(url.toString(), 'test');
    pool = new Pool({ connectionString: url.toString(), max: 6 });
    await seedSyntheticCatalog(pool, 'test');
    await seedSyntheticDeliveryDestinations(pool, 'test');
    repo = new PostgresDeliveryRepository(pool, 'test');
  });
  after(async () => {
    await pool?.end();
    if (created) await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  });
  const fails = (code: string) => (error: unknown) =>
    error instanceof DeliveryWriteError && error.code === code;
  it('labels fictional destinations without activating an authoritative geographic dataset', async () => {
    const locations = await repo.listDestinations();
    assert.equal(locations.length, 2);
    assert.equal(locations[0]?.dataClass, 'synthetic');
    assert.deepEqual(await repo.listSellerRates(seller), []);
    assert.equal(
      (
        await pool.query('SELECT is_active FROM locations.dataset_versions WHERE id=$1', [
          SYNTHETIC_DELIVERY_IDS.dataset,
        ])
      ).rows[0]?.is_active,
      false,
    );
    await assert.rejects(
      new PostgresDeliveryRepository(pool).listDestinations(),
      fails('CHECKOUT_DISABLED'),
    );
    await assert.rejects(
      seedSyntheticDeliveryDestinations(pool, 'production'),
      fails('CHECKOUT_DISABLED'),
    );
  });
  it('persists exact centimes and COD collector with isolated reads and idempotent retries', async () => {
    const first = await repo.setSellerRate(seller, actor, destination, initial, randomUUID());
    assert.equal(first.version, 1);
    assert.equal(first.shippingFeeMinor, 45050);
    assert.equal(first.codCollector, 'SELLER_COURIER');
    assert.deepEqual(
      await repo.setSellerRate(seller, actor, destination, initial, randomUUID()),
      first,
    );
    assert.deepEqual(await repo.listSellerRates(other), []);
    const evidence = await pool.query(
      `SELECT
      (SELECT count(*)::int FROM platform.audit_events WHERE entity_id=$1) AS audits,
      (SELECT count(*)::int FROM platform.outbox_events WHERE aggregate_id=$1) AS events`,
      [first.id],
    );
    assert.deepEqual(evidence.rows[0], { audits: 1, events: 1 });
    await seedSyntheticDeliveryDestinations(pool, 'test');
    assert.deepEqual(await repo.listSellerRates(seller), [first]);
  });
  it('serializes conflicting updates and protects rate identity and version history', async () => {
    const result = await Promise.allSettled(
      [45000, 55000].map((shippingFeeMinor) =>
        repo.setSellerRate(
          seller,
          actor,
          destination,
          { ...initial, expectedVersion: 1, shippingFeeMinor },
          randomUUID(),
        ),
      ),
    );
    assert.equal(result.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(
      result.filter((r) => r.status === 'rejected' && fails('DELIVERY_CONFLICT')(r.reason)).length,
      1,
    );
    const saved = (await repo.listSellerRates(seller))[0];
    assert.ok(saved);
    assert.equal(saved.version, 2);
    await assert.rejects(
      pool.query('UPDATE sellers.delivery_rates SET seller_id=$2 WHERE id=$1', [saved.id, other]),
    );
    await assert.rejects(pool.query('DELETE FROM sellers.delivery_rates WHERE id=$1', [saved.id]));
  });
  it('rejects unsupported destinations, suspended sellers, invalid money and ownership overrides', async () => {
    await assert.rejects(
      repo.setSellerRate(seller, actor, randomUUID(), initial, randomUUID()),
      fails('DELIVERY_UNAVAILABLE'),
    );
    await assert.rejects(
      repo.setSellerRate(
        seller,
        actor,
        destination,
        { ...initial, shippingFeeMinor: 0.5 },
        randomUUID(),
      ),
    );
    await assert.rejects(
      repo.setSellerRate(
        seller,
        actor,
        destination,
        { ...initial, sellerId: other } as typeof initial,
        randomUUID(),
      ),
    );
    await pool.query("UPDATE sellers.sellers SET status='SUSPENDED' WHERE id=$1", [other]);
    try {
      await assert.rejects(
        repo.setSellerRate(other, actor, destination, initial, randomUUID()),
        fails('FORBIDDEN'),
      );
    } finally {
      await pool.query("UPDATE sellers.sellers SET status='APPROVED' WHERE id=$1", [other]);
    }
  });
  it('rolls rate and audit changes back if outbox evidence fails, then disables coverage durably', async () => {
    const old = (await repo.listSellerRates(seller))[0];
    assert.ok(old);
    const eventId = randomUUID();
    await pool.query(
      `INSERT INTO platform.outbox_events(event_id,event_type,event_version,producer,aggregate_type,
      aggregate_id,aggregate_version,payload,actor_type,actor_id,correlation_id)
      VALUES($1,'seller_delivery.changed',1,'atlas-test','seller_delivery_rate',$2,$3,'{}','seller_user',$4,$5)`,
      [eventId, old.id, old.version + 1, actor, randomUUID()],
    );
    await assert.rejects(
      repo.setSellerRate(
        seller,
        actor,
        destination,
        { ...initial, expectedVersion: old.version, enabled: false },
        randomUUID(),
      ),
    );
    assert.deepEqual((await repo.listSellerRates(seller))[0], old);
    assert.equal(
      (
        await pool.query(
          'SELECT count(*)::int AS n FROM platform.audit_events WHERE entity_id=$1',
          [old.id],
        )
      ).rows[0]?.n,
      old.version,
    );
    // Remove only the deliberately injected conflicting transport fixture, not domain history.
    await pool.query('DELETE FROM platform.outbox_events WHERE event_id=$1', [eventId]);
    const disabled = await repo.setSellerRate(
      seller,
      actor,
      destination,
      { ...initial, expectedVersion: old.version, enabled: false },
      randomUUID(),
    );
    assert.equal(disabled.enabled, false);
    assert.equal(disabled.version, old.version + 1);
  });
  async function customerFixture() {
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
    return { customerId, carts, orders };
  }
  async function configure(sellerId: string, shippingFeeMinor: number, isEnabled = true) {
    const current = (await repo.listSellerRates(sellerId)).find(
      (r) => r.destination.id === destination,
    );
    return repo.setSellerRate(
      sellerId,
      actor,
      destination,
      { ...initial, expectedVersion: current?.version ?? 0, shippingFeeMinor, enabled: isEnabled },
      randomUUID(),
    );
  }
  it('charges once per seller and destination for multiple products and quantities', async () => {
    await configure(seller, 45050);
    await configure(other, 70000);
    const { customerId, carts, orders } = await customerFixture();
    await carts.setItem(customerId, SYNTHETIC_CATALOG_IDS.offers[0] as string, {
      quantity: 2,
      expectedVersion: 0,
    });
    await carts.setItem(customerId, SYNTHETIC_CATALOG_IDS.offers[5] as string, {
      quantity: 1,
      expectedVersion: 1,
    });
    await carts.setItem(customerId, SYNTHETIC_CATALOG_IDS.offers[1] as string, {
      quantity: 1,
      expectedVersion: 2,
    });
    const quote = await orders.createQuote(customerId, 3, destination, contact);
    assert.equal(quote.policy.shippingRule, 'ONE_SELLER_CHARGE_PER_ORDER_DESTINATION');
    assert.equal(quote.sellers.length, 2);
    const own = quote.sellers.find((s) => s.sellerId === seller);
    assert.ok(own);
    assert.equal(own.items.length, 2);
    assert.equal(own.shippingFeeMinor, 45050);
    assert.equal(own.deliveryRate?.codCollector, 'SELLER_COURIER');
    assert.equal(quote.sellers.find((s) => s.sellerId === other)?.shippingFeeMinor, 70000);
    assert.equal(
      quote.totalMinor,
      quote.sellers.reduce((sum, s) => sum + s.itemsSubtotalMinor, 0) + 115050,
    );
    assert.equal(quote.paymentArrangement, 'TEST_ONLY_NO_PAYMENT');
    await assert.rejects(
      orders.createQuote(customerId, 3, SYNTHETIC_DELIVERY_IDS.destinations[1], contact),
      fails('DELIVERY_UNAVAILABLE'),
    );
  });
  it('rejects stale shipping quotes and preserves placed snapshots when rates change later', async () => {
    const { customerId, carts, orders } = await customerFixture();
    await carts.setItem(customerId, SYNTHETIC_CATALOG_IDS.offers[0] as string, {
      quantity: 1,
      expectedVersion: 0,
    });
    const original = await orders.createQuote(customerId, 1, destination, contact);
    await configure(seller, 66025);
    await assert.rejects(
      orders.place(customerId, original.id, randomUUID()),
      (e: unknown) => e instanceof OrderWriteError && e.code === 'QUOTE_CHANGED',
    );
    assert.equal((await carts.getCart(customerId)).items.length, 1);
    const revised = await orders.createQuote(customerId, 1, destination, contact);
    const placed = await orders.place(customerId, revised.id, randomUUID());
    await configure(seller, 99900, false);
    assert.deepEqual(await orders.place(customerId, revised.id, randomUUID()), placed);
    assert.equal(placed.sellerOrders[0]?.snapshot.shippingFeeMinor, 66025);
    assert.equal(placed.paymentState, 'NOT_APPLICABLE_TEST');
    assert.deepEqual(await orders.getQuote(customerId, original.id), original);
  });
  it('blocks revoked coverage atomically without consuming stock, cart, or quote', async () => {
    await configure(seller, 45050);
    const { customerId, carts, orders } = await customerFixture();
    const offerId = SYNTHETIC_CATALOG_IDS.offers[0] as string;
    await carts.setItem(customerId, offerId, { quantity: 1, expectedVersion: 0 });
    const quote = await orders.createQuote(customerId, 1, destination, contact);
    const stock = (
      await pool.query('SELECT available_quantity FROM offers.offers WHERE id=$1', [offerId])
    ).rows[0]?.available_quantity;
    await configure(seller, 45050, false);
    await assert.rejects(
      orders.place(customerId, quote.id, randomUUID()),
      fails('DELIVERY_UNAVAILABLE'),
    );
    assert.equal(
      (await pool.query('SELECT available_quantity FROM offers.offers WHERE id=$1', [offerId]))
        .rows[0]?.available_quantity,
      stock,
    );
    assert.equal((await carts.getCart(customerId)).items.length, 1);
    assert.deepEqual(await orders.listCustomerOrders(customerId), []);
  });
  it('refuses tampered synthetic provenance without overwriting it', async () => {
    await pool.query(
      "UPDATE locations.dataset_versions SET source_reference='urn:untrusted' WHERE id=$1",
      [SYNTHETIC_DELIVERY_IDS.dataset],
    );
    assert.deepEqual(await repo.listDestinations(), []);
    await assert.rejects(seedSyntheticDeliveryDestinations(pool, 'test'), /provenance conflict/);
    assert.equal(
      (
        await pool.query('SELECT source_reference FROM locations.dataset_versions WHERE id=$1', [
          SYNTHETIC_DELIVERY_IDS.dataset,
        ])
      ).rows[0]?.source_reference,
      'urn:untrusted',
    );
  });
});
