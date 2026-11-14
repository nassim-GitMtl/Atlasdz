import 'reflect-metadata';

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
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

const settle = async (check: () => boolean) => {
  for (let attempt = 0; attempt < 50 && !check(); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

const currentCode = (secret: string, offset = 0) =>
  totpCode(base32Decode(secret), Math.floor(Date.now() / 1000 / TOTP_PERIOD_SECONDS) + offset);

describe('email/password identity with PostgreSQL and HTTP', () => {
  const sourceUrl = process.env['DATABASE_URL'];
  if (sourceUrl === undefined)
    throw new Error('DATABASE_URL is required for API integration tests');
  const databaseName = `atlas_password_identity_it_${randomBytes(8).toString('hex')}`;
  const adminUrl = new URL(sourceUrl);
  adminUrl.pathname = '/postgres';
  const testUrl = new URL(sourceUrl);
  testUrl.pathname = `/${databaseName}`;
  const admin = new Client({ connectionString: adminUrl.toString() });
  let databaseCreated = false;
  let pool: Pool;
  let app: INestApplication;
  let identity: PasswordIdentityRepository;
  const mailer = new LogMailer();
  const password = 'correct horse battery 42';

  before(async () => {
    await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    databaseCreated = true;
    await runMigrations(testUrl.toString());
    pool = new Pool({ connectionString: testUrl.toString(), max: 4 });
    identity = new PasswordIdentityRepository(pool, randomBytes(32));
    const config = loadRuntimeConfig({
      NODE_ENV: 'test',
      SERVICE_NAME: 'atlas-password-identity-integration',
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
      mailer,
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

  const http = () => request(app.getHttpServer());

  it('registers a customer, enforces password policy and logs in with a PRIMARY session', async () => {
    await http()
      .post('/api/v1/auth/register/customer')
      .send({ email: 'Amina@Example.dz', password: 'short' })
      .expect(422);
    await http()
      .post('/api/v1/auth/register/customer')
      .send({ email: 'Amina@Example.dz', password, locale: 'ar' })
      .expect(201);
    await http()
      .post('/api/v1/auth/register/customer')
      .send({ email: 'amina@example.dz', password })
      .expect(409);
    await http()
      .post('/api/v1/auth/login')
      .send({ email: 'amina@example.dz', password: 'wrong password 123' })
      .expect(401);
    await http()
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.dz', password })
      .expect(401);
    const login = await http()
      .post('/api/v1/auth/login')
      .send({ email: ' AMINA@example.dz ', password })
      .expect(200);
    assert.equal(login.body.status, 'AUTHENTICATED');
    assert.equal(login.body.actorType, 'customer');
    const token = login.body.accessToken as string;
    await http().get('/api/v1/cart').set('Authorization', `Bearer ${token}`).expect(200);
    await http().get('/api/v1/admin/sellers').set('Authorization', `Bearer ${token}`).expect(403);
    await http().get('/api/v1/cart').set('Authorization', 'Bearer atlas-s1.forged').expect(401);
  });

  it('onboards a seller with TOTP enrollment, refuses code replay and requires staff approval', async () => {
    // Store names cannot carry bidi overrides, zero-width or control characters; descriptions
    // keep line breaks but no other control characters.
    const seller = (fields: Record<string, string>) =>
      http()
        .post('/api/v1/auth/register/seller')
        .send({
          email: 'spoof@example.dz',
          password,
          storeName: 'Boutique',
          descriptionFr: 'Produits',
          descriptionAr: 'منتجات',
          ...fields,
        });
    for (const storeName of ['Shop‮etuqi', 'Shop​name', 'Shop\nname', 'Shop\u0000'])
      await seller({ storeName }).expect(422);
    await seller({ descriptionFr: 'Produits\u0000' }).expect(422);
    await http()
      .post('/api/v1/auth/register/seller')
      .send({
        email: 'shop@example.dz',
        password,
        storeName: 'Épicerie Atlas',
        descriptionFr: 'Produits locaux',
        descriptionAr: 'منتجات محلية',
      })
      .expect(201);
    const enrollment = await http()
      .post('/api/v1/auth/login')
      .send({ email: 'shop@example.dz', password })
      .expect(200);
    assert.equal(enrollment.body.status, 'MFA_ENROLLMENT_REQUIRED');
    assert.match(enrollment.body.otpauthUri, /^otpauth:\/\/totp\//);
    const secret = enrollment.body.secret as string;
    // Re-requesting before confirmation returns the same pending secret.
    const again = await http()
      .post('/api/v1/auth/login')
      .send({ email: 'shop@example.dz', password })
      .expect(200);
    assert.equal(again.body.secret, secret);

    const code = currentCode(secret);
    const login = await http()
      .post('/api/v1/auth/login')
      .send({ email: 'shop@example.dz', password, totpCode: code })
      .expect(200);
    assert.equal(login.body.status, 'AUTHENTICATED');
    assert.equal(login.body.actorType, 'seller_user');
    await http()
      .post('/api/v1/auth/login')
      .send({ email: 'shop@example.dz', password, totpCode: code })
      .expect(401);
    const confirmed = await http()
      .post('/api/v1/auth/login')
      .send({ email: 'shop@example.dz', password })
      .expect(200);
    assert.deepEqual(confirmed.body, { status: 'MFA_REQUIRED' });

    const sellerToken = login.body.accessToken as string;
    const account = await http()
      .get('/api/v1/seller/account')
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(200);
    assert.equal(account.body.status, 'PENDING_REVIEW');

    assert.equal((await identity.createStaff('staff@example.dz', password)).status, 'CREATED');
    const staffEnrollment = await http()
      .post('/api/v1/auth/login')
      .send({ email: 'staff@example.dz', password })
      .expect(200);
    const staffLogin = await http()
      .post('/api/v1/auth/login')
      .send({
        email: 'staff@example.dz',
        password,
        totpCode: currentCode(staffEnrollment.body.secret as string),
      })
      .expect(200);
    const staffToken = staffLogin.body.accessToken as string;
    const pending = await http()
      .get('/api/v1/admin/sellers')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    assert.equal(pending.body.items.length, 1);
    assert.equal(pending.body.items[0].email, 'shop@example.dz');
    assert.equal(pending.body.items[0].slug, 'epicerie-atlas');
    await http()
      .post(`/api/v1/admin/sellers/${account.body.sellerId}/review`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ decision: 'REJECT' })
      .expect(422);
    await http()
      .post(`/api/v1/admin/sellers/${account.body.sellerId}/review`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ decision: 'APPROVE' })
      .expect(200);
    await settle(() =>
      mailer.sent.some((mail) => mail.to === 'shop@example.dz' && /validée/.test(mail.subject)),
    );
    assert.ok(
      mailer.sent.some(
        (mail) => mail.to === 'shop@example.dz' && /boutique est validée/.test(mail.subject),
      ),
    );
    await http()
      .post(`/api/v1/admin/sellers/${account.body.sellerId}/review`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ decision: 'APPROVE' })
      .expect(404);
    const approved = await http()
      .get('/api/v1/seller/account')
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(200);
    assert.equal(approved.body.status, 'APPROVED');
    // Seller sessions cannot call staff routes.
    await http()
      .get('/api/v1/admin/sellers')
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(403);
  });

  it('resets a password with a single-use emailed token and revokes old sessions', async () => {
    const before = await http()
      .post('/api/v1/auth/login')
      .send({ email: 'amina@example.dz', password })
      .expect(200);
    const oldToken = before.body.accessToken as string;
    await http()
      .post('/api/v1/auth/password/forgot')
      .send({ email: 'ghost@example.dz', origin: 'http://localhost:3001' })
      .expect(202);
    await http()
      .post('/api/v1/auth/password/forgot')
      .send({ email: 'amina@example.dz', origin: 'https://evil.example' })
      .expect(422);
    const sentBefore = mailer.sent.length;
    await http()
      .post('/api/v1/auth/password/forgot')
      .send({ email: 'Amina@example.dz', origin: 'http://localhost:3001' })
      .expect(202);
    await settle(() => mailer.sent.length > sentBefore);
    const mail = mailer.sent.at(-1);
    assert.equal(mail?.to, 'amina@example.dz');
    assert.equal(
      mailer.sent.some((m) => m.to === 'ghost@example.dz'),
      false,
    );
    const link = /http:\/\/localhost:3001\/reset-password\?token=([A-Za-z0-9_-]{43})&lang=ar/.exec(
      mail?.text ?? '',
    );
    assert.ok(link, 'reset link uses the account locale and an allowed origin');
    const token = link[1];
    await http().post('/api/v1/auth/password/reset').send({ token, password: 'short' }).expect(422);
    const newPassword = 'a brand new passphrase 7';
    await http()
      .post('/api/v1/auth/password/reset')
      .send({ token, password: newPassword })
      .expect(200);
    await http()
      .post('/api/v1/auth/password/reset')
      .send({ token, password: newPassword })
      .expect(422);
    await http().get('/api/v1/cart').set('Authorization', `Bearer ${oldToken}`).expect(401);
    await http()
      .post('/api/v1/auth/login')
      .send({ email: 'amina@example.dz', password })
      .expect(401);
    await http()
      .post('/api/v1/auth/login')
      .send({ email: 'amina@example.dz', password: newPassword })
      .expect(200);
  });

  it('exports and deletes a customer account (law 18-07) and frees the email', async () => {
    const privacyPassword = 'quiet harbor lantern 26';
    await http()
      .post('/api/v1/auth/register/customer')
      .send({ email: 'privacy@example.dz', password: privacyPassword })
      .expect(201);
    const token = (
      await http()
        .post('/api/v1/auth/login')
        .send({ email: 'privacy@example.dz', password: privacyPassword })
        .expect(200)
    ).body.accessToken as string;
    const auth = { Authorization: `Bearer ${token}` };
    const account = await http().get('/api/v1/account').set(auth).expect(200);
    assert.deepEqual(account.body, {
      email: 'privacy@example.dz',
      locale: 'fr',
      emailVerified: false,
    });
    const exported = await http().get('/api/v1/account/export').set(auth).expect(200);
    assert.equal(exported.body.account.email, 'privacy@example.dz');
    assert.deepEqual(exported.body.orders, []);
    await http()
      .post('/api/v1/account/delete')
      .set(auth)
      .send({ password: 'not my password 1' })
      .expect(401);
    await http()
      .post('/api/v1/account/delete')
      .set(auth)
      .send({ password: privacyPassword })
      .expect(200);
    await http().get('/api/v1/account').set(auth).expect(401);
    await http()
      .post('/api/v1/auth/login')
      .send({ email: 'privacy@example.dz', password: privacyPassword })
      .expect(401);
    await http()
      .post('/api/v1/auth/register/customer')
      .send({ email: 'privacy@example.dz', password: privacyPassword })
      .expect(201);
  });

  it('locks an account after repeated failures without revealing the lock', async () => {
    await http()
      .post('/api/v1/auth/register/customer')
      .send({ email: 'lock@example.dz', password })
      .expect(201);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await http()
        .post('/api/v1/auth/login')
        .send({ email: 'lock@example.dz', password: 'not the password 1' })
        .expect(401);
    }
    await http()
      .post('/api/v1/auth/login')
      .send({ email: 'lock@example.dz', password })
      .expect(401);
    const audit = await pool.query<{ count: string }>(
      "SELECT count(*) FROM platform.audit_events WHERE action = 'identity.login' AND outcome = 'DENIED'",
    );
    assert.ok(Number(audit.rows[0]?.count) >= 6);
  });
});
