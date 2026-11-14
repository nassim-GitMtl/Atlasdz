import 'reflect-metadata';

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { CatalogRepositoryPort } from '../src/catalog/catalog-infrastructure.js';
import { createApiApplication } from '../src/bootstrap/http.js';
import { CatalogProductListSchema } from '@atlas/contracts';
import type { IdentityAuthorizationSnapshot, VerifiedAccessClaims } from '@atlas/identity';
import { createLogger, loadRuntimeConfig } from '@atlas/platform';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

const ids = {
  user: '20000000-0000-4000-8000-000000000001',
  session: '20000000-0000-4000-8000-000000000002',
  family: '20000000-0000-4000-8000-000000000003',
  role: '20000000-0000-4000-8000-000000000004',
  assignment: '20000000-0000-4000-8000-000000000005',
  seller: '20000000-0000-4000-8000-000000000006',
  product: '20000000-0000-4000-8000-000000000007',
  offer: '20000000-0000-4000-8000-000000000008',
  permission: '20000000-0000-4000-8000-000000000009',
  grant: '20000000-0000-4000-8000-000000000010',
} as const;

function identityFor(actorType: 'seller_user' | 'staff' | 'customer', permission: string) {
  const now = Date.now();
  const scope =
    actorType === 'seller_user'
      ? { type: 'SELLER' as const, id: ids.seller }
      : { type: 'GLOBAL' as const };
  const claims: VerifiedAccessClaims = {
    tokenId: 'synthetic-catalog-test',
    userId: ids.user,
    sessionId: ids.session,
    sessionFamilyId: ids.family,
    sessionEpoch: 1,
    actorType,
    scope,
    assuranceLevel: 'MFA',
    issuedAt: new Date(now - 30_000),
    expiresAt: new Date(now + 600_000),
  };
  const snapshot: IdentityAuthorizationSnapshot = {
    user: { id: ids.user, status: 'ACTIVE', sessionEpoch: 1 },
    session: {
      id: ids.session,
      userId: ids.user,
      familyId: ids.family,
      sessionEpoch: 1,
      actorType,
      scope,
      assuranceLevel: 'MFA',
      issuedAt: new Date(now - 60_000),
      expiresAt: new Date(now + 900_000),
      mfaCompletedAt: new Date(now - 90_000),
      rotatedAt: null,
      revokedAt: null,
      reuseDetectedAt: null,
    },
    sessionFamily: {
      id: ids.family,
      userId: ids.user,
      sessionEpoch: 1,
      actorType,
      scope,
      createdAt: new Date(now - 120_000),
      expiresAt: new Date(now + 1_200_000),
      revokedAt: null,
      reuseDetectedAt: null,
    },
    roles: [
      {
        id: ids.role,
        code: 'CATALOG_TEST_ROLE',
        actorType,
        assignmentScopeType: scope.type,
        status: 'ACTIVE',
      },
    ],
    assignments: [
      {
        id: ids.assignment,
        userId: ids.user,
        roleId: ids.role,
        actorType,
        scope,
        validFrom: new Date(now - 120_000),
        validUntil: null,
        revokedAt: null,
      },
    ],
    permissions: [{ id: ids.permission, code: permission, status: 'ACTIVE' }],
    rolePermissionGrants: [
      {
        id: ids.grant,
        roleId: ids.role,
        permissionId: ids.permission,
        grantedAt: new Date(now - 120_000),
        validUntil: null,
        revokedAt: null,
      },
    ],
  };
  return {
    credentialVerifier: {
      verify: async (credential: string) =>
        credential === 'synthetic-valid'
          ? { ok: true as const, claims }
          : { ok: false as const, code: 'CREDENTIAL_REJECTED' as const },
    },
    authorizationRepository: { loadAuthorizationSnapshot: async () => snapshot },
  };
}

