import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { EventEnvelopeSchema } from '@atlas/contracts';
import { runMigrations, seedSyntheticData } from '@atlas/database';
import { Client, Pool } from 'pg';

import {
  CatalogWriteError,
  PostgresCatalogRepository,
  seedSyntheticCatalog,
  SYNTHETIC_CATALOG_IDS,
} from '../../src/index.js';

describe('PostgreSQL seller catalog', () => {
  const sourceUrl = process.env['DATABASE_URL'];
  if (sourceUrl === undefined)
    throw new Error('DATABASE_URL is required for catalog integration tests');
  const databaseName = `atlas_catalog_it_${randomBytes(8).toString('hex')}`;
  const adminUrl = new URL(sourceUrl);
  adminUrl.pathname = '/postgres';
  const testUrl = new URL(sourceUrl);
  testUrl.pathname = `/${databaseName}`;
  const admin = new Client({ connectionString: adminUrl.toString() });
  let pool: Pool;
  let repository: PostgresCatalogRepository;
  const actorUserId = SYNTHETIC_CATALOG_IDS.adminUserId;

  before(async () => {
    await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    await runMigrations(testUrl.toString());
    await seedSyntheticData(testUrl.toString(), 'test');
    pool = new Pool({ connectionString: testUrl.toString(), max: 6 });
    await seedSyntheticCatalog(pool, 'test');
    repository = new PostgresCatalogRepository(pool);
  });

  after(async () => {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await admin.end();
  });

  const newSeller = async (status = 'APPROVED'): Promise<string> => {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO sellers.sellers (id, slug, name, description_fr, description_ar, status)
      VALUES ($1, $2, 'Synthetic test seller', 'Vendeur de test', 'بائع تجريبي', $3)`,
      [id, `test-${id}`, status],
    );
    return id;
  };

  const input = () => ({
    productId: SYNTHETIC_CATALOG_IDS.products[0] as string,
    priceMinor: 1000000,
    availableQuantity: 4,
    handlingDays: 2,
    deliveryFeeMinor: 50000,
  });
  const context = () => ({ actorUserId, correlationId: randomUUID() });

  it('updates only owned mutable offer terms with optimistic concurrency and immutable moderation', async () => {
    const sellerId = await newSeller();
    const offer = await repository.createOffer(sellerId, input(), context());
    const change = {
      expectedVersion: offer.rowVersion,
      priceMinor: 123450,
      availableQuantity: 7,
      handlingDays: 3,
    };
    assert.equal(await repository.getSellerOffer(randomUUID(), offer.id), null);
    await assert.rejects(
      repository.updateOffer(await newSeller(), offer.id, change, context()),
      (error: unknown) => error instanceof CatalogWriteError && error.code === 'OFFER_NOT_FOUND',
    );
    const results = await Promise.allSettled([
      repository.updateOffer(sellerId, offer.id, change, context()),
      repository.updateOffer(sellerId, offer.id, { ...change, priceMinor: 234560 }, context()),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    const saved = await repository.getSellerOffer(sellerId, offer.id);
    assert.ok(saved);
    assert.equal(saved.rowVersion, 2);
    assert.equal(saved.status, 'PENDING_REVIEW');
    assert.equal(saved.deliveryFeeMinor, offer.deliveryFeeMinor);
    const noOp = await repository.updateOffer(
      sellerId,
      offer.id,
      { ...change, expectedVersion: saved.rowVersion, priceMinor: saved.priceMinor },
      context(),
    );
    assert.equal(noOp.rowVersion, saved.rowVersion);
    const approved = await repository.approveOffer(actorUserId, offer.id, randomUUID());
    const live = await repository.updateOffer(
      sellerId,
      offer.id,
      { ...change, expectedVersion: approved.rowVersion, availableQuantity: 0 },
      context(),
    );
    assert.equal(live.status, 'APPROVED');
    assert.equal(live.availableQuantity, 0);
    const events = await pool.query<{ payload: unknown }>(
      "SELECT payload FROM platform.outbox_events WHERE aggregate_id=$1 AND event_type='offer.updated'",
      [offer.id],
    );
    assert.equal(events.rows.length, 2);
    // A suspended offer cannot be edited; a refused one is corrected and goes back to review.
    await pool.query("UPDATE offers.offers SET status='SUSPENDED' WHERE id=$1", [offer.id]);
    await assert.rejects(
      repository.updateOffer(
        sellerId,
        offer.id,
        { ...change, expectedVersion: live.rowVersion },
        context(),
      ),
    );
    await pool.query("UPDATE offers.offers SET status='REJECTED' WHERE id=$1", [offer.id]);
    const resubmitted = await repository.updateOffer(
      sellerId,
      offer.id,
      { ...change, expectedVersion: live.rowVersion },
      context(),
    );
    assert.equal(resubmitted.status, 'PENDING_REVIEW');
    await pool.query("UPDATE sellers.sellers SET status='SUSPENDED' WHERE id=$1", [sellerId]);
    await assert.rejects(
      repository.updateOffer(sellerId, offer.id, change, context()),
      (error: unknown) =>
        error instanceof CatalogWriteError && error.code === 'SELLER_NOT_APPROVED',
    );
  });

  it('rolls back an offer edit and its audit if outbox evidence cannot commit', async () => {
    const sellerId = await newSeller();
    const offer = await repository.createOffer(sellerId, input(), context());
    await pool.query(
      `INSERT INTO platform.outbox_events(event_type,event_version,producer,aggregate_type,aggregate_id,aggregate_version,payload,actor_type,actor_id,correlation_id) VALUES('offer.updated',1,'atlas-api','offer',$1,2,'{}','seller_user',$2,$3)`,
      [offer.id, actorUserId, randomUUID()],
    );
    await assert.rejects(
      repository.updateOffer(
        sellerId,
        offer.id,
        { expectedVersion: 1, priceMinor: 1, availableQuantity: 0, handlingDays: 0 },
        context(),
      ),
    );
    assert.deepEqual(await repository.getSellerOffer(sellerId, offer.id), offer);
    const audit = await pool.query(
      "SELECT action FROM platform.audit_events WHERE entity_id=$1 AND action='offer.updated'",
      [offer.id],
    );
    assert.equal(audit.rows.length, 0);
  });

  it('publishes six persisted products with deterministic literal search, category and seller filtering', async () => {
    const all = await repository.listProducts();
    assert.equal(all.items.length, 6);
    assert.deepEqual(
      all.items.map((product) => product.slug),
      [...all.items.map((product) => product.slug)].sort(),
    );
    assert.equal(
      (await repository.listProducts({ query: 'قلاية' })).items[0]?.slug,
      'air-fryer-5l',
    );
    assert.equal((await repository.listProducts({ query: 'Friteuse' })).items.length, 1);
    // Accents, case and Arabic spelling variants do not matter.
    const slugsFor = async (query: string) =>
      (await repository.listProducts({ query })).items.map((item) => item.slug);
    assert.deepEqual(await slugsFor('MACHINE A CAFE'), ['coffee-maker-compact']);
    assert.deepEqual(await slugsFor('\u0627\u0644\u0629 \u0642\u0647\u0648\u0647'), ['coffee-maker-compact']);
    assert.deepEqual(await slugsFor('\u0642\u064e\u0644\u0627\u064a\u0647'), ['air-fryer-5l']);
    assert.equal((await repository.listProducts({ query: 'caf_' })).items.length, 0);
    // Arabic presentation forms (as some copy-paste sources produce them).
    assert.deepEqual(await slugsFor('\ufed7\ufefc\ufef3\ufe94'), ['air-fryer-5l']);
    assert.equal((await repository.listProducts({ category: 'phones' })).items.length, 2);
    assert.equal((await repository.listProducts({ seller: 'maison-plus' })).items.length, 2);
    assert.equal((await repository.listProducts({ limit: 2 })).items.length, 2);
    // Price range on each product's lowest offer price (offers come cheapest first).
    const lowest = (product: { offers: { priceMinor: number }[] }) =>
      Math.min(...product.offers.map((offer) => offer.priceMinor));
    const prices = all.items.map(lowest).sort((a, b) => a - b);
    const middle = prices[Math.floor(prices.length / 2)] ?? 0;
    const cheap = await repository.listProducts({ maxPrice: middle, limit: 100 });
    assert.ok(cheap.items.length > 0 && cheap.items.every((item) => lowest(item) <= middle));
    const dear = await repository.listProducts({ minPrice: middle, limit: 100 });
    assert.ok(dear.items.length > 0 && dear.items.every((item) => lowest(item) >= middle));
    assert.equal(
      (cheap.total ?? 0) + (dear.total ?? 0) - prices.filter((price) => price === middle).length,
      all.total,
    );
    assert.equal(
      (await repository.listProducts({ minPrice: middle + 1, maxPrice: middle - 1 })).total,
      0,
    );
    // A list of slugs (device favorites) in one query; unknown slugs are simply absent.
    const picked = await repository.listProducts({
      slugs: ['air-fryer-5l', 'earbuds-wireless', 'no-such-product'],
      limit: 60,
    });
    assert.deepEqual(picked.items.map((item) => item.slug).sort(), ['air-fryer-5l', 'earbuds-wireless']);
    for (const query of ['%', '_', "' OR true --", '\\']) {
      assert.equal((await repository.listProducts({ query })).items.length, 0);
    }
    assert.equal((await repository.getProduct('air-fryer-5l'))?.offers[0]?.priceMinor, 1250000);
    assert.equal(await repository.getProduct('missing-product'), null);
    assert.equal((await repository.getSeller('maison-plus'))?.id, SYNTHETIC_CATALOG_IDS.sellers[0]);
    assert.equal(await repository.getSeller('missing-seller'), null);
  });

  it('excludes suspended sellers, restricted or unapproved categories, unapproved products and hidden offers', async () => {
    const cases = [
      {
        table: 'sellers.sellers',
        id: SYNTHETIC_CATALOG_IDS.sellers[0],
        column: 'status',
        value: 'SUSPENDED',
        restore: 'APPROVED',
      },
      {
        table: 'catalog.categories',
        id: SYNTHETIC_CATALOG_IDS.categories[0],
        column: 'restriction_class',
        value: 'REVIEW_REQUIRED',
        restore: 'STANDARD',
      },
      {
        table: 'catalog.categories',
        id: SYNTHETIC_CATALOG_IDS.categories[0],
        column: 'moderation_status',
        value: 'PENDING_REVIEW',
        restore: 'APPROVED',
      },
      {
        table: 'catalog.categories',
        id: SYNTHETIC_CATALOG_IDS.categories[0],
        column: 'status',
        value: 'INACTIVE',
        restore: 'ACTIVE',
      },
      {
        table: 'catalog.products',
        id: SYNTHETIC_CATALOG_IDS.products[5],
        column: 'moderation_status',
        value: 'PENDING_REVIEW',
        restore: 'APPROVED',
      },
      {
        table: 'catalog.products',
        id: SYNTHETIC_CATALOG_IDS.products[5],
        column: 'status',
        value: 'INACTIVE',
        restore: 'ACTIVE',
      },
      {
        table: 'offers.offers',
        id: SYNTHETIC_CATALOG_IDS.offers[5],
        column: 'status',
        value: 'SUSPENDED',
        restore: 'APPROVED',
      },
    ];
    for (const item of cases) {
      await pool.query(`UPDATE ${item.table} SET ${item.column} = $1 WHERE id = $2`, [
        item.value,
        item.id,
      ]);
      try {
        assert.equal(
          await repository.getProduct('coffee-maker-compact'),
          null,
          `${item.table}.${item.column}`,
        );
        assert.equal(
          (await repository.listProducts()).items.some((p) => p.slug === 'coffee-maker-compact'),
          false,
        );
        if (item.table === 'sellers.sellers')
          assert.equal(await repository.getSeller('maison-plus'), null);
      } finally {
        await pool.query(`UPDATE ${item.table} SET ${item.column} = $1 WHERE id = $2`, [
          item.restore,
          item.id,
        ]);
      }
    }
  });

  it('creates a private pending offer for the scoped seller and atomically publishes only after approval', async () => {
    const sellerId = await newSeller();
    const otherSellerId = await newSeller();
    const created = await repository.createOffer(sellerId, input(), context());
    assert.equal(created.status, 'PENDING_REVIEW');
    assert.equal(created.sellerId, sellerId);
    await assert.rejects(
      repository.createOffer(sellerId, input(), context()),
      (error: unknown) =>
        error instanceof CatalogWriteError && error.code === 'OFFER_ALREADY_EXISTS',
    );
    assert.deepEqual(
      (await repository.listSellerOffers(sellerId)).map((o) => o.id),
      [created.id],
    );
    assert.deepEqual(await repository.listSellerOffers(otherSellerId), []);
    assert.equal(
      (await repository.getProduct('air-fryer-5l'))?.offers.some((o) => o.id === created.id),
      false,
    );
    const approved = await repository.approveOffer(actorUserId, created.id, randomUUID());
    assert.equal(approved.status, 'APPROVED');
    assert.equal(approved.rowVersion, 2);
    assert.equal(
      (await repository.getProduct('air-fryer-5l'))?.offers.some((o) => o.id === created.id),
      true,
    );
    await assert.rejects(
      repository.approveOffer(actorUserId, created.id, randomUUID()),
      (error: unknown) => error instanceof CatalogWriteError && error.code === 'OFFER_NOT_PENDING',
    );
    const audit = await pool.query(
      'SELECT action, actor_id, entity_version FROM platform.audit_events WHERE entity_id = $1 ORDER BY entity_version',
      [created.id],
    );
    assert.deepEqual(
      audit.rows.map((row) => row['action']),
      ['offer.created', 'offer.activated'],
    );
    assert.equal(
      audit.rows.every((row) => row['actor_id'] === actorUserId),
      true,
    );
    const events = await pool.query(
      `SELECT event_id, event_type, event_version, occurred_at, producer,
      aggregate_type, aggregate_id, aggregate_version, correlation_id, causation_id, actor_type, actor_id, payload
      FROM platform.outbox_events WHERE aggregate_id = $1 ORDER BY aggregate_version`,
      [created.id],
    );
    assert.equal(events.rows.length, 2);
    for (const row of events.rows) {
      assert.equal(
        EventEnvelopeSchema.safeParse({
          eventId: row['event_id'],
          eventType: row['event_type'],
          eventVersion: row['event_version'],
          occurredAt: (row['occurred_at'] as Date).toISOString(),
          producer: row['producer'],
          aggregateType: row['aggregate_type'],
          aggregateId: row['aggregate_id'],
          aggregateVersion: Number(row['aggregate_version']),
          correlationId: row['correlation_id'],
          causationId: row['causation_id'],
          actor: { type: row['actor_type'], id: row['actor_id'] },
          data: row['payload'],
        }).success,
        true,
      );
    }
    const sellerFiltered = await repository.listProducts({ seller: `test-${sellerId}` });
    assert.equal(sellerFiltered.items.length, 1);
    assert.deepEqual(
      sellerFiltered.items[0]?.offers.map((o) => o.seller.id),
      [sellerId],
    );
  });

  it('rejects suspended sellers and unapproved products before creating an offer', async () => {
    const sellerId = await newSeller('SUSPENDED');
    await assert.rejects(
      repository.createOffer(sellerId, input(), context()),
      (error: unknown) =>
        error instanceof CatalogWriteError && error.code === 'SELLER_NOT_APPROVED',
    );
    const approvedSeller = await newSeller();
    await assert.rejects(
      repository.createOffer(approvedSeller, { ...input(), productId: randomUUID() }, context()),
      (error: unknown) =>
        error instanceof CatalogWriteError && error.code === 'PRODUCT_NOT_AVAILABLE',
    );
    assert.deepEqual(await repository.listSellerOffers(sellerId), []);
    assert.deepEqual(await repository.listSellerOffers(approvedSeller), []);
  });

  it('rolls back approval and its audit if outbox persistence fails', async () => {
    const sellerId = await newSeller();
    const created = await repository.createOffer(sellerId, input(), context());
    await pool.query(
      `INSERT INTO platform.outbox_events (event_type, event_version, producer, aggregate_type,
      aggregate_id, aggregate_version, payload, actor_type, actor_id, correlation_id)
      VALUES ('offer.activated', 1, 'atlas-api', 'offer', $1, 2, '{}', 'staff', $2, $3)`,
      [created.id, actorUserId, randomUUID()],
    );
    await assert.rejects(repository.approveOffer(actorUserId, created.id, randomUUID()), {
      code: '23505',
    });
    assert.equal((await repository.listSellerOffers(sellerId))[0]?.status, 'PENDING_REVIEW');
    assert.equal((await repository.listSellerOffers(sellerId))[0]?.rowVersion, 1);
    const audit = await pool.query(
      'SELECT action FROM platform.audit_events WHERE entity_id = $1',
      [created.id],
    );
    assert.deepEqual(
      audit.rows.map((row) => row['action']),
      ['offer.created'],
    );
  });

  it('serializes concurrent approval to one state transition and one activation event', async () => {
    const sellerId = await newSeller();
    const created = await repository.createOffer(sellerId, input(), context());
    const results = await Promise.allSettled([
      repository.approveOffer(actorUserId, created.id, randomUUID()),
      repository.approveOffer(actorUserId, created.id, randomUUID()),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    const rejected = results.find((r) => r.status === 'rejected');
    assert.equal(
      rejected?.status === 'rejected' &&
        rejected.reason instanceof CatalogWriteError &&
        rejected.reason.code === 'OFFER_NOT_PENDING',
      true,
    );
    const events = await pool.query(
      "SELECT count(*)::integer AS count FROM platform.outbox_events WHERE aggregate_id = $1 AND event_type = 'offer.activated'",
      [created.id],
    );
    assert.equal(events.rows[0]?.['count'], 1);
  });

  it('submits products privately with concurrent retry safety and seller isolation', async () => {
    const sellerId = await newSeller();
    const other = await newSeller();
    const category = (await repository.listProductCategories())[0];
    assert.ok(category);
    const data = {
      requestId: randomUUID(),
      categoryId: category.id,
      title: { fr: 'Produit proposé', ar: 'منتج مقترح' },
      description: { fr: 'Description de test', ar: 'وصف تجريبي' },
    };
    const [a, b] = await Promise.all([
      repository.submitProduct(sellerId, data, context()),
      repository.submitProduct(sellerId, data, context()),
    ]);
    assert.equal(a.id, b.id);
    assert.equal(a.status, 'PENDING_REVIEW');
    assert.equal(a.productId, null);
    assert.equal((await repository.listProductSubmissions(other)).length, 0);
    await assert.rejects(
      repository.submitProduct(
        sellerId,
        { ...data, title: { ...data.title, fr: 'Different' } },
        context(),
      ),
      (e: unknown) => e instanceof CatalogWriteError && e.code === 'PRODUCT_STATE_CONFLICT',
    );
    assert.equal(
      (
        await pool.query(
          'SELECT count(*)::int AS count FROM platform.outbox_events WHERE aggregate_id=$1',
          [a.id],
        )
      ).rows[0]?.['count'],
      1,
    );
    const review = await repository.reviewProduct(
      a.id,
      { decision: 'APPROVED', expectedVersion: 1 },
      context(),
    );
    assert.ok(review.productId);
    assert.equal(review.rowVersion, 2);
    assert.deepEqual(
      await repository.reviewProduct(a.id, { decision: 'APPROVED', expectedVersion: 1 }, context()),
      review,
    );
    const selected = (await repository.listOfferProducts()).find((p) => p.id === review.productId);
    assert.ok(selected);
    assert.equal(selected.imageUrl, '/assets/product-placeholder.svg');
    assert.equal(await repository.getProduct(selected.slug), null);
    const offer = await repository.createOffer(
      sellerId,
      { ...input(), productId: review.productId },
      context(),
    );
    assert.equal(await repository.getProduct(selected.slug), null);
    await repository.approveOffer(actorUserId, offer.id, randomUUID());
    assert.equal((await repository.getProduct(selected.slug))?.offers[0]?.id, offer.id);
    assert.equal(
      (
        await pool.query(
          'SELECT count(*)::int AS count FROM platform.outbox_events WHERE aggregate_id=$1',
          [a.id],
        )
      ).rows[0]?.['count'],
      2,
    );
  });

  it('keeps revisions private, owner-scoped, reviewable and linear without changing offers or product identity', async () => {
    const sellerId = await newSeller();
    const otherSeller = await newSeller();
    const categories = await repository.listProductCategories();
    const category = categories[0];
    assert.ok(category);
    const originalInput = {
      requestId: randomUUID(),
      categoryId: category.id,
      title: { fr: 'Original', ar: 'الأصل' },
      description: { fr: 'Description', ar: 'الوصف' },
    };
    const original = await repository.submitProduct(sellerId, originalInput, context());
    const approved = await repository.reviewProduct(
      original.id,
      { decision: 'APPROVED', expectedVersion: 1 },
      context(),
    );
    assert.ok(approved.productId);
    assert.equal(approved.canRevise, true);
    const entry = (await repository.listOfferProducts()).find((p) => p.id === approved.productId);
    assert.ok(entry);
    const offer = await repository.createOffer(
      sellerId,
      { ...input(), productId: approved.productId },
      context(),
    );
    await repository.approveOffer(actorUserId, offer.id, randomUUID());
    const before = await repository.getProduct(entry.slug);
    assert.ok(before);
    const revisionInput = {
      ...originalInput,
      requestId: randomUUID(),
      revisionOfSubmissionId: original.id,
      title: { fr: 'Correction', ar: 'تصحيح' },
    };
    const conflict = (e: unknown) =>
      e instanceof CatalogWriteError && e.code === 'PRODUCT_STATE_CONFLICT';
    await assert.rejects(repository.submitProduct(otherSeller, revisionInput, context()), conflict);
    if (categories[1])
      await assert.rejects(
        repository.submitProduct(
          sellerId,
          { ...revisionInput, categoryId: categories[1].id },
          context(),
        ),
        conflict,
      );
    const [draft, retried] = await Promise.all([
      repository.submitProduct(sellerId, revisionInput, context()),
      repository.submitProduct(sellerId, revisionInput, context()),
    ]);
    assert.equal(draft.id, retried.id);
    assert.deepEqual(draft.previous, {
      title: before.title,
      description: before.description,
      specs: before.specs ?? [],
    });
    assert.equal(draft.productId, null);
    assert.equal(draft.canRevise, false);
    assert.equal(await repository.getProductSubmission(otherSeller, draft.id), null);
    assert.equal((await repository.getProductSubmission(sellerId, original.id))?.canRevise, false);
    assert.deepEqual(await repository.getProduct(entry.slug), before);
    await assert.rejects(
      repository.submitProduct(sellerId, { ...revisionInput, requestId: randomUUID() }, context()),
      conflict,
    );
    await assert.rejects(
      repository.submitProduct(
        sellerId,
        { ...revisionInput, requestId: randomUUID(), revisionOfSubmissionId: draft.id },
        context(),
      ),
      conflict,
    );
    await repository.reviewProduct(
      draft.id,
      { decision: 'REJECTED', expectedVersion: 1, reason: 'Correction à préciser' },
      context(),
    );
    assert.equal((await repository.getProductSubmission(sellerId, original.id))?.canRevise, true);
    assert.deepEqual(await repository.getProduct(entry.slug), before);
    const replacementInput = { ...revisionInput, requestId: randomUUID() };
    const replacement = await repository.submitProduct(sellerId, replacementInput, context());
    const outcomes = await Promise.all([
      repository.reviewProduct(
        replacement.id,
        { decision: 'APPROVED', expectedVersion: 1 },
        context(),
      ),
      repository.reviewProduct(
        replacement.id,
        { decision: 'APPROVED', expectedVersion: 1 },
        context(),
      ),
    ]);
    assert.deepEqual(outcomes[0], outcomes[1]);
    assert.equal(outcomes[0]?.productId, approved.productId);
    assert.equal(outcomes[0]?.canRevise, true);
    const after = await repository.getProduct(entry.slug);
    assert.deepEqual(after, { ...before, title: revisionInput.title });
    assert.deepEqual(
      (await repository.getProductSubmission(sellerId, original.id))?.title,
      originalInput.title,
    );
    assert.equal((await repository.getProductSubmission(sellerId, original.id))?.canRevise, false);
    assert.equal(
      (await repository.submitProduct(sellerId, replacementInput, context())).id,
      replacement.id,
    );
    await assert.rejects(
      repository.submitProduct(sellerId, { ...revisionInput, requestId: randomUUID() }, context()),
      conflict,
    );
    const counts = await pool.query<{ variants: number; events: number; audits: number }>(
      `SELECT (SELECT count(*)::int FROM catalog.product_variants WHERE product_id=$1) AS variants,
      (SELECT count(*)::int FROM platform.outbox_events WHERE aggregate_id=$2) AS events,
      (SELECT count(*)::int FROM platform.audit_events WHERE entity_id=$2) AS audits`,
      [approved.productId, replacement.id],
    );
    assert.deepEqual(counts.rows[0], { variants: 1, events: 2, audits: 2 });
    const next = await repository.submitProduct(
      sellerId,
      { ...revisionInput, requestId: randomUUID(), revisionOfSubmissionId: replacement.id },
      context(),
    );
    assert.deepEqual(next.previous?.title, revisionInput.title);
  });

  it('rechecks revision eligibility at approval and rolls back published text when outbox persistence fails', async () => {
    const sellerId = await newSeller();
    const category = (await repository.listProductCategories())[0];
    assert.ok(category);
    const data = {
      requestId: randomUUID(),
      categoryId: category.id,
      title: { fr: 'Atomic original', ar: 'الأصل' },
      description: { fr: 'Original', ar: 'الأصل' },
    };
    const original = await repository.submitProduct(sellerId, data, context());
    const approved = await repository.reviewProduct(
      original.id,
      { decision: 'APPROVED', expectedVersion: 1 },
      context(),
    );
    const revision = await repository.submitProduct(
      sellerId,
      {
        ...data,
        requestId: randomUUID(),
        revisionOfSubmissionId: original.id,
        title: { fr: 'Atomic changed', ar: 'تعديل' },
      },
      context(),
    );
    await pool.query("UPDATE catalog.products SET status='INACTIVE' WHERE id=$1", [
      approved.productId,
    ]);
    await assert.rejects(
      repository.reviewProduct(
        revision.id,
        { decision: 'APPROVED', expectedVersion: 1 },
        context(),
      ),
      (e: unknown) => e instanceof CatalogWriteError && e.code === 'PRODUCT_STATE_CONFLICT',
    );
    await pool.query("UPDATE catalog.products SET status='ACTIVE' WHERE id=$1", [
      approved.productId,
    ]);
    await pool.query("UPDATE sellers.sellers SET status='SUSPENDED' WHERE id=$1", [sellerId]);
    await assert.rejects(
      repository.reviewProduct(
        revision.id,
        { decision: 'APPROVED', expectedVersion: 1 },
        context(),
      ),
      (e: unknown) => e instanceof CatalogWriteError && e.code === 'SELLER_NOT_APPROVED',
    );
    await pool.query("UPDATE sellers.sellers SET status='APPROVED' WHERE id=$1", [sellerId]);
    await pool.query(`CREATE FUNCTION catalog.fail_revision_event() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.event_type='product_submission.changed' THEN RAISE EXCEPTION 'synthetic revision failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_revision_event BEFORE INSERT ON platform.outbox_events FOR EACH ROW EXECUTE FUNCTION catalog.fail_revision_event()`);
    try {
      await assert.rejects(
        repository.reviewProduct(
          revision.id,
          { decision: 'APPROVED', expectedVersion: 1 },
          context(),
        ),
        /synthetic revision failure/,
      );
    } finally {
      await pool.query(
        'DROP TRIGGER fail_revision_event ON platform.outbox_events; DROP FUNCTION catalog.fail_revision_event()',
      );
    }
    assert.equal(
      (await repository.getProductSubmission(sellerId, revision.id))?.status,
      'PENDING_REVIEW',
    );
    assert.equal(
      (await pool.query('SELECT title_fr FROM catalog.products WHERE id=$1', [approved.productId]))
        .rows[0]?.['title_fr'],
      data.title.fr,
    );
    assert.equal(
      (
        await pool.query(
          'SELECT count(*)::int AS count FROM platform.audit_events WHERE entity_id=$1',
          [revision.id],
        )
      ).rows[0]?.['count'],
      1,
    );
    await repository.reviewProduct(
      revision.id,
      { decision: 'APPROVED', expectedVersion: 1 },
      context(),
    );
  });

  it('requires approved sellers and currently approved standard categories', async () => {
    const category = (await repository.listProductCategories())[0];
    assert.ok(category);
    const data = {
      requestId: randomUUID(),
      categoryId: category.id,
      title: { fr: 'Test', ar: 'تجربة' },
      description: { fr: 'Test', ar: 'تجربة' },
    };
    await assert.rejects(
      repository.submitProduct(await newSeller('PENDING_REVIEW'), data, context()),
      (e: unknown) => e instanceof CatalogWriteError && e.code === 'SELLER_NOT_APPROVED',
    );
    const sellerId = await newSeller();
    const draft = await repository.submitProduct(sellerId, data, context());
    await pool.query("UPDATE catalog.categories SET restriction_class='PROHIBITED' WHERE id=$1", [
      category.id,
    ]);
    try {
      assert.ok(!(await repository.listProductCategories()).some((c) => c.id === category.id));
      await assert.rejects(
        repository.submitProduct(sellerId, { ...data, requestId: randomUUID() }, context()),
      );
      await assert.rejects(
        repository.reviewProduct(draft.id, { decision: 'APPROVED', expectedVersion: 1 }, context()),
      );
      const rejected = await repository.reviewProduct(
        draft.id,
        { decision: 'REJECTED', reason: 'Catégorie interdite', expectedVersion: 1 },
        context(),
      );
      assert.equal(rejected.productId, null);
      assert.equal(rejected.reviewReason, 'Catégorie interdite');
    } finally {
      await pool.query("UPDATE catalog.categories SET restriction_class='STANDARD' WHERE id=$1", [
        category.id,
      ]);
    }
  });

  it('serializes competing review decisions and refuses stale or invalid rejection', async () => {
    const category = (await repository.listProductCategories())[0];
    assert.ok(category);
    const draft = await repository.submitProduct(
      await newSeller(),
      {
        requestId: randomUUID(),
        categoryId: category.id,
        title: { fr: 'Test course', ar: 'تجربة' },
        description: { fr: 'Test', ar: 'تجربة' },
      },
      context(),
    );
    await assert.rejects(
      repository.reviewProduct(
        draft.id,
        { decision: 'REJECTED', reason: ' ', expectedVersion: 1 },
        context(),
      ),
    );
    const results = await Promise.allSettled([
      repository.reviewProduct(draft.id, { decision: 'APPROVED', expectedVersion: 1 }, context()),
      repository.reviewProduct(
        draft.id,
        { decision: 'REJECTED', reason: 'Informations inexactes', expectedVersion: 1 },
        context(),
      ),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
    await assert.rejects(
      repository.reviewProduct(draft.id, { decision: 'APPROVED', expectedVersion: 99 }, context()),
    );
  });

  it('rolls back product, variant and review state if audit/outbox persistence fails', async () => {
    const sellerId = await newSeller();
    const category = (await repository.listProductCategories())[0];
    assert.ok(category);
    const draft = await repository.submitProduct(
      sellerId,
      {
        requestId: randomUUID(),
        categoryId: category.id,
        title: { fr: 'Atomic test', ar: 'تجربة' },
        description: { fr: 'Test', ar: 'تجربة' },
      },
      context(),
    );
    const beforeCount = (await pool.query('SELECT count(*)::int AS count FROM catalog.products'))
      .rows[0]?.['count'];
    await pool.query(`CREATE FUNCTION catalog.fail_product_event() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.event_type='product_submission.changed' THEN RAISE EXCEPTION 'synthetic outbox failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_product_event BEFORE INSERT ON platform.outbox_events FOR EACH ROW EXECUTE FUNCTION catalog.fail_product_event()`);
    try {
      await assert.rejects(
        repository.reviewProduct(draft.id, { decision: 'APPROVED', expectedVersion: 1 }, context()),
        /synthetic outbox failure/,
      );
    } finally {
      await pool.query(
        'DROP TRIGGER fail_product_event ON platform.outbox_events; DROP FUNCTION catalog.fail_product_event()',
      );
    }
    assert.equal(
      (await pool.query('SELECT count(*)::int AS count FROM catalog.products')).rows[0]?.['count'],
      beforeCount,
    );
    assert.equal((await repository.listProductSubmissions(sellerId))[0]?.status, 'PENDING_REVIEW');
    assert.equal(
      (
        await pool.query(
          'SELECT count(*)::int AS count FROM platform.audit_events WHERE entity_id=$1',
          [draft.id],
        )
      ).rows[0]?.['count'],
      1,
    );
  });

  it('reruns synthetic seeds without replacing stock and refuses conflicts with real rows', async () => {
    const offerId = SYNTHETIC_CATALOG_IDS.offers[0];
    await pool.query('UPDATE offers.offers SET available_quantity = 7 WHERE id = $1', [offerId]);
    await seedSyntheticCatalog(pool, 'test');
    assert.equal(
      (await pool.query('SELECT available_quantity FROM offers.offers WHERE id = $1', [offerId]))
        .rows[0]?.['available_quantity'],
      7,
    );
    await pool.query('UPDATE sellers.sellers SET is_synthetic = false WHERE id = $1', [
      SYNTHETIC_CATALOG_IDS.sellers[0],
    ]);
    try {
      await assert.rejects(seedSyntheticCatalog(pool, 'test'), /conflicts with existing/);
      assert.equal(
        (
          await pool.query('SELECT is_synthetic FROM sellers.sellers WHERE id = $1', [
            SYNTHETIC_CATALOG_IDS.sellers[0],
          ])
        ).rows[0]?.['is_synthetic'],
        false,
      );
    } finally {
      await pool.query('UPDATE sellers.sellers SET is_synthetic = true WHERE id = $1', [
        SYNTHETIC_CATALOG_IDS.sellers[0],
      ]);
    }
  });
});
