import 'reflect-metadata';

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { ErrorEnvelopeSchema, RevocationResultSchema, SessionListSchema } from '@atlas/contracts';
import type {
  AccessCredentialVerifierPort,
  CredentialVerificationResult,
  IdentityAuthorizationRepositoryPort,
  IdentityAuthorizationSnapshot,
  SessionPersistenceContext,
  SessionSelfServicePort,
  VerifiedAccessClaims,
} from '@atlas/identity';
import { createLogger, loadRuntimeConfig } from '@atlas/platform';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { createApiApplication } from '../src/bootstrap/http.js';
import type {
  RateLimitDecision,
  RateLimiterPort,
  RateLimitRequest,
} from '../src/rate-limit/index.js';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const SESSION_ID = '10000000-0000-4000-8000-000000000002';
const REVOKED_SESSION_ID = '10000000-0000-4000-8000-000000000003';
const CURRENT_FAMILY_ID = '10000000-0000-4000-8000-000000000004';
const OTHER_FAMILY_ID = '10000000-0000-4000-8000-000000000005';
const MISSING_FAMILY_ID = '10000000-0000-4000-8000-000000000006';
const ROLE_ID = '10000000-0000-4000-8000-000000000007';
const ASSIGNMENT_ID = '10000000-0000-4000-8000-000000000008';

const config = loadRuntimeConfig({
  NODE_ENV: 'test',
  SERVICE_NAME: 'atlas-api-identity-test',
  HOST: '127.0.0.1',
  PORT: '0',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://user:password@127.0.0.1:5432/atlas_test',
  DATABASE_SSL: 'false',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3001',
  REQUEST_BODY_LIMIT_BYTES: '1048576',
  ENABLE_ELECTRONIC_PAYMENTS: 'false',
  ENABLE_REAL_PAYOUTS: 'false',
});
const logger = createLogger({
  service: config.serviceName,
  environment: config.nodeEnv,
  level: config.logLevel,
});

const makeClaims = (sessionId: string = SESSION_ID): VerifiedAccessClaims => {
  const now = Date.now();
  return {
    tokenId: `synthetic-${sessionId}`,
    userId: USER_ID,
    sessionId,
    sessionFamilyId: CURRENT_FAMILY_ID,
    sessionEpoch: 1,
    actorType: 'customer',
    scope: { type: 'GLOBAL' },
    assuranceLevel: 'PRIMARY',
    issuedAt: new Date(now - 30_000),
    expiresAt: new Date(now + 30 * 60_000),
  };
};

const makeSnapshot = (claims: VerifiedAccessClaims): IdentityAuthorizationSnapshot => ({
  user: { id: USER_ID, status: 'ACTIVE', sessionEpoch: 1 },
  session: {
    id: claims.sessionId,
    userId: USER_ID,
    familyId: CURRENT_FAMILY_ID,
    sessionEpoch: 1,
    actorType: 'customer',
    scope: { type: 'GLOBAL' },
    assuranceLevel: 'PRIMARY',
    issuedAt: new Date(claims.issuedAt.getTime() - 30_000),
    expiresAt: new Date(claims.expiresAt.getTime() + 30_000),
    mfaCompletedAt: null,
    rotatedAt: null,
    revokedAt:
      claims.sessionId === REVOKED_SESSION_ID ? new Date(claims.issuedAt.getTime() + 1_000) : null,
    reuseDetectedAt: null,
  },
  sessionFamily: {
    id: CURRENT_FAMILY_ID,
    userId: USER_ID,
    sessionEpoch: 1,
    actorType: 'customer',
    scope: { type: 'GLOBAL' },
    createdAt: new Date(claims.issuedAt.getTime() - 60_000),
    expiresAt: new Date(claims.expiresAt.getTime() + 60_000),
    revokedAt:
      claims.sessionId === REVOKED_SESSION_ID ? new Date(claims.issuedAt.getTime() + 1_000) : null,
    reuseDetectedAt: null,
  },
  assignments: [
    {
      id: ASSIGNMENT_ID,
      userId: USER_ID,
      roleId: ROLE_ID,
      actorType: 'customer',
      scope: { type: 'GLOBAL' },
      validFrom: new Date(claims.issuedAt.getTime() - 60_000),
      validUntil: null,
      revokedAt: null,
    },
  ],
  roles: [
    {
      id: ROLE_ID,
      code: 'CUSTOMER',
      actorType: 'customer',
      assignmentScopeType: 'GLOBAL',
      status: 'ACTIVE',
    },
  ],
  rolePermissionGrants: [],
  permissions: [],
});