describe('seller-fulfilled catalog HTTP boundary', () => {
  const apps: INestApplication[] = [];
  const calls: { sellerId: string; actorUserId: string; correlationId: string }[] = [];
  let publicApp: INestApplication;
  let sellerApp: INestApplication;
  let staffApp: INestApplication;
  let customerApp: INestApplication;

  const catalog: CatalogRepositoryPort = {
    listProductCategories: async () => [],
    listOfferProducts: async () => [],
    listProductSubmissions: async () => [],
    getProductSubmission: async () => null,
    listPendingProducts: async () => [],
    submitProduct: async (sellerId, input) => ({
      id: ids.product,
      sellerId,
      category: { id: input.categoryId, slug: 'test', title: { fr: 'Test', ar: 'تجربة' } },
      title: input.title,
      description: input.description,
      status: 'PENDING_REVIEW',
      rowVersion: 1,
      productId: null,
      reviewReason: null,
      revisionOfSubmissionId: input.revisionOfSubmissionId ?? null,
      canRevise: false,
      previous: null,
    }),
    reviewProduct: async () => {
      throw new Error('Unexpected product review');
    },
    listProducts: async () => ({ items: [] }),
    getProduct: async () => null,
    getSeller: async () => null,
    listSellerOffers: async () => [],
    getSellerOffer: async () => null,
    updateOffer: async () => {
      throw new Error('Unexpected update');
    },
    listPendingOffers: async () => [],
    createOffer: async (sellerId, input, context) => {
      calls.push({ sellerId, ...context });
      return {
        id: ids.offer,
        sellerId,
        ...input,
        status: 'PENDING_REVIEW',
        currency: 'DZD',
        rowVersion: 1,
      };
    },
    approveOffer: async () => {
      throw new Error('Unexpected approval');
    },
  };

  async function create(identity?: ReturnType<typeof identityFor>) {
    const config = loadRuntimeConfig({
      NODE_ENV: 'test',
      SERVICE_NAME: 'atlas-catalog-http-test',
      DATABASE_URL: 'postgresql://user:password@127.0.0.1:5432/atlas_test',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3001',
      LOG_LEVEL: 'silent',
    });
    const app = await createApiApplication({
      config,
      logger: createLogger({ service: config.serviceName, environment: 'test', level: 'silent' }),
      catalog,
      ...(identity === undefined ? {} : { identity }),
      rateLimiter: {
        consume: async () => ({ allowed: true, limit: 100, remaining: 99, resetAfterSeconds: 60 }),
      },
    });
    await app.init();
    apps.push(app);
    return app;
  }

  before(async () => {
    publicApp = await create();
    sellerApp = await create(identityFor('seller_user', 'offer.create'));
    staffApp = await create(identityFor('staff', 'offer.create'));
    customerApp = await create(identityFor('customer', 'offer.create'));
  });
  after(async () => {
    await Promise.all(apps.map((app) => app.close()));
  });

  it('allows anonymous discovery with validated response and safe missing-resource errors', async () => {
    const result = await request(publicApp.getHttpServer())
      .get('/api/v1/catalog/products')
      .expect(200);
    assert.deepEqual(CatalogProductListSchema.parse(result.body), { items: [] });
    await request(publicApp.getHttpServer()).get('/api/v1/catalog/products/missing').expect(404);
    await request(publicApp.getHttpServer()).get('/api/v1/catalog/sellers/missing').expect(404);
  });

  it('rejects malformed, unbounded, duplicate, and unknown discovery filters', async () => {
    for (const query of ['limit=100000', 'limit=no', 'query=a&query=b', 'unapproved=true']) {
      await request(publicApp.getHttpServer()).get(`/api/v1/catalog/products?${query}`).expect(422);
    }
  });

  const input = {
    productId: ids.product,
    priceMinor: 120_000,
    availableQuantity: 3,
    handlingDays: 2,
    deliveryFeeMinor: 30_000,
  };

  it('requires authentication before creating or approving offers', async () => {
    await request(publicApp.getHttpServer()).post('/api/v1/seller/offers').send(input).expect(401);
    await request(publicApp.getHttpServer())
      .post(`/api/v1/admin/offers/${ids.offer}/approve`)
      .expect(401);
  });

  it('derives seller ownership and audit attribution only from the authenticated principal', async () => {
    const correlationId = '20000000-0000-4000-8000-000000000099';
    const result = await request(sellerApp.getHttpServer())
      .post('/api/v1/seller/offers')
      .set('Authorization', 'Bearer synthetic-valid')
      .set('X-Correlation-Id', correlationId)
      .send(input)
      .expect(201);
    assert.equal((result.body as { status: string }).status, 'PENDING_REVIEW');
    assert.deepEqual(calls, [{ sellerId: ids.seller, actorUserId: ids.user, correlationId }]);
    await request(sellerApp.getHttpServer())
      .post('/api/v1/seller/offers')
      .set('Authorization', 'Bearer synthetic-valid')
      .send({ ...input, sellerId: ids.user })
      .expect(422);
  });

  it('rejects customer/staff use of seller endpoints even with a matching permission name', async () => {
    for (const app of [staffApp, customerApp]) {
      await request(app.getHttpServer())
        .post('/api/v1/seller/offers')
        .set('Authorization', 'Bearer synthetic-valid')
        .send(input)
        .expect(403);
    }
  });

  it('enforces separate product submission/review permissions and rejects ownership or publication overrides', async () => {
    const data = {
      requestId: ids.offer,
      categoryId: ids.product,
      title: { fr: 'Test', ar: 'تجربة' },
      description: { fr: 'Test', ar: 'تجربة' },
    };
    await request(publicApp.getHttpServer()).get('/api/v1/seller/products').expect(401);
    await request(sellerApp.getHttpServer())
      .post('/api/v1/seller/products')
      .set('Authorization', 'Bearer synthetic-valid')
      .send(data)
      .expect(403);
    const allowed = await create(identityFor('seller_user', 'product.submit'));
    const result = await request(allowed.getHttpServer())
      .post('/api/v1/seller/products')
      .set('Authorization', 'Bearer synthetic-valid')
      .send(data)
      .expect(201);
    assert.equal((result.body as { sellerId: string }).sellerId, ids.seller);
    const revision = await request(allowed.getHttpServer())
      .post('/api/v1/seller/products')
      .set('Authorization', 'Bearer synthetic-valid')
      .send({ ...data, revisionOfSubmissionId: ids.product })
      .expect(201);
    assert.equal(
      (revision.body as { revisionOfSubmissionId: string }).revisionOfSubmissionId,
      ids.product,
    );
    await request(publicApp.getHttpServer())
      .get(`/api/v1/seller/products/${ids.product}`)
      .expect(401);
    await request(sellerApp.getHttpServer())
      .get(`/api/v1/seller/products/${ids.product}`)
      .set('Authorization', 'Bearer synthetic-valid')
      .expect(403);
    for (const id of ['invalid', ids.product])
      await request(allowed.getHttpServer())
        .get(`/api/v1/seller/products/${id}`)
        .set('Authorization', 'Bearer synthetic-valid')
        .expect(404);
    for (const extra of [
      { sellerId: ids.user },
      { status: 'APPROVED' },
      { imageUrl: 'https://example.invalid/a.png' },
      { revisionOfSubmissionId: 'invalid' },
      { canRevise: true },
      { previous: { title: data.title, description: data.description } },
    ])
      await request(allowed.getHttpServer())
        .post('/api/v1/seller/products')
        .set('Authorization', 'Bearer synthetic-valid')
        .send({ ...data, ...extra })
        .expect(422);
    for (const actor of ['staff', 'customer'] as const) {
      const denied = await create(identityFor(actor, 'product.submit'));
      await request(denied.getHttpServer())
        .post('/api/v1/seller/products')
        .set('Authorization', 'Bearer synthetic-valid')
        .send(data)
        .expect(403);
    }
    await request(allowed.getHttpServer())
      .get('/api/v1/admin/products')
      .set('Authorization', 'Bearer synthetic-valid')
      .expect(403);
    const staffReview = await create(identityFor('staff', 'product.review'));
    await request(staffReview.getHttpServer())
      .get('/api/v1/admin/products')
      .set('Authorization', 'Bearer synthetic-valid')
      .expect(200);
    for (const path of ['/api/v1/seller/products', '/api/v1/seller/products/categories'])
      await request(allowed.getHttpServer())
        .get(path)
        .set('Authorization', 'Bearer synthetic-valid')
        .expect(200);
    const offerReader = await create(identityFor('seller_user', 'offer.read'));
    await request(offerReader.getHttpServer())
      .get('/api/v1/seller/products/catalog')
      .set('Authorization', 'Bearer synthetic-valid')
      .expect(200);
    const offerReviewer = await create(identityFor('staff', 'offer.approve'));
    await request(offerReviewer.getHttpServer())
      .get('/api/v1/admin/products/catalog')
      .set('Authorization', 'Bearer synthetic-valid')
      .expect(200);
    await request(staffReview.getHttpServer())
      .post(`/api/v1/admin/products/${ids.product}/review`)
      .set('Authorization', 'Bearer synthetic-valid')
      .send({ decision: 'REJECTED', expectedVersion: 1 })
      .expect(422);
    const wrongActor = await create(identityFor('customer', 'product.review'));
    await request(wrongActor.getHttpServer())
      .get('/api/v1/admin/products')
      .set('Authorization', 'Bearer synthetic-valid')
      .expect(403);
  });

  it('does not let a seller publish an unreviewed offer through the staff endpoint', async () => {
    await request(sellerApp.getHttpServer())
      .post(`/api/v1/admin/offers/${ids.offer}/approve`)
      .set('Authorization', 'Bearer synthetic-valid')
      .expect(403);
  });
});
