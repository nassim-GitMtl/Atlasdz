import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import {
  PostgresCatalogRepository,
  seedSyntheticCatalog,
  SYNTHETIC_CATALOG_IDS as ids,
} from '@atlas/catalog';
import { defaultMigrationsDirectory, runMigrations, seedSyntheticData } from '@atlas/database';
import { Client, Pool } from 'pg';
import type { DeliveryContact, ProcessSellerOrderInput, SellerOrder } from '@atlas/contracts';
import { contact } from '../delivery-contact.fixture.js';
import {
  OrderWriteError,
  PostgresCartRepository,
  PostgresOrderRepository,
  PostgresDeliveryRepository,
  seedSyntheticDeliveryDestinations,
  SYNTHETIC_DELIVERY_IDS,
  PostgresOrderNotificationRepository,
  PostgresSupportRepository,
} from '../../src/index.js';

describe('transactional synthetic order routing', () => {
  const source = process.env['DATABASE_URL'];
  if (!source) throw new Error('DATABASE_URL is required');
  const name = `atlas_orders_it_${randomBytes(8).toString('hex')}`;
  const adminUrl = new URL(source);
  adminUrl.pathname = '/postgres';
  const url = new URL(source);
  url.pathname = `/${name}`;
  const admin = new Client({ connectionString: adminUrl.toString() });
  let created = false;
  let pool: Pool;
  let carts: PostgresCartRepository;
  before(async () => {
    await admin.connect();
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    await runMigrations(url.toString());
    await seedSyntheticData(url.toString(), 'test');
    pool = new Pool({ connectionString: url.toString(), max: 10 });
    await seedSyntheticCatalog(pool, 'test');
    await seedSyntheticDeliveryDestinations(pool, 'test');
    const delivery = new PostgresDeliveryRepository(pool, 'test');
    for (const sellerId of ids.sellers)
      await delivery.setSellerRate(
        sellerId,
        ids.adminUserId,
        SYNTHETIC_DELIVERY_IDS.destinations[0],
        { expectedVersion: 0, enabled: true, shippingFeeMinor: 50000, codCollector: 'SELLER' },
        randomUUID(),
      );
    carts = new PostgresCartRepository(pool);
  });
  after(async () => {
    await pool?.end();
    if (created) await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  });
  const offer = ids.offers[0] as string;
  const another = ids.offers[1] as string;
  const destination = SYNTHETIC_DELIVERY_IDS.destinations[0];
  const failure = (code: string) => (error: unknown) =>
    error instanceof OrderWriteError && error.code === code;
  async function fixture(quoteLifetimeSeconds = 600, acceptanceWindowSeconds = 3600) {
    const customerId = randomUUID();
    await pool.query(
      "INSERT INTO identity.users(id,status,preferred_locale) VALUES($1,'ACTIVE','fr')",
      [customerId],
    );
    return {
      customerId,
      repo: new PostgresOrderRepository(pool, {
        environment: 'test',
        customerId,
        quoteLifetimeSeconds,
        acceptanceWindowSeconds,
      }),
    };
  }
  async function stock(id = offer): Promise<number> {
    return (
      (
        await pool.query<{ available_quantity: number }>(
          'SELECT available_quantity FROM offers.offers WHERE id=$1',
          [id],
        )
      ).rows[0]?.available_quantity ?? -1
    );
  }
  async function cancel(repo: PostgresOrderRepository, customerId: string, id: string) {
    return repo.closeSellerOrder({
      sellerOrderId: id,
      actor: { type: 'customer', id: customerId },
      expectedVersion: 1,
      reason: 'CUSTOMER_CANCELLED',
      correlationId: randomUUID(),
    });
  }
  async function placed(acceptanceSeconds = 3600) {
    const setup = await fixture(600, acceptanceSeconds);
    await carts.setItem(setup.customerId, offer, { quantity: 1, expectedVersion: 0 });
    const quote = await setup.repo.createQuote(setup.customerId, 1, destination, contact);
    const order = await setup.repo.place(setup.customerId, quote.id, randomUUID());
    const sellerOrder = order.sellerOrders[0];
    assert.ok(sellerOrder);
    return { ...setup, sellerOrder };
  }
  const shipment = {
    method: 'SELLER_ARRANGED_TEST',
    carrier: 'TEST Carrier',
    trackingReference: 'TEST-001',
  } as const;
  const processOrder = (
    repo: PostgresOrderRepository,
    so: SellerOrder,
    command: ProcessSellerOrderInput,
  ) =>
    repo.processSellerOrder({
      sellerOrderId: so.id,
      sellerId: so.snapshot.sellerId,
      actorId: ids.adminUserId,
      correlationId: randomUUID(),
      command,
    });

  it('isolates notification history and per-user read markers without changing orders or stock', async () => {
    const setup = await placed();
    const foreign = await fixture();
    const notifications = new PostgresOrderNotificationRepository(pool);
    const customer = { type: 'customer', userId: setup.customerId } as const;
    const stranger = { type: 'customer', userId: foreign.customerId } as const;
    const seller = {
      type: 'seller_user',
      userId: ids.adminUserId,
      sellerId: setup.sellerOrder.snapshot.sellerId,
    } as const;
    const first = (await notifications.list(customer)).items[0];
    assert.ok(first);
    assert.equal(first.status, 'AWAITING_SELLER');
    assert.equal(first.readAt, null);
    assert.equal((await notifications.list(stranger)).items.length, 0);
    const input = { sellerOrderId: first.sellerOrderId, version: first.version };
    await assert.rejects(notifications.markRead(stranger, input), /not found/);
    await assert.rejects(
      notifications.markRead(
        { ...seller, sellerId: ids.sellers.find((id) => id !== seller.sellerId) ?? randomUUID() },
        input,
      ),
      /not found/,
    );
    await assert.rejects(
      notifications.list(customer, { cursor: 'not-json' }),
      /invalid|validation/i,
    );
    const stockBefore = await stock();
    const results = await Promise.all([
      notifications.markRead(customer, input),
      notifications.markRead(customer, input),
    ]);
    assert.equal(results[0]?.readAt, results[1]?.readAt);
    assert.equal((await notifications.list(customer)).unreadCount, 0);
    assert.equal(
      (await notifications.list(seller)).items.find(
        (item) => item.sellerOrderId === first.sellerOrderId,
      )?.readAt,
      null,
    );
    assert.equal(await stock(), stockBefore);
    assert.equal(
      (await setup.repo.getCustomerOrder(setup.customerId, first.orderId))?.sellerOrders[0]?.status,
      'AWAITING_SELLER',
    );
    await assert.rejects(
      pool.query(
        'UPDATE commerce.order_notification_reads SET read_at=clock_timestamp() WHERE user_id=$1',
        [setup.customerId],
      ),
      /immutable/,
    );
    await processOrder(setup.repo, setup.sellerOrder, { action: 'ACCEPT', expectedVersion: 1 });
    const updated = await notifications.list(customer);
    assert.equal(updated.items[0]?.status, 'ACCEPTED');
    assert.equal(updated.unreadCount, 1);
    const latest = updated.items[0];
    assert.ok(latest);
    const cursor = Buffer.from(
      JSON.stringify({
        sellerOrderId: latest.sellerOrderId,
        version: latest.version,
        occurredAt: latest.occurredAt,
      }),
    ).toString('base64url');
    const older = await notifications.list(customer, { cursor });
    assert.equal(older.items.length, 1);
    assert.equal(older.items[0]?.status, 'AWAITING_SELLER');
    assert.equal(older.unreadCount, 1);
  });

  it('upgrades a pre-existing rejected order without inventing a reason or losing history', async () => {
    const fixtureOrder = await placed();
    const sourceOrder = await fixtureOrder.repo.getCustomerOrder(
      fixtureOrder.customerId,
      fixtureOrder.sellerOrder.orderId,
    );
    assert.ok(sourceOrder);
    await cancel(fixtureOrder.repo, fixtureOrder.customerId, fixtureOrder.sellerOrder.id);
    const stagedName = `atlas_order_upgrade_${randomBytes(8).toString('hex')}`;
    const stagedUrl = new URL(source as string);
    stagedUrl.pathname = `/${stagedName}`;
    const dir = await mkdtemp(join(tmpdir(), 'atlas-order-upgrade-'));
    let db: Pool | undefined;
    let exists = false;
    try {
      await admin.query(`CREATE DATABASE "${stagedName}"`);
      exists = true;
      const migrations = defaultMigrationsDirectory();
      for (const file of await readdir(migrations))
        if (/^00000[1-9]_|^000010_/.test(file))
          await copyFile(join(migrations, file), join(dir, file));
      await runMigrations(stagedUrl.toString(), dir);
      await seedSyntheticData(stagedUrl.toString(), 'test');
      db = new Pool({ connectionString: stagedUrl.toString() });
      await seedSyntheticCatalog(db, 'test');
      const so = fixtureOrder.sellerOrder;
      // Construct the exact historical v1 shape, not a new v2 quote disguised as legacy data.
      const {
        destination: _destination,
        deliveryContact: _contact,
        ...sourceQuote
      } = sourceOrder.quote;
      assert.ok(_destination);
      assert.ok(_contact);
      const q = {
        ...sourceQuote,
        policy: {
          revision: 'local-order-fixture-v1',
          shippingRule: 'SYNTHETIC_MAX_OFFER_FEE_PER_SELLER',
          acceptanceWindowSeconds: 3600,
        },
        sellers: sourceQuote.sellers.map(({ deliveryRate: _rate, ...snapshot }) => snapshot),
      };
      const { deliveryRate: _rate, ...legacySellerSnapshot } = so.snapshot;
      assert.ok(_rate);
      await db.query(
        "INSERT INTO identity.users(id,status,preferred_locale) VALUES($1,'ACTIVE','fr')",
        [fixtureOrder.customerId],
      );
      await db.query(
        'INSERT INTO commerce.checkout_quotes(id,customer_id,cart_version,snapshot,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6)',
        [q.id, fixtureOrder.customerId, q.cartVersion, q, q.createdAt, q.expiresAt],
      );
      await db.query('INSERT INTO commerce.orders(id,customer_id,quote_id) VALUES($1,$2,$3)', [
        sourceOrder.id,
        fixtureOrder.customerId,
        q.id,
      ]);
      await db.query(
        'INSERT INTO commerce.seller_orders(id,order_id,seller_id,snapshot,created_at,acceptance_deadline) VALUES($1,$2,$3,$4,$5,$6)',
        [
          so.id,
          sourceOrder.id,
          so.snapshot.sellerId,
          legacySellerSnapshot,
          so.createdAt,
          so.acceptanceDeadline,
        ],
      );
      await db.query(
        "UPDATE commerce.seller_orders SET status='REJECTED',row_version=2,closed_at=clock_timestamp() WHERE id=$1",
        [so.id],
      );
      for (const [version, status, actor, reason, action] of [
        [1, 'AWAITING_SELLER', 'customer', 'PLACED', 'seller_order.routed'],
        [2, 'REJECTED', 'seller_user', 'SELLER_REJECTED', 'seller_order.closed'],
      ] as const) {
        await db.query(
          "INSERT INTO platform.audit_events(occurred_at,actor_type,actor_id,scope_snapshot,action,outcome,entity_type,entity_id,entity_version,correlation_id,after_data) VALUES(clock_timestamp(),$1,$2,$3,$4,'SUCCEEDED','seller_order',$5,$6,$7,$8)",
          [
            actor,
            fixtureOrder.customerId,
            { type: 'GLOBAL' },
            action,
            so.id,
            version,
            randomUUID(),
            { status, reason },
          ],
        );
      }
      // Every migration after the staged 000010 baseline applies, in order.
      const later = (await readdir(defaultMigrationsDirectory()))
        .map((file) => file.slice(0, 6))
        .filter((version) => /^[0-9]{6}$/.test(version) && version > '000010')
        .sort();
      assert.deepEqual(await runMigrations(stagedUrl.toString()), later);
      const constraints = await db.query<{ conname: string; definition: string }>(
        "SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='commerce.seller_orders'::regclass AND contype='c'",
      );
      assert.match(
        constraints.rows.find((row) => row.conname === 'seller_orders_check')?.definition ?? '',
        /snapshot.*sellerId/s,
      );
      assert.ok(constraints.rows.some((row) => row.conname === 'seller_orders_check1'));
      assert.ok(!constraints.rows.some((row) => row.conname === 'seller_orders_check2'));
      const migrated = await new PostgresOrderRepository(db).getSellerOrder(
        so.snapshot.sellerId,
        so.id,
      );
      assert.equal(migrated?.rejectionReason, 'LEGACY_TEST_REJECTION');
      assert.equal(migrated?.history.length, 2);
      assert.equal(migrated?.history[1]?.reason, 'SELLER_REJECTED');
      assert.equal(migrated?.deliveryContact, null);
      const retry = await new PostgresOrderRepository(db, {
        environment: 'test',
        customerId: fixtureOrder.customerId,
        quoteLifetimeSeconds: 600,
        acceptanceWindowSeconds: 3600,
      }).place(fixtureOrder.customerId, q.id, randomUUID());
      assert.equal(retry.id, sourceOrder.id);
      assert.equal(retry.quote.deliveryContact, undefined);
      assert.deepEqual(await runMigrations(stagedUrl.toString()), []);
    } finally {
      await db?.end();
      if (exists) await admin.query(`DROP DATABASE "${stagedName}"`);
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('records attributed processing, consumes stock only at dispatch, and requires customer confirmation', async () => {
    const previous = await stock();
    const { repo, customerId, sellerOrder } = await placed();
    assert.equal(sellerOrder.history.length, 1);
    await assert.rejects(
      processOrder(repo, sellerOrder, { action: 'SHIP', expectedVersion: 1, shipment }),
      failure('ORDER_STATE_CONFLICT'),
    );
    let so = await processOrder(repo, sellerOrder, { action: 'ACCEPT', expectedVersion: 1 });
    assert.equal(so.status, 'ACCEPTED');
    assert.equal(
      (await processOrder(repo, sellerOrder, { action: 'ACCEPT', expectedVersion: 1 })).version,
      2,
    );
    await assert.rejects(cancel(repo, customerId, so.id), failure('ORDER_STATE_CONFLICT'));
    so = await processOrder(repo, so, { action: 'PREPARE', expectedVersion: 2 });
    so = await processOrder(repo, so, { action: 'SHIP', expectedVersion: 3, shipment });
    assert.equal(
      (await processOrder(repo, so, { action: 'SHIP', expectedVersion: 3, shipment })).version,
      4,
    );
    await assert.rejects(
      processOrder(repo, so, {
        action: 'SHIP',
        expectedVersion: 3,
        shipment: { ...shipment, trackingReference: 'CHANGED' },
      }),
      failure('ORDER_STATE_CONFLICT'),
    );
    assert.equal(await stock(), previous - 1);
    assert.equal(
      (
        await pool.query(
          'SELECT consumed_at IS NOT NULL AND released_at IS NULL AS consumed FROM commerce.stock_reservations WHERE seller_order_id=$1',
          [so.id],
        )
      ).rows[0]?.consumed,
      true,
    );
    await assert.rejects(
      repo.confirmDelivery({
        sellerOrderId: so.id,
        customerId,
        expectedVersion: 4,
        correlationId: randomUUID(),
      }),
      failure('ORDER_STATE_CONFLICT'),
    );
    so = await processOrder(repo, so, { action: 'REPORT_DELIVERY', expectedVersion: 4 });
    assert.equal(so.status, 'DELIVERY_REPORTED');
    assert.equal(so.history.at(-1)?.attribution, 'SELLER');
    assert.equal(so.paymentState, 'NOT_APPLICABLE_TEST');
    await assert.rejects(
      repo.confirmDelivery({
        sellerOrderId: so.id,
        customerId: randomUUID(),
        expectedVersion: 5,
        correlationId: randomUUID(),
      }),
      failure('ORDER_NOT_FOUND'),
    );
    so = await repo.confirmDelivery({
      sellerOrderId: so.id,
      customerId,
      expectedVersion: 5,
      correlationId: randomUUID(),
    });
    assert.equal(so.status, 'DELIVERED');
    assert.equal(so.history.at(-1)?.attribution, 'CUSTOMER');
    assert.deepEqual(
      so.history.map((h) => h.version),
      [1, 2, 3, 4, 5, 6],
    );
    assert.deepEqual(so.shipment, shipment);
    await assert.rejects(
      pool.query('UPDATE commerce.seller_order_history SET reason=$2 WHERE seller_order_id=$1', [
        so.id,
        'ALTERED',
      ]),
    );
    await assert.rejects(
      pool.query(
        'UPDATE commerce.stock_reservations SET released_at=clock_timestamp() WHERE seller_order_id=$1',
        [so.id],
      ),
    );
  });
  it('prevents foreign, suspended, stale and overdue seller acceptance', async () => {
    const { repo, customerId, sellerOrder } = await placed(1);
    await assert.rejects(
      repo.processSellerOrder({
        sellerOrderId: sellerOrder.id,
        sellerId: ids.sellers[1] as string,
        actorId: ids.adminUserId,
        command: { action: 'ACCEPT', expectedVersion: 1 },
        correlationId: randomUUID(),
      }),
      failure('ORDER_NOT_FOUND'),
    );
    await assert.rejects(
      processOrder(repo, sellerOrder, { action: 'ACCEPT', expectedVersion: 9 }),
      failure('ORDER_STATE_CONFLICT'),
    );
    await pool.query("UPDATE sellers.sellers SET status='SUSPENDED' WHERE id=$1", [
      sellerOrder.snapshot.sellerId,
    ]);
    try {
      await assert.rejects(
        processOrder(repo, sellerOrder, { action: 'ACCEPT', expectedVersion: 1 }),
        failure('ORDER_STATE_CONFLICT'),
      );
    } finally {
      await pool.query("UPDATE sellers.sellers SET status='APPROVED' WHERE id=$1", [
        sellerOrder.snapshot.sellerId,
      ]);
    }
    await delay(1100);
    await assert.rejects(
      processOrder(repo, sellerOrder, { action: 'ACCEPT', expectedVersion: 1 }),
      failure('ORDER_STATE_CONFLICT'),
    );
    await cancel(repo, customerId, sellerOrder.id);
  });
  it('serializes acceptance against cancellation into a single winning transition', async () => {
    const { repo, customerId, sellerOrder } = await placed();
    const result = await Promise.allSettled([
      processOrder(repo, sellerOrder, { action: 'ACCEPT', expectedVersion: 1 }),
      cancel(repo, customerId, sellerOrder.id),
    ]);
    assert.equal(result.filter((r) => r.status === 'fulfilled').length, 1);
    const saved = await repo.getSellerOrder(sellerOrder.snapshot.sellerId, sellerOrder.id);
    assert.equal(saved?.version, 2);
    assert.equal(saved?.history.length, 2);
  });
  it('rolls back processing and history if its outbox record cannot commit', async () => {
    const { repo, customerId, sellerOrder } = await placed();
    await pool.query(
      `CREATE FUNCTION commerce.fail_progress_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='seller_order.progressed' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_progress_test BEFORE INSERT ON platform.outbox_events FOR EACH ROW EXECUTE FUNCTION commerce.fail_progress_test()`,
    );
    try {
      await assert.rejects(
        processOrder(repo, sellerOrder, { action: 'ACCEPT', expectedVersion: 1 }),
      );
    } finally {
      await pool.query(
        'DROP TRIGGER fail_progress_test ON platform.outbox_events; DROP FUNCTION commerce.fail_progress_test()',
      );
    }
    const current = await repo.getSellerOrder(sellerOrder.snapshot.sellerId, sellerOrder.id);
    assert.equal(current?.status, 'AWAITING_SELLER');
    assert.equal(current?.history.length, 1);
    await cancel(repo, customerId, sellerOrder.id);
  });
  it('retains consumed stock and attributed history on seller-reported failed delivery', async () => {
    const previous = await stock();
    const { repo, sellerOrder } = await placed();
    let so = await processOrder(repo, sellerOrder, { action: 'ACCEPT', expectedVersion: 1 });
    so = await processOrder(repo, so, { action: 'PREPARE', expectedVersion: 2 });
    so = await processOrder(repo, so, { action: 'SHIP', expectedVersion: 3, shipment });
    so = await processOrder(repo, so, { action: 'REPORT_DELIVERY_FAILED', expectedVersion: 4 });
    assert.equal(so.status, 'DELIVERY_FAILED');
    assert.equal(so.history.at(-1)?.attribution, 'SELLER');
    assert.equal(await stock(), previous - 1);
    assert.equal(so.paymentState, 'NOT_APPLICABLE_TEST');
    await assert.rejects(
      processOrder(repo, so, { action: 'REPORT_DELIVERY', expectedVersion: 5 }),
      failure('ORDER_STATE_CONFLICT'),
    );
  });
  it('requires a rejection reason, preserves it and refuses history-free status writes', async () => {
    const { repo, customerId, sellerOrder } = await placed();
    await assert.rejects(
      pool.query("UPDATE commerce.seller_orders SET status='ACCEPTED',row_version=2 WHERE id=$1", [
        sellerOrder.id,
      ]),
    );
    const base = {
      sellerOrderId: sellerOrder.id,
      actor: { type: 'seller_user', id: ids.adminUserId },
      scopeId: sellerOrder.snapshot.sellerId,
      expectedVersion: 1,
      reason: 'SELLER_REJECTED',
      correlationId: randomUUID(),
    } as const;
    await assert.rejects(repo.closeSellerOrder(base), failure('ORDER_STATE_CONFLICT'));
    const so = await repo.closeSellerOrder({ ...base, rejectionReason: 'DELIVERY_UNAVAILABLE' });
    assert.equal(so.rejectionReason, 'DELIVERY_UNAVAILABLE');
    assert.equal(so.history.at(-1)?.reason, 'DELIVERY_UNAVAILABLE');
    await assert.rejects(
      repo.closeSellerOrder({ ...base, rejectionReason: 'OUT_OF_STOCK' }),
      failure('ORDER_STATE_CONFLICT'),
    );
    assert.equal(
      (await repo.getCustomerOrder(customerId, so.orderId))?.sellerOrders[0]?.rejectionReason,
      'DELIVERY_UNAVAILABLE',
    );
  });

  it('captures immutable delivery contact, isolates access and keeps it out of events and notifications', async () => {
    const { repo, customerId } = await fixture();
    await carts.setItem(customerId, offer, { quantity: 1, expectedVersion: 0 });
    await carts.setItem(customerId, another, { quantity: 1, expectedVersion: 1 });
    const input: DeliveryContact = { ...contact };
    const quote = await repo.createQuote(customerId, 2, destination, input);
    input.city = 'CHANGED City';
    assert.deepEqual((await repo.getQuote(customerId, quote.id))?.deliveryContact, contact);
    await assert.rejects(
      repo.createQuote(customerId, 2, destination, { ...contact, phone: 'invalid' }),
    );

    // Existing unplaced quotes without contact must be replaced, never silently completed.
    const oldId = randomUUID();
    const legacy = { ...quote, id: oldId, deliveryContact: undefined };
    await pool.query(
      'INSERT INTO commerce.checkout_quotes(id,customer_id,cart_version,snapshot,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6)',
      [oldId, customerId, quote.cartVersion, legacy, quote.createdAt, quote.expiresAt],
    );
    assert.equal((await repo.getQuote(customerId, oldId))?.deliveryContact, undefined);
    await assert.rejects(repo.place(customerId, oldId, randomUUID()), failure('QUOTE_CHANGED'));

    const order = await repo.place(customerId, quote.id, randomUUID());
    assert.equal((await repo.place(customerId, quote.id, randomUUID())).id, order.id);
    assert.deepEqual(order.quote.deliveryContact, contact);
    await assert.rejects(
      pool.query(
        "UPDATE commerce.checkout_quotes SET snapshot=jsonb_set(snapshot,'{deliveryContact,city}','\"CHANGED\"') WHERE id=$1",
        [quote.id],
      ),
      /immutable/,
    );
    assert.equal(await repo.getQuote(randomUUID(), quote.id), null);
    assert.equal(await repo.getCustomerOrder(randomUUID(), order.id), null);
    for (const so of order.sellerOrders) {
      assert.deepEqual(
        (await repo.getSellerOrder(so.snapshot.sellerId, so.id))?.deliveryContact,
        contact,
      );
      assert.equal(await repo.getSellerOrder(randomUUID(), so.id), null);
      const records = await pool.query(
        'SELECT payload AS data FROM platform.outbox_events WHERE aggregate_id=$1 UNION ALL SELECT after_data AS data FROM platform.audit_events WHERE entity_id=$1',
        [so.id],
      );
      assert.ok(records.rows.length >= 2);
      for (const value of Object.values(contact))
        assert.equal(JSON.stringify(records.rows).includes(value), false);
    }
    const inbox = await new PostgresOrderNotificationRepository(pool).list({
      type: 'customer',
      userId: customerId,
    });
    for (const value of Object.values(contact))
      assert.equal(JSON.stringify(inbox).includes(value), false);
    for (const so of order.sellerOrders) await cancel(repo, customerId, so.id);
  });

  it('keeps reservations and placed prices intact when a seller edits available stock', async () => {
    const catalog = new PostgresCatalogRepository(pool);
    const baseline = await catalog.getSellerOffer(ids.sellers[0] as string, offer);
    assert.ok(baseline);
    const setup = await placed();
    const next = await fixture();
    await carts.setItem(next.customerId, offer, { quantity: 1, expectedVersion: 0 });
    const unplaced = await next.repo.createQuote(next.customerId, 1, destination, contact);
    const current = await catalog.getSellerOffer(baseline.sellerId, offer);
    assert.ok(current);
    const ctx = { actorUserId: ids.adminUserId, correlationId: randomUUID() };
    const edit = {
      expectedVersion: current.rowVersion,
      priceMinor: current.priceMinor + 1,
      availableQuantity: 5,
      handlingDays: current.handlingDays,
    };
    await assert.rejects(
      catalog.updateOffer(baseline.sellerId, offer, { ...edit, availableQuantity: 1_000_000 }, ctx),
    );
    await catalog.updateOffer(baseline.sellerId, offer, edit, ctx);
    await assert.rejects(
      next.repo.place(next.customerId, unplaced.id, randomUUID()),
      failure('QUOTE_CHANGED'),
    );
    const unchanged = await setup.repo.getSellerOrder(baseline.sellerId, setup.sellerOrder.id);
    assert.equal(unchanged?.snapshot.items[0]?.unitPriceMinor, baseline.priceMinor);
    await cancel(setup.repo, setup.customerId, setup.sellerOrder.id);
    assert.equal(await stock(), 6);
    const latest = await catalog.getSellerOffer(baseline.sellerId, offer);
    assert.ok(latest);
    await catalog.updateOffer(
      baseline.sellerId,
      offer,
      {
        expectedVersion: latest.rowVersion,
        priceMinor: baseline.priceMinor,
        availableQuantity: baseline.availableQuantity,
        handlingDays: baseline.handlingDays,
      },
      ctx,
    );
  });

  it('support isolates customer and seller conversations and records no stock/payment changes', async () => {
    const setup = await placed();
    const support = new PostgresSupportRepository(pool);
    const customer = { type: 'customer', userId: setup.customerId } as const;
    const seller = {
      type: 'seller_user',
      userId: ids.adminUserId,
      sellerId: setup.sellerOrder.snapshot.sellerId,
    } as const;
    const staff = { type: 'staff', userId: ids.adminUserId } as const;
    const input = {
      sellerOrderId: setup.sellerOrder.id,
      category: 'RETURN_REQUEST',
      body: 'TEST return request body',
    };
    const before = await stock();
    const [one, two] = await Promise.all([
      support.create(customer, input, randomUUID()),
      support.create(customer, input, randomUUID()),
    ]);
    assert.equal(one.case.id, two.case.id);
    assert.equal(two.messages.length, 1);
    assert.equal((await support.get(seller, one.case.id)).messages[0]?.body, input.body);
    assert.equal((await support.forOrder(customer, input.sellerOrderId))?.case.id, one.case.id);
    assert.equal(await support.forOrder(customer, randomUUID()), null);
    assert.equal(
      (await support.list(staff)).items.some((c) => c.id === one.case.id),
      false,
    );
    for (const other of [
      { ...customer, userId: randomUUID() },
      { ...seller, sellerId: randomUUID() },
      staff,
    ])
      await assert.rejects(support.get(other, one.case.id), /not found/);
    await assert.rejects(support.create(seller, input, randomUUID()), /not permitted/);
    await assert.rejects(
      support.create(customer, { ...input, body: 'Different TEST message' }, randomUUID()),
      /Reload/,
    );
    assert.equal(await stock(), before);
    assert.equal(
      (await setup.repo.getSellerOrder(seller.sellerId, setup.sellerOrder.id))?.status,
      'AWAITING_SELLER',
    );
    const audit = await pool.query(
      'SELECT payload AS data FROM platform.outbox_events WHERE aggregate_id=$1 UNION ALL SELECT after_data AS data FROM platform.audit_events WHERE entity_id=$1',
      [one.case.id],
    );
    assert.equal(JSON.stringify(audit.rows).includes(input.body), false);
    await assert.rejects(
      pool.query('UPDATE commerce.support_messages SET body=$2 WHERE case_id=$1', [
        one.case.id,
        'Altered TEST body',
      ]),
      /immutable/,
    );
    await assert.rejects(
      pool.query(
        "UPDATE commerce.support_cases SET status='RESOLVED',row_version=row_version+1 WHERE id=$1",
        [one.case.id],
      ),
      /history/,
    );
    await cancel(setup.repo, setup.customerId, setup.sellerOrder.id);
  });

  it('support fences concurrent replies, retries, customer closure and staff escalation', async () => {
    const setup = await placed();
    const support = new PostgresSupportRepository(pool);
    const customer = { type: 'customer', userId: setup.customerId } as const;
    const seller = {
      type: 'seller_user',
      userId: ids.adminUserId,
      sellerId: setup.sellerOrder.snapshot.sellerId,
    } as const;
    const staff = { type: 'staff', userId: ids.adminUserId } as const;
    const opened = await support.create(
      customer,
      {
        sellerOrderId: setup.sellerOrder.id,
        category: 'DELIVERY_ISSUE',
        body: 'TEST delivery issue',
      },
      randomUUID(),
    );
    const id = opened.case.id;
    const command = {
      expectedVersion: 1,
      requestId: randomUUID(),
      action: 'REPLY',
      body: 'TEST proposed solution',
    };
    const [first, retry] = await Promise.all([
      support.act(seller, id, command, randomUUID()),
      support.act(seller, id, command, randomUUID()),
    ]);
    assert.equal(first.case.version, 2);
    assert.equal(retry.case.version, 2);
    assert.equal(first.case.status, 'WAITING_CUSTOMER');
    await assert.rejects(
      support.act(seller, id, { ...command, body: 'Changed TEST text' }, randomUUID()),
      /Reload/,
    );
    await assert.rejects(
      support.act(seller, id, { ...command, requestId: randomUUID() }, randomUUID()),
      /Reload/,
    );
    const next = {
      expectedVersion: 2,
      requestId: randomUUID(),
      action: 'CONFIRM_RESOLUTION',
      body: 'TEST confirm solution',
    };
    await assert.rejects(support.act(seller, id, next, randomUUID()), /not permitted/);
    assert.equal((await support.act(customer, id, next, randomUUID())).case.status, 'RESOLVED');
    const reopened = await support.act(
      customer,
      id,
      { expectedVersion: 3, requestId: randomUUID(), action: 'REPLY', body: 'TEST reopen request' },
      randomUUID(),
    );
    assert.equal(reopened.case.status, 'OPEN');
    const escalated = await support.act(
      customer,
      id,
      {
        expectedVersion: 4,
        requestId: randomUUID(),
        action: 'ESCALATE',
        body: 'TEST ask support review',
      },
      randomUUID(),
    );
    assert.equal(escalated.case.status, 'ESCALATED');
    assert.equal((await support.get(staff, id)).case.id, id);
    assert.equal(
      (await support.list(staff)).items.some((c) => c.id === id),
      true,
    );
    const resolve = {
      expectedVersion: 5,
      requestId: randomUUID(),
      action: 'STAFF_RESOLVE',
      body: 'TEST staff decision record',
    };
    await assert.rejects(support.act(customer, id, resolve, randomUUID()), /not permitted/);
    const closed = await support.act(staff, id, resolve, randomUUID());
    assert.equal(closed.case.status, 'RESOLVED');
    assert.equal(closed.messages.at(-1)?.attribution, 'STAFF');
    assert.equal((await support.act(staff, id, resolve, randomUUID())).case.version, 6);
    await cancel(setup.repo, setup.customerId, setup.sellerOrder.id);
  });

  it('support paginates immutable message history and rejects malformed cursors', async () => {
    const setup = await placed();
    const support = new PostgresSupportRepository(pool);
    const customer = { type: 'customer', userId: setup.customerId } as const;
    let detail = await support.create(
      customer,
      { sellerOrderId: setup.sellerOrder.id, category: 'OTHER', body: 'TEST initial message' },
      randomUUID(),
    );
    for (let i = 0; i < 51; i++)
      detail = await support.act(
        customer,
        detail.case.id,
        {
          expectedVersion: detail.case.version,
          requestId: randomUUID(),
          action: 'REPLY',
          body: `TEST reply ${i}`,
        },
        randomUUID(),
      );
    assert.equal(detail.messages.length, 50);
    assert.equal(detail.nextBeforeVersion, 3);
    const old = await support.get(customer, detail.case.id, {
      beforeVersion: detail.nextBeforeVersion,
    });
    assert.deepEqual(
      old.messages.map((m) => m.version),
      [1, 2],
    );
    assert.equal(old.nextBeforeVersion, null);
    await assert.rejects(
      support.get(customer, detail.case.id, { beforeVersion: 'invalid' }),
      /validation/,
    );
    await assert.rejects(support.list(customer, { cursor: 'invalid' }), /validation/);
    await cancel(setup.repo, setup.customerId, setup.sellerOrder.id);
  });

  it('support rolls back history and state if outbox evidence fails', async () => {
    const setup = await placed();
    const support = new PostgresSupportRepository(pool);
    const customer = { type: 'customer', userId: setup.customerId } as const;
    const opened = await support.create(
      customer,
      { sellerOrderId: setup.sellerOrder.id, category: 'OTHER', body: 'TEST initial message' },
      randomUUID(),
    );
    await pool.query(
      `INSERT INTO platform.outbox_events(event_type,event_version,producer,aggregate_type,aggregate_id,aggregate_version,payload,actor_type,actor_id,correlation_id) VALUES('support.case_changed',1,'atlas-api','support_case',$1,2,'{}','customer',$2,$3)`,
      [opened.case.id, setup.customerId, randomUUID()],
    );
    await assert.rejects(
      support.act(
        customer,
        opened.case.id,
        {
          expectedVersion: 1,
          requestId: randomUUID(),
          action: 'ESCALATE',
          body: 'TEST escalation attempt',
        },
        randomUUID(),
      ),
    );
    const current = await support.get(customer, opened.case.id);
    assert.equal(current.case.version, 1);
    assert.equal(current.case.status, 'OPEN');
    assert.equal(current.messages.length, 1);
    await cancel(setup.repo, setup.customerId, setup.sellerOrder.id);
  });

  it('quotes server-owned terms grouped by seller without reserving or paying', async () => {
    const { repo, customerId } = await fixture();
    const before = await stock();
    await carts.setItem(customerId, offer, { quantity: 2, expectedVersion: 0 });
    await carts.setItem(customerId, another, { quantity: 1, expectedVersion: 1 });
    const quote = await repo.createQuote(customerId, 2, destination, contact);
    assert.equal(quote.sellers.length, 2);
    assert.equal(quote.paymentArrangement, 'TEST_ONLY_NO_PAYMENT');
    assert.equal(quote.delivery, 'LOCAL_TEST_NO_SHIPMENT');
    assert.equal(quote.totalMinor, 3290000);
    assert.equal(await stock(), before);
    assert.equal(await repo.getQuote(randomUUID(), quote.id), null);
    assert.deepEqual(await repo.getQuote(customerId, quote.id), quote);
  });
  it('creates one order under duplicate concurrent checkout, isolated seller inboxes and one reservation per item', async () => {
    const { repo, customerId } = await fixture();
    const before = await stock();
    await carts.setItem(customerId, offer, { quantity: 2, expectedVersion: 0 });
    await carts.setItem(customerId, another, { quantity: 1, expectedVersion: 1 });
    const quote = await repo.createQuote(customerId, 2, destination, contact);
    const orders = await Promise.all([
      repo.place(customerId, quote.id, randomUUID()),
      repo.place(customerId, quote.id, randomUUID()),
    ]);
    assert.equal(orders[0]?.id, orders[1]?.id);
    const order = orders[0];
    assert.ok(order);
    assert.equal(order.sellerOrders.length, 2);
    assert.equal(await stock(), before - 2);
    assert.equal((await carts.getCart(customerId)).items.length, 0);
    const owner = order.sellerOrders.find((item) => item.snapshot.sellerId === ids.sellers[0]);
    assert.ok(owner);
    const other = order.sellerOrders.find((item) => item.snapshot.sellerId !== ids.sellers[0]);
    assert.ok(other);
    assert.equal(await repo.getSellerOrder(ids.sellers[1] as string, owner.id), null);
    assert.equal(await repo.getCustomerOrder(randomUUID(), order.id), null);
    const inbox = await repo.listSellerOrders(ids.sellers[0] as string);
    assert.ok(inbox.every((item) => item.snapshot.sellerId === ids.sellers[0]));
    const pending = await pool.query<{ count: string }>(
      "SELECT count(*) FROM platform.outbox_events WHERE event_type='seller_order.routed' AND aggregate_id=ANY($1::uuid[]) AND published_at IS NULL",
      [order.sellerOrders.map((item) => item.id)],
    );
    assert.equal(pending.rows[0]?.count, '2');
    // Notification dispatch is deliberately absent; persisted inbox remains authoritative.
    await pool.query(
      "UPDATE platform.outbox_events SET delivery_state='FAILED',attempt_count=1,last_error_code='TEST_PROVIDER_UNAVAILABLE' WHERE aggregate_id=$1",
      [owner.id],
    );
    assert.equal(
      (await repo.getSellerOrder(ids.sellers[0] as string, owner.id))?.status,
      'AWAITING_SELLER',
    );
    await repo.closeSellerOrder({
      sellerOrderId: owner.id,
      actor: { type: 'seller_user', id: ids.adminUserId },
      scopeId: owner.snapshot.sellerId,
      expectedVersion: 1,
      reason: 'SELLER_REJECTED',
      rejectionReason: 'OUT_OF_STOCK',
      correlationId: randomUUID(),
    });
    assert.equal(await stock(), before);
    assert.equal(
      (await repo.getSellerOrder(ids.sellers[1] as string, other.id))?.status,
      'AWAITING_SELLER',
    );
    await cancel(repo, customerId, other.id);
  });
  it('refuses changed price/cart terms, expired quotes and foreign quote ownership', async () => {
    const { repo, customerId } = await fixture();
    await carts.setItem(customerId, offer, { quantity: 1, expectedVersion: 0 });
    const quote = await repo.createQuote(customerId, 1, destination, contact);
    await pool.query('UPDATE offers.offers SET price_minor=price_minor+1 WHERE id=$1', [offer]);
    try {
      await assert.rejects(
        repo.place(customerId, quote.id, randomUUID()),
        failure('QUOTE_CHANGED'),
      );
    } finally {
      await pool.query('UPDATE offers.offers SET price_minor=price_minor-1 WHERE id=$1', [offer]);
    }
    await carts.setItem(customerId, offer, { quantity: 2, expectedVersion: 1 });
    await assert.rejects(repo.place(customerId, quote.id, randomUUID()), failure('QUOTE_CHANGED'));
    const outsider = await fixture();
    await assert.rejects(
      outsider.repo.place(outsider.customerId, quote.id, randomUUID()),
      failure('ORDER_NOT_FOUND'),
    );
    const short = await fixture(1);
    await carts.setItem(short.customerId, offer, { quantity: 1, expectedVersion: 0 });
    const expired = await short.repo.createQuote(short.customerId, 1, destination, contact);
    await delay(1100);
    await assert.rejects(
      short.repo.place(short.customerId, expired.id, randomUUID()),
      failure('QUOTE_EXPIRED'),
    );
  });
  it('serializes competing customers so concurrent purchases cannot oversell', async () => {
    const previous = await stock();
    await pool.query('UPDATE offers.offers SET available_quantity=1 WHERE id=$1', [offer]);
    const a = await fixture();
    const b = await fixture();
    try {
      await carts.setItem(a.customerId, offer, { quantity: 1, expectedVersion: 0 });
      await carts.setItem(b.customerId, offer, { quantity: 1, expectedVersion: 0 });
      const qa = await a.repo.createQuote(a.customerId, 1, destination, contact);
      const qb = await b.repo.createQuote(b.customerId, 1, destination, contact);
      const results = await Promise.allSettled([
        a.repo.place(a.customerId, qa.id, randomUUID()),
        b.repo.place(b.customerId, qb.id, randomUUID()),
      ]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(await stock(), 0);
      for (const [index, result] of results.entries())
        if (result.status === 'fulfilled') {
          const owner = index === 0 ? a : b;
          for (const item of result.value.sellerOrders)
            await cancel(owner.repo, owner.customerId, item.id);
        }
      assert.equal(await stock(), 1);
    } finally {
      await pool.query('UPDATE offers.offers SET available_quantity=$2 WHERE id=$1', [
        offer,
        previous,
      ]);
    }
  });
  it('releases a reservation exactly once under duplicate cancellation and rejects foreign actors', async () => {
    const { repo, customerId } = await fixture();
    const previous = await stock();
    await carts.setItem(customerId, offer, { quantity: 2, expectedVersion: 0 });
    const quote = await repo.createQuote(customerId, 1, destination, contact);
    const order = await repo.place(customerId, quote.id, randomUUID());
    const so = order.sellerOrders[0];
    assert.ok(so);
    await assert.rejects(cancel(repo, randomUUID(), so.id), failure('ORDER_NOT_FOUND'));
    await assert.rejects(
      repo.closeSellerOrder({
        sellerOrderId: so.id,
        actor: { type: 'seller_user', id: ids.adminUserId },
        scopeId: ids.sellers[1] as string,
        expectedVersion: 1,
        reason: 'SELLER_REJECTED',
        rejectionReason: 'OUT_OF_STOCK',
        correlationId: randomUUID(),
      }),
      failure('ORDER_NOT_FOUND'),
    );
    const results = await Promise.all([
      cancel(repo, customerId, so.id),
      cancel(repo, customerId, so.id),
    ]);
    assert.ok(results.every((result) => result.status === 'CANCELLED' && result.version === 2));
    assert.equal(await stock(), previous);
    assert.equal(
      (
        await pool.query(
          'SELECT count(*)::integer AS count FROM platform.outbox_events WHERE aggregate_id=$1 AND event_type=$2',
          [so.id, 'seller_order.closed'],
        )
      ).rows[0]?.count,
      1,
    );
  });
  it('expires only due awaiting orders and releases their stock once', async () => {
    const { repo, customerId } = await fixture(600, 1);
    const previous = await stock();
    await carts.setItem(customerId, offer, { quantity: 1, expectedVersion: 0 });
    const quote = await repo.createQuote(customerId, 1, destination, contact);
    const order = await repo.place(customerId, quote.id, randomUUID());
    const so = order.sellerOrders[0];
    assert.ok(so);
    assert.equal(await repo.expireDue(), 0);
    await delay(1100);
    assert.equal(await repo.expireDue(), 1);
    assert.equal(await repo.expireDue(), 0);
    assert.equal(await stock(), previous);
    assert.equal((await repo.getSellerOrder(so.snapshot.sellerId, so.id))?.status, 'EXPIRED');
  });
  it('rolls back order, cart, reservation, stock and audit when routing evidence cannot persist', async () => {
    const { repo, customerId } = await fixture();
    const previous = await stock();
    await carts.setItem(customerId, offer, { quantity: 1, expectedVersion: 0 });
    const quote = await repo.createQuote(customerId, 1, destination, contact);
    await pool.query(`CREATE FUNCTION commerce.fail_routing_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='seller_order.routed' THEN RAISE EXCEPTION 'synthetic outbox failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_routing_test BEFORE INSERT ON platform.outbox_events FOR EACH ROW EXECUTE FUNCTION commerce.fail_routing_test()`);
    try {
      await assert.rejects(repo.place(customerId, quote.id, randomUUID()));
    } finally {
      await pool.query(
        'DROP TRIGGER fail_routing_test ON platform.outbox_events; DROP FUNCTION commerce.fail_routing_test()',
      );
    }
    assert.equal((await repo.listCustomerOrders(customerId)).length, 0);
    assert.equal((await carts.getCart(customerId)).items.length, 1);
    assert.equal(await stock(), previous);
    const order = await repo.place(customerId, quote.id, randomUUID());
    for (const so of order.sellerOrders) await cancel(repo, customerId, so.id);
  });
  it('protects immutable order/quote/seller snapshots and terminal lifecycle history', async () => {
    const { repo, customerId } = await fixture();
    await carts.setItem(customerId, offer, { quantity: 1, expectedVersion: 0 });
    const quote = await repo.createQuote(customerId, 1, destination, contact);
    const order = await repo.place(customerId, quote.id, randomUUID());
    const so = order.sellerOrders[0];
    assert.ok(so);
    await assert.rejects(
      pool.query(
        "UPDATE commerce.checkout_quotes SET snapshot=jsonb_set(snapshot,'{totalMinor}','0') WHERE id=$1",
        [quote.id],
      ),
    );
    await assert.rejects(
      pool.query('UPDATE commerce.orders SET customer_id=$2 WHERE id=$1', [
        order.id,
        ids.adminUserId,
      ]),
    );
    await assert.rejects(
      pool.query(
        "UPDATE commerce.seller_orders SET snapshot=jsonb_set(snapshot,'{totalMinor}','0') WHERE id=$1",
        [so.id],
      ),
    );
    await assert.rejects(
      pool.query(
        'INSERT INTO commerce.stock_reservations(seller_order_id,offer_id,seller_id,quantity) VALUES($1,$2,$3,1)',
        [so.id, another, so.snapshot.sellerId],
      ),
    );
    await assert.rejects(
      pool.query(
        'UPDATE commerce.stock_reservations SET quantity=quantity+1 WHERE seller_order_id=$1',
        [so.id],
      ),
    );
    await assert.rejects(
      pool.query('DELETE FROM commerce.stock_reservations WHERE seller_order_id=$1', [so.id]),
    );
    await cancel(repo, customerId, so.id);
    await assert.rejects(
      pool.query(
        'UPDATE commerce.stock_reservations SET released_at=NULL WHERE seller_order_id=$1',
        [so.id],
      ),
    );
    await assert.rejects(
      pool.query(
        "UPDATE commerce.seller_orders SET status='AWAITING_SELLER',closed_at=NULL,row_version=row_version+1 WHERE id=$1",
        [so.id],
      ),
    );
  });
});
