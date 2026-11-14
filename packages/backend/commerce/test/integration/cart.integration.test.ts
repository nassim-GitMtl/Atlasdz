import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { seedSyntheticCatalog, SYNTHETIC_CATALOG_IDS } from '@atlas/catalog';
import { runMigrations, seedSyntheticData } from '@atlas/database';
import { Client, Pool } from 'pg';
import { CartWriteError, PostgresCartRepository } from '../../src/index.js';

describe('PostgreSQL authenticated customer carts', () => {
  const source = process.env['DATABASE_URL'];
  if (!source) throw new Error('DATABASE_URL is required');
  const name = `atlas_cart_it_${randomBytes(8).toString('hex')}`;
  const adminUrl = new URL(source);
  adminUrl.pathname = '/postgres';
  const url = new URL(source);
  url.pathname = `/${name}`;
  const admin = new Client({ connectionString: adminUrl.toString() });
  let created = false;
  let pool: Pool;
  let carts: PostgresCartRepository;
  const offerId = SYNTHETIC_CATALOG_IDS.offers[0] as string;
  const customer = async () => {
    const id = randomUUID();
    await pool.query(
      "INSERT INTO identity.users (id, status, preferred_locale) VALUES ($1, 'ACTIVE', 'fr')",
      [id],
    );
    return id;
  };
  const fails = (code: string) => (error: unknown) =>
    error instanceof CartWriteError && error.code === code;
  before(async () => {
    await admin.connect();
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    await runMigrations(url.toString());
    await seedSyntheticData(url.toString(), 'test');
    pool = new Pool({ connectionString: url.toString(), max: 6 });
    await seedSyntheticCatalog(pool, 'test');
    carts = new PostgresCartRepository(pool);
  });
  after(async () => {
    await pool?.end();
    if (created) await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  });

  it('persists exact quantities and live totals without modifying seller stock', async () => {
    const user = await customer();
    assert.deepEqual(await carts.getCart(user), {
      version: 0,
      items: [],
      currency: 'DZD',
      availableSubtotalMinor: 0,
    });
    const saved = await carts.setItem(user, offerId, { quantity: 2, expectedVersion: 0 });
    assert.equal(saved.version, 1);
    assert.equal(saved.items[0]?.quantity, 2);
    assert.equal(saved.availableSubtotalMinor, 2500000);
    assert.deepEqual(await new PostgresCartRepository(pool).getCart(user), saved);
    assert.equal(
      (await pool.query('SELECT available_quantity FROM offers.offers WHERE id=$1', [offerId]))
        .rows[0]?.available_quantity,
      12,
    );
    const updated = await carts.setItem(user, offerId, { quantity: 3, expectedVersion: 1 });
    assert.equal(updated.items.length, 1);
    assert.equal(updated.items[0]?.quantity, 3);
    const removed = await carts.setItem(user, offerId, { quantity: 0, expectedVersion: 2 });
    assert.equal(removed.items.length, 0);
    assert.equal(removed.version, 3);
  });
  it('isolates customer carts even when they contain the same offer', async () => {
    const a = await customer();
    const b = await customer();
    await carts.setItem(a, offerId, { quantity: 2, expectedVersion: 0 });
    await carts.setItem(b, offerId, { quantity: 3, expectedVersion: 0 });
    await carts.setItem(a, offerId, { quantity: 0, expectedVersion: 1 });
    assert.equal((await carts.getCart(b)).items[0]?.quantity, 3);
  });
  it('serializes concurrent edits and refuses stale retries without duplicate rows', async () => {
    const user = await customer();
    const results = await Promise.allSettled(
      [1, 2].map((quantity) => carts.setItem(user, offerId, { quantity, expectedVersion: 0 })),
    );
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const loser = results.find((result) => result.status === 'rejected');
    assert.ok(loser?.status === 'rejected' && fails('CART_CONFLICT')(loser.reason));
    const before = await carts.getCart(user);
    await assert.rejects(
      carts.setItem(user, offerId, { quantity: 4, expectedVersion: 0 }),
      fails('CART_CONFLICT'),
    );
    assert.deepEqual(await carts.getCart(user), before);
  });
  it('refuses unavailable offers and excess quantity without changing the cart version', async () => {
    const user = await customer();
    await assert.rejects(
      carts.setItem(user, randomUUID(), { quantity: 1, expectedVersion: 0 }),
      fails('CART_OFFER_UNAVAILABLE'),
    );
    await assert.rejects(
      carts.setItem(user, offerId, { quantity: 13, expectedVersion: 0 }),
      fails('CART_OFFER_UNAVAILABLE'),
    );
    assert.equal((await carts.getCart(user)).version, 0);
  });
  it('reevaluates publication, price and stock on reads and allows removal of hidden offers', async () => {
    const user = await customer();
    await carts.setItem(user, offerId, { quantity: 2, expectedVersion: 0 });
    try {
      await pool.query(
        'UPDATE offers.offers SET price_minor=425050, available_quantity=1 WHERE id=$1',
        [offerId],
      );
      let cart = await carts.getCart(user);
      assert.equal(cart.items[0]?.state, 'INSUFFICIENT_STOCK');
      assert.equal(cart.availableSubtotalMinor, 0);
      assert.equal(cart.items[0]?.offer?.priceMinor, 425050);
      await pool.query("UPDATE sellers.sellers SET status='SUSPENDED' WHERE id=$1", [
        SYNTHETIC_CATALOG_IDS.sellers[0],
      ]);
      cart = await carts.getCart(user);
      assert.equal(cart.items[0]?.state, 'UNAVAILABLE');
      assert.equal(cart.items[0]?.offer, null);
      assert.equal(cart.items[0]?.product, null);
      assert.equal(
        (await carts.setItem(user, offerId, { quantity: 0, expectedVersion: 1 })).items.length,
        0,
      );
    } finally {
      await pool.query(
        'UPDATE offers.offers SET price_minor=1250000, available_quantity=12 WHERE id=$1',
        [offerId],
      );
      await pool.query("UPDATE sellers.sellers SET status='APPROVED' WHERE id=$1", [
        SYNTHETIC_CATALOG_IDS.sellers[0],
      ]);
    }
  });
  it('rolls back item writes when the cart version update fails', async () => {
    const user = await customer();
    await carts.setItem(user, offerId, { quantity: 1, expectedVersion: 0 });
    const before = await carts.getCart(user);
    await pool.query(`CREATE FUNCTION commerce.reject_cart_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rollback'; END $$;
      CREATE TRIGGER reject_cart_test BEFORE UPDATE ON commerce.carts FOR EACH ROW EXECUTE FUNCTION commerce.reject_cart_test()`);
    try {
      await assert.rejects(carts.setItem(user, offerId, { quantity: 2, expectedVersion: 1 }));
    } finally {
      await pool.query(
        'DROP TRIGGER reject_cart_test ON commerce.carts; DROP FUNCTION commerce.reject_cart_test()',
      );
    }
    assert.deepEqual(await carts.getCart(user), before);
  });
  it('enforces the 50-line bound while permitting updates and removals at the limit', async () => {
    const user = await customer();
    const offers: string[] = [];
    for (let n = 0; n < 51; n++) {
      const seller = randomUUID();
      const offer = randomUUID();
      offers.push(offer);
      await pool.query(
        `INSERT INTO sellers.sellers (id,slug,name,description_fr,description_ar,status,is_synthetic)
        VALUES($1,$2,'Cart limit fixture','Test','تجربة','APPROVED',true)`,
        [seller, `cart-${seller}`],
      );
      await pool.query(
        `INSERT INTO offers.offers (id,seller_id,product_id,variant_id,price_minor,available_quantity,handling_days,delivery_fee_minor,status,approved_at,approved_by,is_synthetic)
        SELECT $1,$2,product_id,variant_id,100,10,1,0,'APPROVED',clock_timestamp(),approved_by,true FROM offers.offers WHERE id=$3`,
        [offer, seller, offerId],
      );
      if (n < 50) await carts.setItem(user, offer, { quantity: 1, expectedVersion: n });
    }
    const firstOffer = offers[0];
    const overflowOffer = offers[50];
    assert.ok(firstOffer && overflowOffer);
    await assert.rejects(
      carts.setItem(user, overflowOffer, { quantity: 1, expectedVersion: 50 }),
      fails('CART_LIMIT_REACHED'),
    );
    assert.equal(
      (await carts.setItem(user, firstOffer, { quantity: 2, expectedVersion: 50 })).items.length,
      50,
    );
    await carts.setItem(user, firstOffer, { quantity: 0, expectedVersion: 51 });
    assert.equal(
      (await carts.setItem(user, overflowOffer, { quantity: 1, expectedVersion: 52 })).items.length,
      50,
    );
  });
});
