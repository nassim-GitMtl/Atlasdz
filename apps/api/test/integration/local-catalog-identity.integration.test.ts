import 'reflect-metadata';
import {
  PostgresDeliveryRepository,
  seedSyntheticDeliveryDestinations,
  seedReferenceDeliveryDestinations,
  SYNTHETIC_DELIVERY_IDS,
} from '@atlas/commerce';

import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import {
  PostgresCatalogRepository,
  seedSyntheticCatalog,
  SYNTHETIC_CATALOG_IDS,
} from '@atlas/catalog';
import {
  CatalogProductSchema,
  SellerOfferSchema,
  CustomerCartSchema,
  CheckoutQuoteSchema,
  CustomerOrderSchema,
  SellerOrderSchema,
  SellerDeliveryRateSchema,
  SessionListSchema,
  NotificationPageSchema,
  SupportDetailSchema,
  DeliveryDestinationSchema,
  OrderReviewsSchema,
  OwnReviewSchema,
  ReviewPageSchema,
  SellerReviewPageSchema,
  SellerReviewSchema,
  StaffReviewPageSchema,
  StaffReviewSchema,
} from '@atlas/contracts';
import { runMigrations, seedSyntheticData } from '@atlas/database';
import { AuthenticatePrincipal, PrincipalResolver } from '@atlas/identity';
import {
  PostgresIdentityAuthorizationRepository,
  PostgresSessionRepository,
} from '@atlas/identity-postgres';
import { createLogger, loadRuntimeConfig } from '@atlas/platform';
import type { INestApplication } from '@nestjs/common';
import { Client, Pool } from 'pg';
import request from 'supertest';
import { createApiApplication } from '../../src/bootstrap/http.js';
import { createLocalCatalogIdentity } from '../../src/identity/local-catalog-identity.js';
const deliveryContact = {
  recipientName: 'TEST Recipient',
  phone: '+00000000000',
  addressLine: '10 TEST Street',
  city: 'TEST City',
};