class SyntheticCredentialVerifier implements AccessCredentialVerifierPort {
  public async verify(rawCredential: string): Promise<CredentialVerificationResult> {
    if (rawCredential === 'valid-synthetic-token') {
      return { ok: true, claims: makeClaims() };
    }
    if (rawCredential === 'revoked-synthetic-token') {
      return { ok: true, claims: makeClaims(REVOKED_SESSION_ID) };
    }
    return { ok: false, code: 'CREDENTIAL_REJECTED' };
  }
}

class SyntheticAuthorizationRepository implements IdentityAuthorizationRepositoryPort {
  public async loadAuthorizationSnapshot(
    _userId: string,
    sessionId: string,
  ): Promise<IdentityAuthorizationSnapshot> {
    return makeSnapshot(makeClaims(sessionId));
  }
}

type SessionCall = Readonly<{
  operation: 'list' | 'revoke-one' | 'revoke-others';
  context: SessionPersistenceContext;
  targetFamilyId?: string;
}>;

class SyntheticSessionPort implements SessionSelfServicePort {
  public readonly calls: SessionCall[] = [];

  public async listCurrentFamilies(context: SessionPersistenceContext) {
    this.calls.push({ operation: 'list', context });
    const now = Date.now();
    return [
      {
        familyId: CURRENT_FAMILY_ID,
        deviceLabel: 'Synthetic browser',
        actorType: 'customer' as const,
        scope: { type: 'GLOBAL' as const },
        assuranceLevel: 'PRIMARY' as const,
        createdAt: new Date(now - 3_600_000),
        lastSeenAt: new Date(now - 1_000),
        expiresAt: new Date(now + 3_600_000),
      },
      {
        familyId: OTHER_FAMILY_ID,
        deviceLabel: null,
        actorType: 'customer' as const,
        scope: { type: 'GLOBAL' as const },
        assuranceLevel: 'PRIMARY' as const,
        createdAt: new Date(now - 7_200_000),
        lastSeenAt: null,
        expiresAt: new Date(now + 3_600_000),
      },
    ];
  }

  public async revokeOwnedFamilyAtomically(
    context: SessionPersistenceContext,
    targetFamilyId: string,
  ) {
    this.calls.push({ operation: 'revoke-one', context, targetFamilyId });
    return targetFamilyId === MISSING_FAMILY_ID
      ? ({ found: false } as const)
      : ({
          found: true,
          counts: { revokedFamilyCount: 1, revokedSessionCount: 1 },
        } as const);
  }

  public async revokeOtherFamiliesAtomically(context: SessionPersistenceContext) {
    this.calls.push({ operation: 'revoke-others', context });
    return { revokedFamilyCount: 1, revokedSessionCount: 1 };
  }
}

class SyntheticRateLimiter implements RateLimiterPort {
  public readonly calls: RateLimitRequest[] = [];

  public constructor(private readonly decision: RateLimitDecision) {}

  public async consume(input: RateLimitRequest): Promise<RateLimitDecision> {
    this.calls.push(input);
    return this.decision;
  }
}

