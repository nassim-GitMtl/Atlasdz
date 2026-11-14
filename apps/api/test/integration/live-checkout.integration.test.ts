import 'reflect-metadata';

import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { seedReferenceDeliveryDestinations } from '@atlas/commerce';
import { runMigrations } from '@atlas/database';
import { createLogger, loadRuntimeConfig } from '@atlas/platform';
import type { INestApplication } from '@nestjs/common';
import { Client, Pool } from 'pg';
import request from 'supertest';

import { createApiApplication } from '../../src/bootstrap/http.js';
import {
  base32Decode,
  TOTP_PERIOD_SECONDS,
  totpCode,
} from '../../src/identity/password/credential-crypto.js';
import { PasswordIdentityRepository } from '../../src/identity/password/password-identity.js';
import { LogMailer } from '../../src/notifications/mailer.js';
import { MarketplaceNotifier } from '../../src/notifications/marketplace-notifier.js';
import { OutboxDispatcher } from '../../src/notifications/outbox-dispatcher.js';
import { createLogger as createTestLogger } from '@atlas/platform';

const settle = async (check: () => boolean) => {
  for (let attempt = 0; attempt < 50 && !check(); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

const password = 'correct horse battery 42';

describe('LIVE cash-on-delivery marketplace journey', () => {
  const sourceUrl = process.env['DATABASE_URL'];
  if (sourceUrl === undefined)
    throw new Error('DATABASE_URL is required for API integration tests');
  const databaseName = `atlas_live_checkout_it_${randomBytes(8).toString('hex')}`;
  const adminUrl = new URL(sourceUrl);
  adminUrl.pathname = '/postgres';
  const testUrl = new URL(sourceUrl);
  testUrl.pathname = `/${databaseName}`;
  const admin = new Client({ connectionString: adminUrl.toString() });
  let databaseCreated = false;
  let pool: Pool;
  let app: INestApplication;
  let identity: PasswordIdentityRepository;
  let mediaDirectory: string;
  const mailer = new LogMailer();
  const texts: { to: string; message: string }[] = [];
  const sms = {
    send: async (to: string, message: string) => {
      texts.push({ to, message });
    },
  };
  const step = Math.floor(Date.now() / 1000 / TOTP_PERIOD_SECONDS);

  before(async () => {
    await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    databaseCreated = true;
    await runMigrations(testUrl.toString());
    pool = new Pool({ connectionString: testUrl.toString(), max: 4 });
    await seedReferenceDeliveryDestinations(pool, 'live');
    identity = new PasswordIdentityRepository(pool, randomBytes(32));
    mediaDirectory = await mkdtemp(join(tmpdir(), 'atlas-media-it-'));
    const config = loadRuntimeConfig({
      NODE_ENV: 'test',
      SERVICE_NAME: 'atlas-live-checkout-integration',
      HOST: '127.0.0.1',
      PORT: '0',
      LOG_LEVEL: 'silent',
      DATABASE_URL: testUrl.toString(),
      DATABASE_SSL: 'false',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3001',
    });
    app = await createApiApplication({
      config,
      logger: createLogger({ service: config.serviceName, environment: 'test', level: 'silent' }),
      passwordIdentity: identity,
      mediaDirectory,
      mailer,
      sms,
      links: {
        sellerWebOrigin: 'https://seller.example.dz',
        customerWebOrigin: 'http://localhost:3001',
      },
      liveCheckoutPolicy: {
        environment: 'live',
        quoteLifetimeSeconds: 900,
        acceptanceWindowSeconds: 48 * 3600,
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
    if (mediaDirectory) await rm(mediaDirectory, { recursive: true, force: true });
    await admin.end();
  });

  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** Enroll TOTP and return an MFA session; each call uses a fresh time step (no replay). */
  async function mfaLogin(email: string): Promise<string> {
    const enrollment = await http()
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const secret = base32Decode(enrollment.body.secret as string);
    const login = await http()
      .post('/api/v1/auth/login')
      .send({ email, password, totpCode: totpCode(secret, step) })
      .expect(200);
    return login.body.accessToken as string;
  }

  it('runs registration → approvals → COD order → seller delivery → customer confirmation', async () => {
    // Seller onboarding and staff approval.
    await http()
      .post('/api/v1/auth/register/seller')
      .send({
        email: 'boutique@example.dz',
        password,
        storeName: 'Boutique Tlemcen',
        descriptionFr: 'Artisanat de Tlemcen',
        descriptionAr: 'صناعة تقليدية من تلمسان',
      })
      .expect(201);
    await identity.createStaff('ops@example.dz', password);
    const seller = await mfaLogin('boutique@example.dz');
    const staff = await mfaLogin('ops@example.dz');
    const account = await http().get('/api/v1/seller/account').set(bearer(seller)).expect(200);
    await http()
      .post(`/api/v1/admin/sellers/${account.body.sellerId}/review`)
      .set(bearer(staff))
      .send({ decision: 'APPROVE' })
      .expect(200);

    // Product proposal on a real launch category, approved by staff.
    const categories = await http()
      .get('/api/v1/seller/products/categories')
      .set(bearer(seller))
      .expect(200);
    const category = categories.body.items.find(
      (item: { slug: string }) => item.slug === 'artisanat',
    );
    assert.ok(category, 'starter launch category exists');
    const submission = await http()
      .post('/api/v1/seller/products')
      .set(bearer(seller))
      .send({
        requestId: randomUUID(),
        categoryId: category.id,
        title: { fr: 'Plateau en cuivre', ar: 'صينية نحاسية' },
        description: { fr: 'Fait main à Tlemcen.', ar: 'مصنوعة يدويًا في تلمسان.' },
      })
      .expect(201);
    const reviewed = await http()
      .post(`/api/v1/admin/products/${submission.body.id}/review`)
      .set(bearer(staff))
      .send({ decision: 'APPROVED', expectedVersion: submission.body.rowVersion })
      .expect((response) => assert.ok([200, 201].includes(response.status)));
    const productId = reviewed.body.productId as string;
    assert.ok(productId);

    // Product photo: magic bytes are checked, then served publicly from /media.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    await http()
      .post(`/api/v1/seller/products/${productId}/image`)
      .set(bearer(seller))
      .set('Content-Type', 'image/png')
      .send(Buffer.from('<svg onload=alert(1)>'))
      .expect(415);
    const photo = await http()
      .post(`/api/v1/seller/products/${productId}/image`)
      .set(bearer(seller))
      .set('Content-Type', 'image/png')
      .send(png)
      .expect(201);
    // Uploads are re-encoded to metadata-free WebP.
    assert.match(photo.body.imageUrl, /^\/media\/[0-9a-f-]{36}\.webp$/);
    const served = await http().get(photo.body.imageUrl).expect(200);
    assert.equal(served.headers['content-type'], 'image/webp');
    assert.equal((served.body as Buffer).subarray(8, 12).toString('latin1'), 'WEBP');
    // A 640 px variant is stored for cards and thumbnails.
    const variant = (url: string) => url.replace('.webp', '-640.webp');
    await http().get(variant(photo.body.imageUrl)).expect(200).expect('content-type', 'image/webp');
    // Photos stored before variants existed are served at full size for the variant name.
    const legacy = randomUUID();
    await writeFile(join(mediaDirectory, `${legacy}.webp`), served.body as Buffer);
    await http().get(`/media/${legacy}-640.webp`).expect(200);
    // Replacing a photo deletes the previous files (no lingering copies after a change).
    const replaced = await http()
      .post(`/api/v1/seller/products/${productId}/image`)
      .set(bearer(seller))
      .set('Content-Type', 'image/png')
      .send(png)
      .expect(201);
    await http().get(photo.body.imageUrl).expect(404).expect('cache-control', 'no-store');
    await http().get(variant(photo.body.imageUrl)).expect(404);
    await http().get(replaced.body.imageUrl).expect(200);
    // Removing a photo deletes both sizes for good.
    await http()
      .post(`/api/v1/seller/products/${productId}/image/remove`)
      .set(bearer(seller))
      .expect(200);
    await http().get(replaced.body.imageUrl).expect(404);
    await http().get(variant(replaced.body.imageUrl)).expect(404);
    await http()
      .post(`/api/v1/seller/products/${productId}/image/remove`)
      .set(bearer(seller))
      .expect(404);
    const photoAgain = await http()
      .post(`/api/v1/seller/products/${productId}/image`)
      .set(bearer(seller))
      .set('Content-Type', 'image/png')
      .send(png)
      .expect(201);
    await http().get('/media/..%2Fetc%2Fpasswd').expect(404);
    await http()
      .post(`/api/v1/seller/products/${productId}/image`)
      .set(bearer(staff))
      .set('Content-Type', 'image/png')
      .send(png)
      .expect(403);

    // Offer, staff approval and a wilaya-scoped delivery rate.
    const offer = await http()
      .post('/api/v1/seller/offers')
      .set(bearer(seller))
      .send({
        productId,
        priceMinor: 450000,
        availableQuantity: 3,
        handlingDays: 2,
        deliveryFeeMinor: 0,
      })
      .expect(201);
    await http()
      .post(`/api/v1/admin/offers/${offer.body.id}/approve`)
      .set(bearer(staff))
      .expect((response) => assert.ok([200, 201].includes(response.status)));
    const destinations = await http()
      .get('/api/v1/delivery/destinations')
      .set(bearer(seller))
      .expect(200);
    assert.equal(destinations.body.items.length, 1541);
    const listed = await http().get('/api/v1/catalog/products').expect(200);
    assert.equal(listed.body.items[0]?.imageUrl, photoAgain.body.imageUrl);
    const searched = await http().get('/api/v1/catalog/products?query=Tlemcen').expect(200);
    assert.equal(searched.body.items.length, 1, 'search matches product descriptions');
    const destination = destinations.body.items[0];
    await http()
      .post(`/api/v1/seller/delivery/${destination.id}`)
      .set(bearer(seller))
      .send({
        expectedVersion: 0,
        enabled: true,
        shippingFeeMinor: 60000,
        codCollector: 'SELLER_COURIER',
      })
      .expect((response) => assert.ok([200, 201].includes(response.status)));

    // Customer registers, fills the cart and places a cash-on-delivery order.
    await http()
      .post('/api/v1/auth/register/customer')
      .send({ email: 'client@example.dz', password, origin: 'http://localhost:3001' })
      .expect(201);
    const customer = (
      await http()
        .post('/api/v1/auth/login')
        .send({ email: 'client@example.dz', password })
        .expect(200)
    ).body.accessToken as string;
    const cart = await http().get('/api/v1/cart').set(bearer(customer)).expect(200);
    const filled = await http()
      .put(`/api/v1/cart/items/${offer.body.id}`)
      .set(bearer(customer))
      .send({ quantity: 2, expectedVersion: cart.body.version })
      .expect(200);
    const quote = await http()
      .post('/api/v1/checkout/quotes')
      .set(bearer(customer))
      .send({
        expectedCartVersion: filled.body.version,
        destinationId: destination.id,
        deliveryContact: {
          recipientName: 'Amina B.',
          phone: '+213555000000',
          addressLine: '12 rue des Oliviers',
          city: 'Tlemcen',
        },
      })
      .expect(201);
    assert.equal(quote.body.dataClass, 'live');
    assert.equal(quote.body.paymentArrangement, 'CASH_ON_DELIVERY');
    assert.equal(quote.body.totalMinor, 2 * 450000 + 60000);
    // An unconfirmed email no longer blocks ordering (guest checkout); it keeps the
    // new-account limit instead. Confirming still works through the emailed link.
    await settle(() => mailer.sent.some((mail) => mail.to === 'client@example.dz'));
    const verifyLink = /verify-email\?token=([A-Za-z0-9_-]{43})/.exec(
      mailer.sent.find((mail) => mail.to === 'client@example.dz')?.text ?? '',
    );
    assert.ok(verifyLink);
    await http()
      .post('/api/v1/auth/email/verify')
      .send({ token: 'x'.repeat(43) })
      .expect(422);
    await http().post('/api/v1/auth/email/verify').send({ token: verifyLink[1] }).expect(200);
    await http().post('/api/v1/auth/email/verify').send({ token: verifyLink[1] }).expect(422);
    // With an SMS gateway configured, the customer must confirm a phone number first.
    const needsPhone = await http()
      .post(`/api/v1/checkout/quotes/${quote.body.id}/place`)
      .set(bearer(customer))
      .set('Idempotency-Key', quote.body.id)
      .send({})
      .expect(403);
    assert.equal(needsPhone.body.code, 'PHONE_NOT_VERIFIED');
    await http()
      .post('/api/v1/account/phone/start')
      .set(bearer(customer))
      .send({ phone: '0555 00 00 00' })
      .expect(202);
    assert.equal(texts.at(-1)?.to, '+213555000000');
    const smsCode = /([0-9]{6})/.exec(texts.at(-1)?.message ?? '')?.[1] ?? '';
    await http()
      .post('/api/v1/account/phone/confirm')
      .set(bearer(customer))
      .send({ phone: '+213555000000', code: smsCode === '000000' ? '111111' : '000000' })
      .expect(422);
    await http()
      .post('/api/v1/account/phone/confirm')
      .set(bearer(customer))
      .send({ phone: '+213555000000', code: smsCode })
      .expect(200);
    // SMS bombing: one number gets at most 5 codes a day, whichever accounts ask for them.
    const victim = '+213555999999';
    const codeTo = (token: string, status: number) =>
      http()
        .post('/api/v1/account/phone/start')
        .set(bearer(token))
        .send({ phone: victim })
        .expect(status);
    const anotherCustomer = async (email: string) => {
      await http().post('/api/v1/auth/register/customer').send({ email, password }).expect(201);
      return (await http().post('/api/v1/auth/login').send({ email, password }).expect(200)).body
        .accessToken as string;
    };
    await codeTo(customer, 202);
    await codeTo(customer, 202);
    const second = await anotherCustomer('second@example.dz');
    for (let i = 0; i < 3; i += 1) await codeTo(second, 202);
    await codeTo(await anotherCustomer('third@example.dz'), 429);
    assert.equal(texts.filter((text) => text.to === victim).length, 5);
    const order = await http()
      .post(`/api/v1/checkout/quotes/${quote.body.id}/place`)
      .set(bearer(customer))
      .set('Idempotency-Key', quote.body.id)
      .send({})
      .expect(200);
    assert.equal(order.body.paymentState, 'CASH_ON_DELIVERY');
    const sellerOrder = order.body.sellerOrders[0];
    assert.equal(sellerOrder.dataClass, 'live');

    // A brand-new account may only have one open COD order.
    const cart2 = await http().get('/api/v1/cart').set(bearer(customer)).expect(200);
    const refilled = await http()
      .put(`/api/v1/cart/items/${offer.body.id}`)
      .set(bearer(customer))
      .send({ quantity: 1, expectedVersion: cart2.body.version })
      .expect(200);
    const quote2 = await http()
      .post('/api/v1/checkout/quotes')
      .set(bearer(customer))
      .send({
        expectedCartVersion: refilled.body.version,
        destinationId: destination.id,
        deliveryContact: {
          recipientName: 'Amina B.',
          phone: '0555000000',
          addressLine: '12 rue des Oliviers',
          city: 'Tlemcen',
        },
      })
      .expect(201);
    const limited = await http()
      .post(`/api/v1/checkout/quotes/${quote2.body.id}/place`)
      .set(bearer(customer))
      .set('Idempotency-Key', quote2.body.id)
      .send({})
      .expect(409);
    assert.equal(limited.body.code, 'COD_LIMIT_REACHED');
    // Retrying the already-placed first quote still returns the same order.
    await http()
      .post(`/api/v1/checkout/quotes/${quote.body.id}/place`)
      .set(bearer(customer))
      .set('Idempotency-Key', quote.body.id)
      .send({})
      .expect(200);

    const signal = await http()
      .get(`/api/v1/seller/orders/${sellerOrder.id}/customer-signal`)
      .set(bearer(seller))
      .expect(200);
    assert.deepEqual(signal.body, {
      phoneVerified: true,
      emailVerified: true,
      deliveryPhoneVerified: true,
      deliveredOrders: 0,
      failedDeliveries: 0,
      cancelledOrders: 0,
      accountAgeDays: 0,
    });
    assert.equal(sellerOrder.delivery, 'SELLER_DELIVERY');

    // Seller fulfils: a test shipment method is refused on a live order.
    const transition = (body: Record<string, unknown>, status = 200) =>
      http()
        .post(`/api/v1/seller/orders/${sellerOrder.id}/transition`)
        .set(bearer(seller))
        .send(body)
        .expect(status);
    await transition({ action: 'ACCEPT', expectedVersion: 1 });
    await transition({ action: 'PREPARE', expectedVersion: 2 });
    await transition(
      {
        action: 'SHIP',
        expectedVersion: 3,
        shipment: {
          method: 'SELLER_ARRANGED_TEST',
          carrier: 'Yalidine',
          trackingReference: 'YAL123',
        },
      },
      409,
    );
    await transition({
      action: 'SHIP',
      expectedVersion: 3,
      shipment: { method: 'SELLER_ARRANGED', carrier: 'Yalidine', trackingReference: 'YAL123' },
    });
    await transition({ action: 'REPORT_DELIVERY', expectedVersion: 4 });
    const confirmed = await http()
      .post(`/api/v1/orders/seller-orders/${sellerOrder.id}/confirm-delivery`)
      .set(bearer(customer))
      .send({ expectedVersion: 5 })
      .expect(200);
    assert.equal(confirmed.body.status, 'DELIVERED');
    await settle(
      () =>
        mailer.sent.filter((mail) => mail.to === 'client@example.dz').length >= 5 &&
        mailer.sent.some(
          (mail) => mail.to === 'boutique@example.dz' && /Nouvelle commande/.test(mail.subject),
        ),
    );
    const customerMail = mailer.sent.filter((mail) => mail.to === 'client@example.dz');
    assert.ok(customerMail.some((mail) => /Commande enregistrée/.test(mail.subject)));
    assert.ok(customerMail.some((mail) => /expédié.*\n.*YAL123/s.test(mail.text)));
    assert.ok(customerMail.some((mail) => /Confirmez la réception/.test(mail.text)));
    assert.ok(
      mailer.sent.some(
        (mail) =>
          mail.to === 'boutique@example.dz' &&
          mail.text.includes(`https://seller.example.dz/orders/${sellerOrder.id}`),
      ),
    );

    // Staff tools: dashboard, categories, suspension and photo takedown.
    const dashboard = await http().get('/api/v1/admin/dashboard').set(bearer(staff)).expect(200);
    assert.equal(dashboard.body.orders24h, 1);
    assert.equal(dashboard.body.deliveredValue30dMinor, 2 * 450000 + 60000);
    assert.equal(dashboard.body.activeSellers, 1);
    await http().get('/api/v1/admin/dashboard').set(bearer(seller)).expect(403);
    await http()
      .post('/api/v1/admin/categories')
      .set(bearer(staff))
      .send({ slug: 'jardin', titleFr: 'Jardin', titleAr: 'الحديقة' })
      .expect(201);
    await http()
      .post('/api/v1/admin/categories')
      .set(bearer(staff))
      .send({ slug: 'jardin', titleFr: 'Jardin', titleAr: 'الحديقة' })
      .expect(409);
    const allCategories = await http()
      .get('/api/v1/admin/categories')
      .set(bearer(staff))
      .expect(200);
    const garden = allCategories.body.items.find((c: { slug: string }) => c.slug === 'jardin');
    await http()
      .post(`/api/v1/admin/categories/${garden.id}`)
      .set(bearer(staff))
      .send({
        titleFr: 'Jardin',
        titleAr: 'الحديقة',
        status: 'INACTIVE',
        restrictionClass: 'STANDARD',
      })
      .expect(200);
    await http()
      .post(`/api/v1/admin/sellers/${account.body.sellerId}/status`)
      .set(bearer(staff))
      .send({ status: 'SUSPENDED' })
      .expect(422);
    await http()
      .post(`/api/v1/admin/sellers/${account.body.sellerId}/status`)
      .set(bearer(staff))
      .send({ status: 'SUSPENDED', reason: 'Plaintes clients' })
      .expect(200);
    assert.equal((await http().get('/api/v1/catalog/products').expect(200)).body.items.length, 0);
    await http()
      .post(`/api/v1/admin/sellers/${account.body.sellerId}/status`)
      .set(bearer(staff))
      .send({ status: 'APPROVED' })
      .expect(200);
    assert.equal((await http().get('/api/v1/catalog/products').expect(200)).body.items.length, 1);
    await http()
      .post(`/api/v1/admin/products/${productId}/photo/remove`)
      .set(bearer(staff))
      .expect(200);
    assert.equal(
      (await http().get('/api/v1/catalog/products').expect(200)).body.items[0].imageUrl,
      '/assets/product-placeholder.svg',
    );
    // A takedown makes the photo unavailable, not just unlinked.
    await http().get(photoAgain.body.imageUrl).expect(404);
    await http().get(variant(photoAgain.body.imageUrl)).expect(404);

    // Outbox dispatcher: an EXPIRED live seller order emails the customer; all events drain.
    await pool.query(
      `INSERT INTO platform.outbox_events(event_id,event_type,event_version,producer,aggregate_type,
         aggregate_id,aggregate_version,payload,actor_type,actor_id,correlation_id,occurred_at)
       VALUES($1,'seller_order.closed',1,'atlas-api','seller_order',$2,99,$3,'service',NULL,$4,clock_timestamp())`,
      [
        randomUUID(),
        sellerOrder.id,
        JSON.stringify({
          orderId: order.body.id,
          sellerOrderId: sellerOrder.id,
          sellerId: account.body.sellerId,
          status: 'EXPIRED',
          dataClass: 'live',
        }),
        randomUUID(),
      ],
    );
    const silent = createTestLogger({
      service: 'outbox-test',
      environment: 'test',
      level: 'silent',
    });
    const dispatcher = new OutboxDispatcher(
      pool,
      new MarketplaceNotifier(identity, mailer, silent, {
        sellerWebOrigin: null,
        customerWebOrigin: 'http://localhost:3001',
      }),
      silent,
    );
    while ((await dispatcher.drain()) > 0);
    assert.ok(
      mailer.sent.some(
        (mail) => mail.to === 'client@example.dz' && /pas répondu à temps/.test(mail.text),
      ),
    );
    const pendingEvents = await pool.query<{ count: string }>(
      "SELECT count(*) FROM platform.outbox_events WHERE delivery_state <> 'PUBLISHED'",
    );
    assert.equal(pendingEvents.rows[0]?.count, '0');

    const stock = await pool.query<{ available_quantity: number }>(
      'SELECT available_quantity FROM offers.offers WHERE id = $1',
      [offer.body.id],
    );
    assert.equal(stock.rows[0]?.available_quantity, 1);

    // Guest checkout: no sign-up. The account is created for the email, signed in, and a
    // 7-day link to choose a password is emailed. An existing address must sign in instead.
    const guestEmail = 'invite@example.dz';
    await http()
      .post('/api/v1/auth/register/guest')
      .send({ email: 'client@example.dz' })
      .expect(409);
    await http()
      .post('/api/v1/auth/register/guest')
      .send({ email: guestEmail, origin: 'https://evil.example' })
      .expect(422);
    const guest = await http()
      .post('/api/v1/auth/register/guest')
      .send({ email: guestEmail, locale: 'fr', origin: 'http://localhost:3001' })
      .expect(201);
    assert.equal(guest.body.actorType, 'customer');
    const guestToken = guest.body.accessToken as string;
    const guestCart = await http().get('/api/v1/cart').set(bearer(guestToken)).expect(200);
    const guestFilled = await http()
      .put(`/api/v1/cart/items/${offer.body.id}`)
      .set(bearer(guestToken))
      .send({ quantity: 1, expectedVersion: guestCart.body.version })
      .expect(200);
    await http()
      .post('/api/v1/account/phone/start')
      .set(bearer(guestToken))
      .send({ phone: '0555 12 34 56' })
      .expect(202);
    const guestCode = /([0-9]{6})/.exec(texts.at(-1)?.message ?? '')?.[1] ?? '';
    await http()
      .post('/api/v1/account/phone/confirm')
      .set(bearer(guestToken))
      .send({ phone: '+213555123456', code: guestCode })
      .expect(200);
    const guestQuote = await http()
      .post('/api/v1/checkout/quotes')
      .set(bearer(guestToken))
      .send({
        expectedCartVersion: guestFilled.body.version,
        destinationId: destination.id,
        deliveryContact: {
          recipientName: 'Yacine K.',
          phone: '+213555123456',
          addressLine: '3 rue de la Paix',
          city: 'Oran',
        },
      })
      .expect(201);
    const guestOrder = await http()
      .post(`/api/v1/checkout/quotes/${guestQuote.body.id}/place`)
      .set(bearer(guestToken))
      .set('Idempotency-Key', guestQuote.body.id)
      .send({})
      .expect(200);
    const guestSignal = await http()
      .get(`/api/v1/seller/orders/${guestOrder.body.sellerOrders[0].id}/customer-signal`)
      .set(bearer(seller))
      .expect(200);
    assert.equal(guestSignal.body.emailVerified, false);
    await settle(() => mailer.sent.some((mail) => mail.to === guestEmail));
    const welcome = mailer.sent.find((mail) => mail.to === guestEmail);
    assert.match(welcome?.subject ?? '', /compte est prêt/);
    assert.doesNotMatch(welcome?.text ?? '', /mot de passe : /);
    const setLink =
      /localhost:3001\/reset-password\?token=([A-Za-z0-9_-]{43})&lang=fr&welcome=1/.exec(
        welcome?.text ?? '',
      );
    assert.ok(setLink);
    await http()
      .post('/api/v1/auth/password/reset')
      .send({ token: setLink[1], password: 'Yacine choisit 2026!' })
      .expect(200);
    await http()
      .post('/api/v1/auth/login')
      .send({ email: guestEmail, password: 'Yacine choisit 2026!' })
      .expect(200);
    const guestVerified = await pool.query<{ ok: boolean }>(
      `SELECT email_verified_at IS NOT NULL AS ok FROM identity.password_credentials
       WHERE email = $1`,
      [guestEmail],
    );
    assert.equal(guestVerified.rows[0]?.ok, true);
  });
});