describe('LOCAL/TEST synthetic identity with PostgreSQL and catalog HTTP', () => {
  const sourceUrl = process.env['DATABASE_URL'];
  if (sourceUrl === undefined)
    throw new Error('DATABASE_URL is required for API integration tests');
  const databaseName = `atlas_local_identity_it_${randomBytes(8).toString('hex')}`;
  const adminUrl = new URL(sourceUrl);
  adminUrl.pathname = '/postgres';
  const testUrl = new URL(sourceUrl);
  testUrl.pathname = `/${databaseName}`;
  const admin = new Client({ connectionString: adminUrl.toString() });
  let databaseCreated = false;
  let pool: Pool;
  let app: INestApplication;
  let identity: ReturnType<typeof createLocalCatalogIdentity>;
  let authorization: PostgresIdentityAuthorizationRepository;
  let authentication: AuthenticatePrincipal;

  before(async () => {
    await admin.connect();
    // databaseName contains only a fixed prefix and locally generated hex digits.
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    databaseCreated = true;
    await runMigrations(testUrl.toString());
    await seedSyntheticData(testUrl.toString(), 'test');
    pool = new Pool({ connectionString: testUrl.toString(), max: 6 });
    await seedSyntheticCatalog(pool, 'test');
    await seedSyntheticDeliveryDestinations(pool, 'test');
    const delivery = new PostgresDeliveryRepository(pool, 'test');
    for (const sellerId of SYNTHETIC_CATALOG_IDS.sellers)
      await delivery.setSellerRate(
        sellerId,
        SYNTHETIC_CATALOG_IDS.adminUserId,
        SYNTHETIC_DELIVERY_IDS.destinations[0],
        {
          expectedVersion: 0,
          enabled: true,
          shippingFeeMinor: 50000,
          codCollector: 'SELLER_COURIER',
        },
        randomUUID(),
      );
    identity = createLocalCatalogIdentity(pool, 'test');
    authorization = new PostgresIdentityAuthorizationRepository(pool);
    authentication = new AuthenticatePrincipal(
      identity.credentialVerifier,
      new PrincipalResolver(authorization, { now: () => new Date() }),
    );
    const config = loadRuntimeConfig({
      NODE_ENV: 'test',
      SERVICE_NAME: 'atlas-local-catalog-integration',
      HOST: '127.0.0.1',
      PORT: '0',
      LOG_LEVEL: 'silent',
      DATABASE_URL: testUrl.toString(),
      DATABASE_SSL: 'false',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3002',
    });
    app = await createApiApplication({
      config,
      logger: createLogger({ service: config.serviceName, environment: 'test', level: 'silent' }),
      catalog: new PostgresCatalogRepository(pool),
      localSessionIssuer: identity,
      localCheckoutPolicy: {
        environment: 'test',
        customerId: '70000000-0000-4000-8000-000000000002',
        quoteLifetimeSeconds: 600,
        acceptanceWindowSeconds: 3600,
      },
      identity: {
        credentialVerifier: identity.credentialVerifier,
        authorizationRepository: authorization,
        sessionSelfServicePort: new PostgresSessionRepository(pool),
      },
      rateLimiter: {
        consume: async () => ({
          allowed: true,
          limit: 1000,
          remaining: 999,
          resetAfterSeconds: 60,
        }),
      },
    });
    await app.init();
  });

  after(async () => {
    await app?.close();
    await pool?.end();
    if (databaseCreated) await admin.query(`DROP DATABASE "${databaseName}"`);
    await admin.end();
  });

  it('resolves seller and admin through live scoped RBAC and persists labeled synthetic assurance', async () => {
    const seller = await identity.createSession('seller');
    const staff = await identity.createSession('admin');
    assert.notEqual(seller.accessToken, staff.accessToken);
    const sellerPrincipal = await authentication.execute(seller.accessToken);
    const adminPrincipal = await authentication.execute(staff.accessToken);
    assert.equal(sellerPrincipal.ok, true);
    assert.equal(adminPrincipal.ok, true);
    if (!sellerPrincipal.ok || !adminPrincipal.ok) return;
    assert.deepEqual(sellerPrincipal.principal.scope, {
      type: 'SELLER',
      id: SYNTHETIC_CATALOG_IDS.sellers[0],
    });
    assert.deepEqual(
      sellerPrincipal.principal.permissionGrants.map((grant) => grant.permission).sort(),
      [
        'delivery.manage',
        'delivery.read',
        'offer.create',
        'offer.read',
        'offer.update',
        'order.process',
        'order.read',
        'order.reject',
        'product.submit',
        'review.reply',
        'support.manage',
      ],
    );
    assert.deepEqual(adminPrincipal.principal.scope, { type: 'GLOBAL' });
    assert.deepEqual(
      adminPrincipal.principal.permissionGrants.map((grant) => grant.permission),
      ['offer.approve', 'support.escalations', 'product.review', 'review.moderate'],
    );
    const persisted = await pool.query<{
      token_hash: Buffer;
      device_label: string;
      assurance_level: string;
      mfa_completed_at: Date;
    }>(
      'SELECT token_hash, device_label, assurance_level, mfa_completed_at FROM identity.sessions WHERE id = $1',
      [sellerPrincipal.principal.sessionId],
    );
    assert.deepEqual(
      persisted.rows[0]?.token_hash,
      createHash('sha256').update(seller.accessToken).digest(),
    );
    assert.match(
      persisted.rows[0]?.device_label ?? '',
      /synthetic MFA fixture; no real authentication or MFA/,
    );
    assert.equal(persisted.rows[0]?.assurance_level, 'MFA');
    assert.ok(persisted.rows[0]?.mfa_completed_at instanceof Date);
    assert.throws(
      () => createLocalCatalogIdentity(pool, 'production'),
      /restricted to LOCAL and TEST/,
    );
    assert.throws(
      () => createLocalCatalogIdentity(pool, 'staging'),
      /restricted to LOCAL and TEST/,
    );
  });

  it('protects notification routes, validates input and rejects ownership overrides', async () => {
    const seller = await identity.createSession('seller');
    const customer = await identity.createSession('customer');
    const staff = await identity.createSession('admin');
    const agent = request(app.getHttpServer());
    await agent.get('/api/v1/notifications').expect(401);
    await agent
      .get('/api/v1/notifications')
      .auth(staff.accessToken, { type: 'bearer' })
      .expect(403);
    for (const credential of [seller, customer]) {
      const response = await agent
        .get('/api/v1/notifications')
        .auth(credential.accessToken, { type: 'bearer' })
        .expect(200);
      assert.equal(NotificationPageSchema.parse(response.body).unreadCount, 0);
      await agent
        .get('/api/v1/notifications?cursor=invalid')
        .auth(credential.accessToken, { type: 'bearer' })
        .expect(422);
      await agent
        .get(`/api/v1/notifications?sellerId=${randomUUID()}`)
        .auth(credential.accessToken, { type: 'bearer' })
        .expect(422);
      await agent
        .post('/api/v1/notifications/read')
        .auth(credential.accessToken, { type: 'bearer' })
        .send({ sellerOrderId: randomUUID(), version: 1, userId: randomUUID() })
        .expect(422);
      await agent
        .post('/api/v1/notifications/read')
        .auth(credential.accessToken, { type: 'bearer' })
        .send({ sellerOrderId: randomUUID(), version: 1 })
        .expect(404);
    }
  });

  it('rejects expired access claims and authoritative family revocation', async () => {
    const issued = await identity.createSession('seller');
    const result = await authentication.execute(issued.accessToken);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const expiredAuthentication = new AuthenticatePrincipal(
      identity.credentialVerifier,
      new PrincipalResolver(authorization, { now: () => new Date(issued.expiresAt) }),
    );
    assert.deepEqual(await expiredAuthentication.execute(issued.accessToken), {
      ok: false,
      code: 'ACCESS_TOKEN_EXPIRED',
    });
    await pool.query(
      `UPDATE identity.session_families
       SET revoked_at = clock_timestamp(), revoked_reason = 'Synthetic local revocation test'
       WHERE id = $1`,
      [result.principal.sessionFamilyId],
    );
    assert.deepEqual(await authentication.execute(issued.accessToken), {
      ok: false,
      code: 'CREDENTIAL_REJECTED',
    });
  });

  it('seller sign-out revokes the current family over HTTP without closing another seller device or customer', async () => {
    const seller = await identity.createSession('seller');
    const otherDevice = await identity.createSession('seller');
    const customer = await identity.createSession('customer');
    const agent = request(app.getHttpServer());
    const listed = await agent
      .get('/api/v1/auth/sessions')
      .auth(seller.accessToken, { type: 'bearer' })
      .expect(200);
    const current = SessionListSchema.parse(listed.body).sessions.filter((entry) => entry.current);
    assert.equal(current.length, 1);
    assert.ok(current[0]);
    await agent
      .delete(`/api/v1/auth/sessions/${current[0].id}`)
      .auth(seller.accessToken, { type: 'bearer' })
      .expect(204);
    for (const path of ['/api/v1/auth/sessions', '/api/v1/seller/offers', '/api/v1/seller/orders'])
      await agent.get(path).auth(seller.accessToken, { type: 'bearer' }).expect(401);
    await agent
      .get('/api/v1/seller/offers')
      .auth(otherDevice.accessToken, { type: 'bearer' })
      .expect(200);
    await agent.get('/api/v1/cart').auth(customer.accessToken, { type: 'bearer' }).expect(200);
    const persisted = await pool.query<{ revoked: boolean }>(
      'SELECT revoked_at IS NOT NULL AS revoked FROM identity.session_families WHERE id = $1',
      [current[0].id],
    );
    assert.equal(persisted.rows[0]?.revoked, true);
  });

  it('preserves fixture rows on repeated issuance and rejects conflicting roles atomically', async () => {
    const issued = await identity.createSession('admin');
    const baseline = await pool.query<{ count: string }>('SELECT count(*) FROM identity.sessions');
    await pool.query(
      "UPDATE identity.roles SET description = 'Not the synthetic fixture' WHERE code = 'LOCAL_TEST_CATALOG_ADMIN'",
    );
    try {
      await assert.rejects(identity.createSession('admin'), /verify local fixture data/);
      const afterConflict = await pool.query<{ count: string }>(
        'SELECT count(*) FROM identity.sessions',
      );
      assert.equal(afterConflict.rows[0]?.count, baseline.rows[0]?.count);
    } finally {
      await pool.query(
        `UPDATE identity.roles SET description = 'LOCAL/TEST synthetic catalog identity fixture'
         WHERE code = 'LOCAL_TEST_CATALOG_ADMIN'`,
      );
    }
    assert.equal((await authentication.execute(issued.accessToken)).ok, true);
    const repeated = await identity.createSession('admin');
    assert.notEqual(repeated.accessToken, issued.accessToken);
  });

  it('routes a seller-created offer through admin review into public discovery over real HTTP', async () => {
    const sellerResponse = await request(app.getHttpServer())
      .post('/api/v1/local/session')
      .send({ account: 'seller' })
      .expect(201);
    const adminResponse = await request(app.getHttpServer())
      .post('/api/v1/local/session')
      .send({ account: 'admin' })
      .expect(201);
    const sellerToken = (sellerResponse.body as { accessToken: string }).accessToken;
    const adminToken = (adminResponse.body as { accessToken: string }).accessToken;
    assert.equal(typeof sellerToken, 'string');
    assert.equal(typeof adminToken, 'string');
    const created = await request(app.getHttpServer())
      .post('/api/v1/seller/offers')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        productId: SYNTHETIC_CATALOG_IDS.products[1],
        priceMinor: 425000,
        availableQuantity: 7,
        handlingDays: 2,
        deliveryFeeMinor: 45000,
      })
      .expect(201);
    const offer = SellerOfferSchema.parse(created.body);
    assert.equal(offer.sellerId, SYNTHETIC_CATALOG_IDS.sellers[0]);
    assert.equal(offer.status, 'PENDING_REVIEW');
    const beforeApproval = await request(app.getHttpServer())
      .get('/api/v1/catalog/products/earbuds-wireless')
      .expect(200);
    assert.ok(
      !CatalogProductSchema.parse(beforeApproval.body).offers.some((item) => item.id === offer.id),
    );

    const sellerOffers = await request(app.getHttpServer())
      .get('/api/v1/seller/offers')
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(200);
    const ownOffers = SellerOfferSchema.array().parse(
      (sellerOffers.body as { items: unknown }).items,
    );
    assert.ok(ownOffers.every((item) => item.sellerId === SYNTHETIC_CATALOG_IDS.sellers[0]));
    assert.ok(ownOffers.some((item) => item.id === offer.id));
    await request(app.getHttpServer())
      .get('/api/v1/admin/offers')
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/offers/${offer.id}/approve`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(403);

    const queue = await request(app.getHttpServer())
      .get('/api/v1/admin/offers?status=PENDING_REVIEW')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.ok(
      SellerOfferSchema.array()
        .parse((queue.body as { items: unknown }).items)
        .some((item) => item.id === offer.id),
    );
    await request(app.getHttpServer())
      .post(`/api/v1/admin/offers/${offer.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    const publicResponse = await request(app.getHttpServer())
      .get('/api/v1/catalog/products/earbuds-wireless')
      .expect(200);
    assert.ok(
      CatalogProductSchema.parse(publicResponse.body).offers.some((item) => item.id === offer.id),
    );
    const repeatedApproval = await request(app.getHttpServer())
      .post(`/api/v1/admin/offers/${offer.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(repeatedApproval.status, 409);
  });

  it('serves the customer cart through live RBAC and rejects other actor types and ownership overrides', async () => {
    const session = await identity.createSession('customer');
    const principal = await authentication.execute(session.accessToken);
    assert.ok(principal.ok);
    if (!principal.ok) return;
    assert.equal(principal.principal.actorType, 'customer');
    assert.deepEqual(principal.principal.permissionGrants.map((grant) => grant.permission).sort(), [
      'cart.manage',
      'order.cancel',
      'order.confirm_delivery',
      'order.create',
      'order.read',
      'review.write',
      'support.manage',
    ]);
    const seller = await identity.createSession('seller');
    const staff = await identity.createSession('admin');
    await request(app.getHttpServer()).get('/api/v1/cart').expect(401);
    for (const token of [seller.accessToken, staff.accessToken]) {
      await request(app.getHttpServer())
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      await request(app.getHttpServer())
        .put(`/api/v1/cart/items/${SYNTHETIC_CATALOG_IDS.offers[0]}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 1, expectedVersion: 0 })
        .expect(403);
    }
    const empty = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    assert.equal(CustomerCartSchema.parse(empty.body).items.length, 0);
    const path = `/api/v1/cart/items/${SYNTHETIC_CATALOG_IDS.offers[0]}`;
    await request(app.getHttpServer())
      .put(path)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ quantity: 2, expectedVersion: 0, customerId: SYNTHETIC_CATALOG_IDS.adminUserId })
      .expect(422);
    const saved = await request(app.getHttpServer())
      .put(path)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ quantity: 2, expectedVersion: 0 })
      .expect(200);
    assert.equal(CustomerCartSchema.parse(saved.body).items[0]?.quantity, 2);
    const stale = await request(app.getHttpServer())
      .put(path)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ quantity: 3, expectedVersion: 0 })
      .expect(409);
    assert.equal((stale.body as { code: string }).code, 'CART_CONFLICT');
    await request(app.getHttpServer())
      .get('/api/v1/seller/offers')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/api/v1/auth/sessions/${principal.principal.sessionFamilyId}`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(401);
  });

  it('places an idempotent split order, isolates the seller inbox, and records scoped rejection/cancellation over HTTP', async () => {
    const customer = await identity.createSession('customer');
    const seller = await identity.createSession('seller');
    const bearer = `Bearer ${customer.accessToken}`;
    const current = CustomerCartSchema.parse(
      (
        await request(app.getHttpServer())
          .get('/api/v1/cart')
          .set('Authorization', bearer)
          .expect(200)
      ).body,
    );
    const cart = CustomerCartSchema.parse(
      (
        await request(app.getHttpServer())
          .put(`/api/v1/cart/items/${SYNTHETIC_CATALOG_IDS.offers[1]}`)
          .set('Authorization', bearer)
          .send({ quantity: 1, expectedVersion: current.version })
          .expect(200)
      ).body,
    );
    await request(app.getHttpServer())
      .post('/api/v1/checkout/quotes')
      .send({
        expectedCartVersion: cart.version,
        destinationId: SYNTHETIC_DELIVERY_IDS.destinations[0],
        deliveryContact,
      })
      .expect(401);
    for (const invalid of [
      { expectedCartVersion: cart.version, destinationId: SYNTHETIC_DELIVERY_IDS.destinations[0] },
      {
        expectedCartVersion: cart.version,
        destinationId: SYNTHETIC_DELIVERY_IDS.destinations[0],
        deliveryContact: { ...deliveryContact, phone: 'invalid' },
      },
      {
        expectedCartVersion: cart.version,
        destinationId: SYNTHETIC_DELIVERY_IDS.destinations[0],
        deliveryContact: { ...deliveryContact, sellerId: randomUUID() },
      },
    ])
      await request(app.getHttpServer())
        .post('/api/v1/checkout/quotes')
        .set('Authorization', bearer)
        .send(invalid)
        .expect(422);
    const quote = CheckoutQuoteSchema.parse(
      (
        await request(app.getHttpServer())
          .post('/api/v1/checkout/quotes')
          .set('Authorization', bearer)
          .send({
            expectedCartVersion: cart.version,
            destinationId: SYNTHETIC_DELIVERY_IDS.destinations[0],
            deliveryContact,
          })
          .expect(201)
      ).body,
    );
    await request(app.getHttpServer())
      .get(`/api/v1/checkout/quotes/${quote.id}`)
      .set('Authorization', `Bearer ${seller.accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/checkout/quotes/${quote.id}/place`)
      .set('Authorization', bearer)
      .send({})
      .expect(422);
    const submit = () =>
      request(app.getHttpServer())
        .post(`/api/v1/checkout/quotes/${quote.id}/place`)
        .set('Authorization', bearer)
        .set('Idempotency-Key', quote.id)
        .send({})
        .expect(200);
    const order = CustomerOrderSchema.parse((await submit()).body);
    assert.deepEqual(quote.deliveryContact, deliveryContact);
    assert.deepEqual(order.quote.deliveryContact, deliveryContact);
    await request(app.getHttpServer())
      .post(`/api/v1/checkout/quotes/${quote.id}/place`)
      .set('Authorization', bearer)
      .set('Idempotency-Key', quote.id)
      .send({ deliveryContact: { ...deliveryContact, city: 'CHANGED' } })
      .expect(422);
    assert.equal(CustomerOrderSchema.parse((await submit()).body).id, order.id);
    assert.equal(order.sellerOrders.length, 2);
    assert.equal(order.paymentState, 'NOT_APPLICABLE_TEST');
    const own = order.sellerOrders.find(
      (item) => item.snapshot.sellerId === SYNTHETIC_CATALOG_IDS.sellers[0],
    );
    const other = order.sellerOrders.find(
      (item) => item.snapshot.sellerId !== SYNTHETIC_CATALOG_IDS.sellers[0],
    );
    assert.ok(own && other);
    const inbox = SellerOrderSchema.array().parse(
      (
        (
          await request(app.getHttpServer())
            .get('/api/v1/seller/orders')
            .set('Authorization', `Bearer ${seller.accessToken}`)
            .expect(200)
        ).body as { items: unknown }
      ).items,
    );
    assert.ok(inbox.some((item) => item.id === own.id));
    assert.deepEqual(inbox.find((item) => item.id === own.id)?.deliveryContact, deliveryContact);
    assert.ok(inbox.every((item) => item.snapshot.sellerId === SYNTHETIC_CATALOG_IDS.sellers[0]));
    await request(app.getHttpServer())
      .get(`/api/v1/seller/orders/${other.id}`)
      .set('Authorization', `Bearer ${seller.accessToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/v1/seller/orders/${other.id}/reject`)
      .set('Authorization', `Bearer ${seller.accessToken}`)
      .send({ expectedVersion: 1, reasonCode: 'OUT_OF_STOCK' })
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/orders/${order.id}`)
      .set('Authorization', `Bearer ${seller.accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/seller/orders')
      .set('Authorization', bearer)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/seller/orders/${own.id}/reject`)
      .set('Authorization', `Bearer ${seller.accessToken}`)
      .send({ expectedVersion: 1, reasonCode: 'OUT_OF_STOCK' })
      .expect(200);
    const partial = CustomerOrderSchema.parse(
      (
        await request(app.getHttpServer())
          .get(`/api/v1/orders/${order.id}`)
          .set('Authorization', bearer)
          .expect(200)
      ).body,
    );
    assert.equal(partial.sellerOrders.find((item) => item.id === own.id)?.status, 'REJECTED');
    assert.equal(
      partial.sellerOrders.find((item) => item.id === other.id)?.status,
      'AWAITING_SELLER',
    );
    await request(app.getHttpServer())
      .post(`/api/v1/orders/seller-orders/${other.id}/cancel`)
      .set('Authorization', bearer)
      .send({ expectedVersion: 1 })
      .expect(200);
  });
  it('persists scoped seller shipping over HTTP and denies customer, staff, stale and owner-override writes', async () => {
    const seller = await identity.createSession('seller');
    const customer = await identity.createSession('customer');
    const staff = await identity.createSession('admin');
    const sellerAuth = `Bearer ${seller.accessToken}`;
    const destinationId = SYNTHETIC_DELIVERY_IDS.destinations[1];
    const path = `/api/v1/seller/delivery/${destinationId}`;
    const input = {
      expectedVersion: 0,
      enabled: true,
      shippingFeeMinor: 37550,
      codCollector: 'SELLER',
    };
    // Public reference data: guests choose their commune before an account exists.
    const anonymous = await request(app.getHttpServer())
      .get('/api/v1/delivery/destinations')
      .expect(200);
    assert.equal((anonymous.body as { items: unknown[] }).items.length, 2);
    const locations = await request(app.getHttpServer())
      .get('/api/v1/delivery/destinations')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .expect(200);
    assert.equal((locations.body as { items: unknown[] }).items.length, 2);
    for (const session of [customer, staff]) {
      await request(app.getHttpServer())
        .get('/api/v1/seller/delivery')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .post(path)
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send(input)
        .expect(403);
    }
    await request(app.getHttpServer())
      .post(path)
      .set('Authorization', sellerAuth)
      .send({ ...input, sellerId: SYNTHETIC_CATALOG_IDS.sellers[1] })
      .expect(422);
    const saved = SellerDeliveryRateSchema.parse(
      (
        await request(app.getHttpServer())
          .post(path)
          .set('Authorization', sellerAuth)
          .send(input)
          .expect(200)
      ).body,
    );
    assert.equal(saved.sellerId, SYNTHETIC_CATALOG_IDS.sellers[0]);
    assert.equal(saved.shippingFeeMinor, 37550);
    assert.deepEqual(
      SellerDeliveryRateSchema.parse(
        (
          await request(app.getHttpServer())
            .post(path)
            .set('Authorization', sellerAuth)
            .send(input)
            .expect(200)
        ).body,
      ),
      saved,
    );
    await request(app.getHttpServer())
      .post(path)
      .set('Authorization', sellerAuth)
      .send({ ...input, shippingFeeMinor: 40000 })
      .expect(409);
    await request(app.getHttpServer())
      .post('/api/v1/checkout/quotes')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ expectedCartVersion: 1 })
      .expect(422);
  });
  it('enforces processing scope and state order, then distinguishes seller delivery from customer receipt', async () => {
    const session = await identity.createSession('customer');
    const seller = await identity.createSession('seller');
    const customerAuth = `Bearer ${session.accessToken}`;
    const sellerAuth = `Bearer ${seller.accessToken}`;
    const current = CustomerCartSchema.parse(
      (
        await request(app.getHttpServer())
          .get('/api/v1/cart')
          .set('Authorization', customerAuth)
          .expect(200)
      ).body,
    );
    const cart = CustomerCartSchema.parse(
      (
        await request(app.getHttpServer())
          .put(`/api/v1/cart/items/${SYNTHETIC_CATALOG_IDS.offers[0]}`)
          .set('Authorization', customerAuth)
          .send({ quantity: 1, expectedVersion: current.version })
          .expect(200)
      ).body,
    );
    const quote = CheckoutQuoteSchema.parse(
      (
        await request(app.getHttpServer())
          .post('/api/v1/checkout/quotes')
          .set('Authorization', customerAuth)
          .send({
            expectedCartVersion: cart.version,
            destinationId: SYNTHETIC_DELIVERY_IDS.destinations[0],
            deliveryContact,
          })
          .expect(201)
      ).body,
    );
    const order = CustomerOrderSchema.parse(
      (
        await request(app.getHttpServer())
          .post(`/api/v1/checkout/quotes/${quote.id}/place`)
          .set('Authorization', customerAuth)
          .set('Idempotency-Key', quote.id)
          .send({})
          .expect(200)
      ).body,
    );
    const so = order.sellerOrders[0];
    assert.ok(so);
    const transition = (auth: string, body: object) =>
      request(app.getHttpServer())
        .post(`/api/v1/seller/orders/${so.id}/transition`)
        .set('Authorization', auth)
        .send(body);
    await transition(customerAuth, { action: 'ACCEPT', expectedVersion: 1 }).expect(403);
    await transition(sellerAuth, {
      action: 'ACCEPT',
      expectedVersion: 1,
      sellerId: randomUUID(),
    }).expect(422);
    await transition(sellerAuth, { action: 'PREPARE', expectedVersion: 1 }).expect(409);
    await request(app.getHttpServer())
      .post(`/api/v1/seller/orders/${so.id}/reject`)
      .set('Authorization', sellerAuth)
      .send({ expectedVersion: 1 })
      .expect(422);
    await transition(sellerAuth, { action: 'ACCEPT', expectedVersion: 1 }).expect(200);
    await transition(sellerAuth, { action: 'PREPARE', expectedVersion: 2 }).expect(200);
    await transition(sellerAuth, { action: 'SHIP', expectedVersion: 3 }).expect(422);
    await transition(sellerAuth, {
      action: 'SHIP',
      expectedVersion: 3,
      shipment: {
        method: 'SELLER_ARRANGED_TEST',
        carrier: 'TEST Carrier',
        trackingReference: 'TEST-HTTP-1',
      },
    }).expect(200);
    const confirm = (auth: string, version: number) =>
      request(app.getHttpServer())
        .post(`/api/v1/orders/seller-orders/${so.id}/confirm-delivery`)
        .set('Authorization', auth)
        .send({ expectedVersion: version });
    await confirm(customerAuth, 4).expect(409);
    await confirm(sellerAuth, 4).expect(403);
    const reported = SellerOrderSchema.parse(
      (await transition(sellerAuth, { action: 'REPORT_DELIVERY', expectedVersion: 4 }).expect(200))
        .body,
    );
    assert.equal(reported.status, 'DELIVERY_REPORTED');
    assert.equal(reported.history.at(-1)?.attribution, 'SELLER');
    const done = SellerOrderSchema.parse((await confirm(customerAuth, 5).expect(200)).body);
    assert.equal(done.status, 'DELIVERED');
    assert.equal(done.history.at(-1)?.attribution, 'CUSTOMER');
    assert.equal(done.paymentState, 'NOT_APPLICABLE_TEST');
    await request(app.getHttpServer()).get('/api/v1/support').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/admin/support')
      .set('Authorization', customerAuth)
      .expect(403);
    const supportInput = {
      sellerOrderId: so.id,
      category: 'RETURN_REQUEST',
      body: 'TEST request for seller assistance',
    };
    await request(app.getHttpServer())
      .post('/api/v1/support')
      .set('Authorization', sellerAuth)
      .send(supportInput)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/support')
      .set('Authorization', customerAuth)
      .send({ ...supportInput, customerId: randomUUID() })
      .expect(422);
    const opened = SupportDetailSchema.parse(
      (
        await request(app.getHttpServer())
          .post('/api/v1/support')
          .set('Authorization', customerAuth)
          .send(supportInput)
          .expect(201)
      ).body,
    );
    const found = await request(app.getHttpServer())
      .get(`/api/v1/support/order/${so.id}`)
      .set('Authorization', sellerAuth)
      .expect(200);
    assert.equal(SupportDetailSchema.parse(found.body.detail).case.id, opened.case.id);
    const supportAction = (auth: string, version: number, action: string, admin = false) =>
      request(app.getHttpServer())
        .post(`/api/v1/${admin ? 'admin/' : ''}support/${opened.case.id}`)
        .set('Authorization', auth)
        .send({
          expectedVersion: version,
          requestId: randomUUID(),
          action,
          body: 'TEST support reply and action',
        });
    await supportAction(sellerAuth, 1, 'CONFIRM_RESOLUTION').expect(403);
    await supportAction(sellerAuth, 1, 'REPLY').expect(200);
    await supportAction(customerAuth, 1, 'ESCALATE').expect(409);
    await supportAction(customerAuth, 2, 'ESCALATE').expect(200);
    const staff = await identity.createSession('admin');
    const resolved = SupportDetailSchema.parse(
      (await supportAction(`Bearer ${staff.accessToken}`, 3, 'STAFF_RESOLVE', true).expect(200))
        .body,
    );
    assert.equal(resolved.case.status, 'RESOLVED');
    assert.equal(resolved.messages.length, 4);
    const unchanged = SellerOrderSchema.parse(
      (
        await request(app.getHttpServer())
          .get(`/api/v1/seller/orders/${so.id}`)
          .set('Authorization', sellerAuth)
          .expect(200)
      ).body,
    );
    assert.equal(unchanged.version, done.version);
  });

  it('lets buyers review delivered items, sellers answer, staff hide, and keeps reviewers anonymous', async () => {
    const http = () => request(app.getHttpServer());
    const customerAuth = `Bearer ${(await identity.createSession('customer')).accessToken}`;
    const sellerAuth = `Bearer ${(await identity.createSession('seller')).accessToken}`;
    const staffAuth = `Bearer ${(await identity.createSession('admin')).accessToken}`;
    const offerId = SYNTHETIC_CATALOG_IDS.offers[0];
    let cart = CustomerCartSchema.parse(
      (await http().get('/api/v1/cart').set('Authorization', customerAuth).expect(200)).body,
    );
    for (const line of cart.items)
      cart = CustomerCartSchema.parse(
        (
          await http()
            .put(`/api/v1/cart/items/${line.offerId}`)
            .set('Authorization', customerAuth)
            .send({ quantity: 0, expectedVersion: cart.version })
            .expect(200)
        ).body,
      );
    cart = CustomerCartSchema.parse(
      (
        await http()
          .put(`/api/v1/cart/items/${offerId}`)
          .set('Authorization', customerAuth)
          .send({ quantity: 1, expectedVersion: cart.version })
          .expect(200)
      ).body,
    );
    const quote = CheckoutQuoteSchema.parse(
      (
        await http()
          .post('/api/v1/checkout/quotes')
          .set('Authorization', customerAuth)
          .send({
            expectedCartVersion: cart.version,
            destinationId: SYNTHETIC_DELIVERY_IDS.destinations[0],
            deliveryContact,
          })
          .expect(201)
      ).body,
    );
    const order = CustomerOrderSchema.parse(
      (
        await http()
          .post(`/api/v1/checkout/quotes/${quote.id}/place`)
          .set('Authorization', customerAuth)
          .set('Idempotency-Key', quote.id)
          .send({})
          .expect(200)
      ).body,
    );
    const so = order.sellerOrders[0];
    const productId = so?.snapshot.items[0]?.productId;
    assert.ok(so && productId);
    const transition = (body: object) =>
      http()
        .post(`/api/v1/seller/orders/${so.id}/transition`)
        .set('Authorization', sellerAuth)
        .send(body)
        .expect(200);
    await transition({ action: 'ACCEPT', expectedVersion: 1 });
    await transition({ action: 'PREPARE', expectedVersion: 2 });
    await transition({
      action: 'SHIP',
      expectedVersion: 3,
      shipment: {
        method: 'SELLER_ARRANGED_TEST',
        carrier: 'TEST Carrier',
        trackingReference: 'TEST-REVIEW-1',
      },
    });
    const mine = async () =>
      OrderReviewsSchema.parse(
        (
          await http()
            .get(`/api/v1/reviews/order/${so.id}`)
            .set('Authorization', customerAuth)
            .expect(200)
        ).body,
      );
    const write = (auth: string, body: object, product: string = productId) =>
      http().put(`/api/v1/reviews/order/${so.id}/${product}`).set('Authorization', auth).send(body);
    const review = { rating: 5, body: 'TEST great fryer, works well', expectedVersion: 0 };
    assert.equal((await mine()).canReview, false);
    assert.equal((await write(customerAuth, review).expect(409)).body.code, 'REVIEW_NOT_ALLOWED');
    await transition({ action: 'REPORT_DELIVERY', expectedVersion: 4 });
    assert.equal((await mine()).canReview, true);
    await write(sellerAuth, review).expect(403);
    await write(customerAuth, review, randomUUID()).expect(404);
    await write(customerAuth, { ...review, rating: 6 }).expect(422);
    await write(customerAuth, { ...review, customerId: randomUUID() }).expect(422);
    const created = OwnReviewSchema.parse((await write(customerAuth, review).expect(200)).body);
    assert.equal(created.version, 1);
    assert.equal(
      OwnReviewSchema.parse((await write(customerAuth, review).expect(200)).body).id,
      created.id,
    );
    await write(customerAuth, { ...review, rating: 4 }).expect(409);
    const edited = OwnReviewSchema.parse(
      (
        await write(customerAuth, {
          rating: 4,
          body: 'TEST good fryer',
          expectedVersion: 1,
        }).expect(200)
      ).body,
    );
    assert.equal(edited.version, 2);

    const catalog = (await http().get('/api/v1/catalog/products?limit=100').expect(200)).body as {
      items: { slug: string; offers: { id: string; seller: { slug: string } }[] }[];
    };
    const product = catalog.items.find((item) => item.offers.some((offer) => offer.id === offerId));
    const sellerSlug = product?.offers.find((offer) => offer.id === offerId)?.seller.slug;
    assert.ok(product && sellerSlug);
    const publicPage = async () =>
      ReviewPageSchema.parse(
        (await http().get(`/api/v1/catalog/products/${product.slug}/reviews`).expect(200)).body,
      );
    const visible = await publicPage();
    assert.equal(visible.summary.count, 1);
    assert.equal(visible.summary.average, 4);
    assert.deepEqual(visible.summary.stars, [0, 0, 0, 1, 0]);
    assert.equal(visible.items[0]?.body, 'TEST good fryer');
    assert.ok(
      !JSON.stringify(visible).includes('70000000-0000-4000-8000-000000000002'),
      'public reviews never identify the buyer',
    );
    await http().get('/api/v1/catalog/products/no-such-product/reviews').expect(404);
    await http().get(`/api/v1/catalog/products/${product.slug}/reviews?limit=5`).expect(422);

    const sellerPage = SellerReviewPageSchema.parse(
      (await http().get('/api/v1/seller/reviews').set('Authorization', sellerAuth).expect(200))
        .body,
    );
    assert.equal(sellerPage.items.find((item) => item.id === created.id)?.version, 2);
    await http().get('/api/v1/seller/reviews').set('Authorization', customerAuth).expect(403);
    const reply = (auth: string, version: number) =>
      http()
        .post(`/api/v1/seller/reviews/${created.id}/reply`)
        .set('Authorization', auth)
        .send({ body: 'TEST thank you for your order', expectedVersion: version });
    await reply(customerAuth, 2).expect(403);
    await reply(sellerAuth, 1).expect(409);
    assert.equal(
      SellerReviewSchema.parse((await reply(sellerAuth, 2).expect(200)).body).version,
      3,
    );
    assert.equal((await publicPage()).items[0]?.reply, 'TEST thank you for your order');

    const moderate = (auth: string, body: object) =>
      http().post(`/api/v1/admin/reviews/${created.id}`).set('Authorization', auth).send(body);
    await moderate(sellerAuth, {
      action: 'HIDE',
      reason: 'TEST insult',
      expectedVersion: 3,
    }).expect(403);
    await moderate(staffAuth, { action: 'HIDE', expectedVersion: 3 }).expect(422);
    const hidden = StaffReviewSchema.parse(
      (
        await moderate(staffAuth, {
          action: 'HIDE',
          reason: 'TEST off-topic',
          expectedVersion: 3,
        }).expect(200)
      ).body,
    );
    assert.equal(hidden.status, 'HIDDEN');
    assert.equal((await publicPage()).summary.count, 0);
    assert.equal((await mine()).items[0]?.review?.status, 'HIDDEN');
    const hiddenList = StaffReviewPageSchema.parse(
      (
        await http()
          .get('/api/v1/admin/reviews?status=HIDDEN')
          .set('Authorization', staffAuth)
          .expect(200)
      ).body,
    );
    assert.equal(hiddenList.items[0]?.id, created.id);
    await moderate(staffAuth, { action: 'PUBLISH', expectedVersion: 4 }).expect(200);
    const shop = ReviewPageSchema.parse(
      (await http().get(`/api/v1/catalog/sellers/${sellerSlug}/reviews`).expect(200)).body,
    );
    assert.equal(shop.summary.count, 1);

    const remove = (version: number) =>
      http()
        .delete(`/api/v1/reviews/order/${so.id}/${productId}?version=${version}`)
        .set('Authorization', customerAuth);
    await remove(4).expect(409);
    await remove(5).expect(200);
    assert.equal((await publicPage()).summary.count, 0);
    assert.equal((await mine()).items[0]?.review, null);
    const audit = await pool.query<{ action: string }>(
      `SELECT action, after_data, reason FROM platform.audit_events
       WHERE entity_type = 'product_review' AND entity_id = $1 ORDER BY occurred_at`,
      [created.id],
    );
    assert.deepEqual(
      audit.rows.map((row) => row.action),
      [
        'review.written',
        'review.written',
        'review.replied',
        'review.hidden',
        'review.published',
        'review.deleted',
      ],
    );
    assert.ok(
      !JSON.stringify(audit.rows).includes('fryer'),
      'review text never enters the audit trail',
    );
  });

  it('serves all reference communes and configures scoped wilaya and commune prices over HTTP', async () => {
    await seedReferenceDeliveryDestinations(pool, 'test');
    const seller = `Bearer ${(await identity.createSession('seller')).accessToken}`;
    const customer = `Bearer ${(await identity.createSession('customer')).accessToken}`;
    const locations = DeliveryDestinationSchema.array().parse(
      (
        await request(app.getHttpServer())
          .get('/api/v1/delivery/destinations')
          .set('Authorization', customer)
          .expect(200)
      ).body.items,
    );
    assert.equal(locations.filter((d) => d.dataClass === 'reference').length, 1541);
    const destination = locations.find((d) => d.wilaya?.code === '16');
    assert.ok(destination?.wilaya);
    const base = {
      expectedVersion: 0,
      enabled: true,
      shippingFeeMinor: 39750,
      codCollector: 'SELLER_COURIER',
    };
    const path = `/api/v1/seller/delivery/${destination.wilaya.id}`;
    await request(app.getHttpServer())
      .post(path)
      .set('Authorization', customer)
      .send(base)
      .expect(403);
    await request(app.getHttpServer())
      .post(path)
      .set('Authorization', seller)
      .send({ ...base, sellerId: randomUUID() })
      .expect(422);
    const saved = SellerDeliveryRateSchema.parse(
      (
        await request(app.getHttpServer())
          .post(path)
          .set('Authorization', seller)
          .send(base)
          .expect(200)
      ).body,
    );
    assert.equal(saved.destination.kind, 'WILAYA');
    assert.equal(saved.shippingFeeMinor, 39750);
    const communePath = `/api/v1/seller/delivery/${destination.id}`;
    const override = SellerDeliveryRateSchema.parse(
      (
        await request(app.getHttpServer())
          .post(communePath)
          .set('Authorization', seller)
          .send({ ...base, shippingFeeMinor: 51000 })
          .expect(200)
      ).body,
    );
    assert.equal(override.destination.wilaya?.id, saved.destination.id);
    const inherited = SellerDeliveryRateSchema.parse(
      (
        await request(app.getHttpServer())
          .post(communePath)
          .set('Authorization', seller)
          .send({ ...base, expectedVersion: 1, useWilayaRate: true })
          .expect(200)
      ).body,
    );
    assert.equal(inherited.useWilayaRate, true);
    await request(app.getHttpServer())
      .post(communePath)
      .set('Authorization', seller)
      .send({ ...base, expectedVersion: 1, enabled: false })
      .expect(409);
    const config = SellerDeliveryRateSchema.array().parse(
      (
        await request(app.getHttpServer())
          .get('/api/v1/seller/delivery')
          .set('Authorization', seller)
          .expect(200)
      ).body.items,
    );
    assert.ok(config.some((r) => r.id === saved.id));
    assert.ok(config.some((r) => r.id === inherited.id));
  });

  it('edits owned offers over HTTP and rejects stale, foreign and moderation overrides', async () => {
    const seller = `Bearer ${(await identity.createSession('seller')).accessToken}`;
    const customer = `Bearer ${(await identity.createSession('customer')).accessToken}`;
    const adminAuth = `Bearer ${(await identity.createSession('admin')).accessToken}`;
    const path = `/api/v1/seller/offers/${SYNTHETIC_CATALOG_IDS.offers[0]}`;
    const prior = SellerOfferSchema.parse(
      (await request(app.getHttpServer()).get(path).set('Authorization', seller).expect(200)).body,
    );
    const input = {
      expectedVersion: prior.rowVersion,
      priceMinor: prior.priceMinor + 1,
      availableQuantity: prior.availableQuantity,
      handlingDays: prior.handlingDays,
    };
    await request(app.getHttpServer()).post(path).send(input).expect(401);
    for (const token of [customer, adminAuth])
      await request(app.getHttpServer())
        .post(path)
        .set('Authorization', token)
        .send(input)
        .expect(403);
    for (const extra of [
      { status: 'APPROVED' },
      { sellerId: randomUUID() },
      { productId: randomUUID() },
      { deliveryFeeMinor: 0 },
    ])
      await request(app.getHttpServer())
        .post(path)
        .set('Authorization', seller)
        .send({ ...input, ...extra })
        .expect(422);
    await request(app.getHttpServer())
      .post(`/api/v1/seller/offers/${SYNTHETIC_CATALOG_IDS.offers[1]}`)
      .set('Authorization', seller)
      .send(input)
      .expect(404);
    const saved = SellerOfferSchema.parse(
      (
        await request(app.getHttpServer())
          .post(path)
          .set('Authorization', seller)
          .send(input)
          .expect(201)
      ).body,
    );
    assert.equal(saved.status, prior.status);
    await request(app.getHttpServer())
      .post(path)
      .set('Authorization', seller)
      .send(input)
      .expect(409);
    await request(app.getHttpServer())
      .post(path)
      .set('Authorization', seller)
      .send({ ...input, expectedVersion: saved.rowVersion, priceMinor: prior.priceMinor })
      .expect(201);
  });

  it('sells a pre-order: seller terms, explicit buyer acceptance, terms kept on the order', async () => {
    const http = () => request(app.getHttpServer());
    const seller = `Bearer ${(await identity.createSession('seller')).accessToken}`;
    const customer = `Bearer ${(await identity.createSession('customer')).accessToken}`;
    const offerId = SYNTHETIC_CATALOG_IDS.offers[0];
    const path = `/api/v1/seller/offers/${offerId}`;
    const prior = SellerOfferSchema.parse(
      (await http().get(path).set('Authorization', seller).expect(200)).body,
    );
    const terms = { minDays: 20, maxDays: 35, origin: 'Turquie' };
    const base = {
      priceMinor: prior.priceMinor,
      availableQuantity: Math.max(prior.availableQuantity, 5),
      handlingDays: prior.handlingDays,
    };
    await http()
      .post(path)
      .set('Authorization', seller)
      .send({ ...base, expectedVersion: prior.rowVersion, preorder: { ...terms, maxDays: 10 } })
      .expect(422);
    const preordered = SellerOfferSchema.parse(
      (
        await http()
          .post(path)
          .set('Authorization', seller)
          .send({ ...base, expectedVersion: prior.rowVersion, preorder: terms })
          .expect(201)
      ).body,
    );
    assert.deepEqual(preordered.preorder, terms);
    const listed = (await http().get('/api/v1/catalog/products?limit=100').expect(200)).body as {
      items: { offers: { id: string; preorder: unknown }[] }[];
    };
    assert.deepEqual(
      listed.items.flatMap((p) => p.offers).find((o) => o.id === offerId)?.preorder,
      terms,
    );

    let cart = CustomerCartSchema.parse(
      (await http().get('/api/v1/cart').set('Authorization', customer).expect(200)).body,
    );
    for (const line of cart.items)
      cart = CustomerCartSchema.parse(
        (
          await http()
            .put(`/api/v1/cart/items/${line.offerId}`)
            .set('Authorization', customer)
            .send({ quantity: 0, expectedVersion: cart.version })
            .expect(200)
        ).body,
      );
    cart = CustomerCartSchema.parse(
      (
        await http()
          .put(`/api/v1/cart/items/${offerId}`)
          .set('Authorization', customer)
          .send({ quantity: 1, expectedVersion: cart.version })
          .expect(200)
      ).body,
    );
    assert.deepEqual(cart.items[0]?.offer?.preorder, terms);
    const quoteInput = {
      expectedCartVersion: cart.version,
      destinationId: SYNTHETIC_DELIVERY_IDS.destinations[0],
      deliveryContact,
    };
    const refused = await http()
      .post('/api/v1/checkout/quotes')
      .set('Authorization', customer)
      .send(quoteInput)
      .expect(422);
    assert.equal(refused.body.code, 'PREORDER_ACCEPTANCE_REQUIRED');
    const quote = CheckoutQuoteSchema.parse(
      (
        await http()
          .post('/api/v1/checkout/quotes')
          .set('Authorization', customer)
          .send({ ...quoteInput, acceptPreorder: true })
          .expect(201)
      ).body,
    );
    assert.equal(quote.preorderAccepted, true);
    const order = CustomerOrderSchema.parse(
      (
        await http()
          .post(`/api/v1/checkout/quotes/${quote.id}/place`)
          .set('Authorization', customer)
          .set('Idempotency-Key', quote.id)
          .send({})
          .expect(200)
      ).body,
    );
    assert.deepEqual(order.sellerOrders[0]?.snapshot.items[0]?.preorder, terms);

    // Back in stock: later orders need no acceptance, existing orders keep their terms.
    const restocked = SellerOfferSchema.parse(
      (await http().get(path).set('Authorization', seller).expect(200)).body,
    );
    const inStock = SellerOfferSchema.parse(
      (
        await http()
          .post(path)
          .set('Authorization', seller)
          .send({ ...base, expectedVersion: restocked.rowVersion, preorder: null })
          .expect(201)
      ).body,
    );
    assert.equal(inStock.preorder ?? null, null);
  });
});