describe('identity session HTTP boundary', () => {
  let app: INestApplication;
  let failClosedApp: INestApplication;
  let rateLimitedApp: INestApplication;
  let sessions: SyntheticSessionPort;
  let rateLimiter: SyntheticRateLimiter;
  let rateLimitedSessions: SyntheticSessionPort;

  before(async () => {
    sessions = new SyntheticSessionPort();
    rateLimiter = new SyntheticRateLimiter({
      allowed: true,
      limit: 100,
      remaining: 99,
      resetAfterSeconds: 60,
    });
    app = await createApiApplication({
      config,
      logger,
      databaseHealth: { check: async () => true },
      identity: {
        credentialVerifier: new SyntheticCredentialVerifier(),
        authorizationRepository: new SyntheticAuthorizationRepository(),
        sessionSelfServicePort: sessions,
      },
      rateLimiter,
    });
    failClosedApp = await createApiApplication({
      config,
      logger,
      databaseHealth: { check: async () => true },
      identity: {
        authorizationRepository: new SyntheticAuthorizationRepository(),
        sessionSelfServicePort: new SyntheticSessionPort(),
      },
    });
    rateLimitedSessions = new SyntheticSessionPort();
    rateLimitedApp = await createApiApplication({
      config,
      logger,
      databaseHealth: { check: async () => true },
      identity: {
        credentialVerifier: new SyntheticCredentialVerifier(),
        authorizationRepository: new SyntheticAuthorizationRepository(),
        sessionSelfServicePort: rateLimitedSessions,
      },
    });
    await Promise.all([
      app.listen(0, '127.0.0.1'),
      failClosedApp.listen(0, '127.0.0.1'),
      rateLimitedApp.listen(0, '127.0.0.1'),
    ]);
  });

  after(async () => {
    await Promise.all([app.close(), failClosedApp.close(), rateLimitedApp.close()]);
  });

  it('keeps health explicitly public while session routes fail closed by default', async () => {
    await request(failClosedApp.getHttpServer()).get('/health/live').expect(200);
    const denied = await request(failClosedApp.getHttpServer())
      .get('/api/v1/auth/sessions')
      .set('Authorization', 'Bearer any-provider-token')
      .expect(401);

    assert.equal(ErrorEnvelopeSchema.parse(denied.body).code, 'AUTHENTICATION_REQUIRED');
  });

  it('requires exactly one well-formed credential without leaking verifier state', async () => {
    const missing = await request(app.getHttpServer()).get('/api/v1/auth/sessions').expect(401);
    const rejected = await request(app.getHttpServer())
      .get('/api/v1/auth/sessions')
      .set('Authorization', 'Bearer rejected-token')
      .expect(401);

    assert.equal(ErrorEnvelopeSchema.parse(missing.body).code, 'AUTHENTICATION_REQUIRED');
    assert.equal(ErrorEnvelopeSchema.parse(rejected.body).code, 'AUTHENTICATION_REQUIRED');
  });

  it('exposes the stable revoked-session contract for an otherwise verified credential', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/sessions')
      .set('Authorization', 'Bearer revoked-synthetic-token')
      .expect(401);

    assert.equal(ErrorEnvelopeSchema.parse(response.body).code, 'SESSION_REVOKED');
  });

  it('lists only contract fields and derives current state from the authenticated principal', async () => {
    const correlationId = '3e4666bf-d5e5-4aa7-b8ce-cefe41c7568a';
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/sessions')
      .set('Authorization', 'Bearer valid-synthetic-token')
      .set('X-Correlation-Id', correlationId)
      .expect(200);
    const body = SessionListSchema.parse(response.body);

    assert.equal(body.sessions.length, 2);
    assert.equal(body.sessions.find((session) => session.current)?.id, CURRENT_FAMILY_ID);
    assert.equal('actorType' in response.body.sessions[0], false);
    assert.equal(sessions.calls.at(-1)?.context.ownerUserId, USER_ID);
    assert.equal(sessions.calls.at(-1)?.context.correlationId, correlationId);
    assert.equal(response.headers['ratelimit-limit'], '100');
    assert.equal(response.headers['ratelimit-remaining'], '99');
    assert.equal(response.headers['ratelimit-reset'], '60');
    assert.deepEqual(rateLimiter.calls.at(-1), {
      rateLimitClass: 'authenticated',
      operation: 'identity.sessions.list',
      subjectId: USER_ID,
    });
  });

  it('fails before controller execution when the authenticated rate limit is exhausted', async () => {
    const response = await request(rateLimitedApp.getHttpServer())
      .delete('/api/v1/auth/sessions')
      .set('Authorization', 'Bearer valid-synthetic-token')
      .expect(429);

    const body = ErrorEnvelopeSchema.parse(response.body);
    assert.equal(body.code, 'RATE_LIMITED');
    assert.deepEqual(body.details, { retryAfterSeconds: 60 });
    assert.equal(response.headers['retry-after'], '60');
    assert.equal(response.headers['ratelimit-limit'], '1');
    assert.equal(rateLimitedSessions.calls.length, 0);
  });

  it('revokes one owned family and returns no representation', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/api/v1/auth/sessions/${OTHER_FAMILY_ID}`)
      .set('Authorization', 'Bearer valid-synthetic-token')
      .expect(204);

    assert.equal(response.text, '');
    assert.equal(sessions.calls.at(-1)?.targetFamilyId, OTHER_FAMILY_ID);
  });

  it('makes a missing and non-owned family indistinguishable and validates malformed IDs', async () => {
    const missing = await request(app.getHttpServer())
      .delete(`/api/v1/auth/sessions/${MISSING_FAMILY_ID}`)
      .set('Authorization', 'Bearer valid-synthetic-token')
      .expect(404);
    const malformed = await request(app.getHttpServer())
      .delete('/api/v1/auth/sessions/not-a-uuid')
      .set('Authorization', 'Bearer valid-synthetic-token')
      .expect(422);

    assert.equal(ErrorEnvelopeSchema.parse(missing.body).code, 'SESSION_NOT_FOUND');
    assert.equal(ErrorEnvelopeSchema.parse(malformed.body).code, 'VALIDATION_FAILED');
  });

  it('revokes only other families and exposes the contract count', async () => {
    const response = await request(app.getHttpServer())
      .delete('/api/v1/auth/sessions')
      .set('Authorization', 'Bearer valid-synthetic-token')
      .expect(200);
    const result = RevocationResultSchema.parse(response.body);

    assert.equal(result.revokedCount, 1);
    assert.equal(sessions.calls.at(-1)?.context.currentFamilyId, CURRENT_FAMILY_ID);
  });
});
