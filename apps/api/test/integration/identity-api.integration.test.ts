import 'reflect-metadata';

import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { ErrorEnvelopeSchema, RevocationResultSchema, SessionListSchema } from '@atlas/contracts';
import { runMigrations } from '@atlas/database';
import type {
  AccessCredentialVerifierPort,
  CredentialVerificationResult,
  VerifiedAccessClaims,
} from '@atlas/identity';
import {
  PostgresIdentityAuthorizationRepository,
  PostgresSessionRepository,
} from '@atlas/identity-postgres';
import { createLogger, loadRuntimeConfig } from '@atlas/platform';
import type { INestApplication } from '@nestjs/common';
import { Client, Pool } from 'pg';
import request from 'supertest';

import { createApiApplication } from '../../src/bootstrap/http.js';

const quotedDatabaseName = (value: string): string => {
  if (!/^[a-z0-9_]+$/.test(value)) {
    throw new Error('Unsafe temporary database name');
  }
  return `"${value}"`;
};

class FixtureCredentialVerifier implements AccessCredentialVerifierPort {
  public constructor(private readonly credentials: ReadonlyMap<string, VerifiedAccessClaims>) {}

  public async verify(rawCredential: string): Promise<CredentialVerificationResult> {
    const claims = this.credentials.get(rawCredential);
    return claims === undefined ? { ok: false, code: 'CREDENTIAL_REJECTED' } : { ok: true, claims };
  }
}

const insertSession = async (
  pool: Pool,
  values: {
    readonly id: string;
    readonly userId: string;
    readonly familyId: string;
    readonly label: string;
    readonly issuedAt: Date;
    readonly expiresAt: Date;
  },
): Promise<void> => {
  await pool.query(
    `INSERT INTO identity.session_families (
       id, user_id, issued_session_epoch, actor_type, scope_type,
       scope_id, created_at, expires_at
     ) VALUES ($1, $2, 1, 'customer', 'GLOBAL', NULL, $3, $4)`,
    [values.familyId, values.userId, values.issuedAt, values.expiresAt],
  );
  await pool.query(
    `INSERT INTO identity.sessions (
       id, user_id, family_id, token_hash, device_label, assurance_level,
       issued_at, expires_at, last_seen_at, issued_session_epoch,
       actor_type, scope_type, scope_id
     ) VALUES ($1, $2, $3, $4, $5, 'PRIMARY', $6, $7, $6, 1, 'customer', 'GLOBAL', NULL)`,
    [
      values.id,
      values.userId,
      values.familyId,
      randomBytes(32),
      values.label,
      values.issuedAt,
      values.expiresAt,
    ],
  );
};

describe('identity session API with PostgreSQL', () => {
  const sourceUrl = process.env['DATABASE_URL'];
  if (sourceUrl === undefined) {
    throw new Error('DATABASE_URL is required for API integration tests');
  }
  const databaseName = `atlas_api_it_${randomBytes(8).toString('hex')}`;
  const adminUrl = new URL(sourceUrl);
  adminUrl.pathname = '/postgres';
  const testUrl = new URL(sourceUrl);
  testUrl.pathname = `/${databaseName}`;
  const admin = new Client({ connectionString: adminUrl.toString() });
  const userId = randomUUID();
  const foreignUserId = randomUUID();
  const currentSessionId = randomUUID();
  const currentFamilyId = randomUUID();
  const otherFamilyId = randomUUID();
  const foreignFamilyId = randomUUID();
  const roleId = randomUUID();
  const assignmentId = randomUUID();
  const roleCode = `CUSTOMER_${randomBytes(8).toString('hex').toUpperCase()}`;
  const now = Date.now();
  const issuedAt = new Date(now - 60 * 60_000);
  const expiresAt = new Date(now + 60 * 60_000);
  const claims: VerifiedAccessClaims = {
    tokenId: 'synthetic-api-integration-token',
    userId,
    sessionId: currentSessionId,
    sessionFamilyId: currentFamilyId,
    sessionEpoch: 1,
    actorType: 'customer',
    scope: { type: 'GLOBAL' },
    assuranceLevel: 'PRIMARY',
    issuedAt: new Date(now - 5 * 60_000),
    expiresAt: new Date(now + 5 * 60_000),
  };
  let pool: Pool;
  let app: INestApplication;

  before(async () => {
    await admin.connect();
    await admin.query(`CREATE DATABASE ${quotedDatabaseName(databaseName)}`);
    await runMigrations(testUrl.toString());
    pool = new Pool({ connectionString: testUrl.toString(), max: 6 });

    await pool.query(
      `INSERT INTO identity.users (id, status, session_epoch)
       VALUES ($1, 'ACTIVE', 1), ($2, 'ACTIVE', 1)`,
      [userId, foreignUserId],
    );
    await pool.query(
      `INSERT INTO identity.roles (id, code, actor_type, assignment_scope_type, description)
       VALUES ($1, $2, 'customer', 'GLOBAL', 'Synthetic API integration role')`,
      [roleId, roleCode],
    );
    await pool.query(
      `INSERT INTO identity.user_role_assignments
        (id, user_id, role_id, actor_type, scope_type, granted_reason, valid_from)
       VALUES ($1, $2, $3, 'customer', 'GLOBAL', 'Synthetic API integration assignment', $4)`,
      [assignmentId, userId, roleId, issuedAt],
    );
    await insertSession(pool, {
      id: currentSessionId,
      userId,
      familyId: currentFamilyId,
      label: 'Synthetic current browser',
      issuedAt,
      expiresAt,
    });
    await insertSession(pool, {
      id: randomUUID(),
      userId,
      familyId: otherFamilyId,
      label: 'Synthetic other browser',
      issuedAt,
      expiresAt,
    });
    await insertSession(pool, {
      id: randomUUID(),
      userId: foreignUserId,
      familyId: foreignFamilyId,
      label: 'Synthetic foreign browser',
      issuedAt,
      expiresAt,
    });

    const config = loadRuntimeConfig({
      NODE_ENV: 'test',
      SERVICE_NAME: 'atlas-api-postgres-test',
      HOST: '127.0.0.1',
      PORT: '0',
      LOG_LEVEL: 'silent',
      DATABASE_URL: testUrl.toString(),
      DATABASE_SSL: 'false',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3001',
      REQUEST_BODY_LIMIT_BYTES: '1048576',
      ENABLE_ELECTRONIC_PAYMENTS: 'false',
      ENABLE_REAL_PAYOUTS: 'false',
    });
    app = await createApiApplication({
      config,
      logger: createLogger({
        service: config.serviceName,
        environment: config.nodeEnv,
        level: config.logLevel,
      }),
      identity: {
        credentialVerifier: new FixtureCredentialVerifier(
          new Map([['synthetic-valid-token', claims]]),
        ),
        authorizationRepository: new PostgresIdentityAuthorizationRepository(pool),
        sessionSelfServicePort: new PostgresSessionRepository(pool),
      },
      rateLimiter: {
        consume: async () => ({
          allowed: true,
          limit: 1_000,
          remaining: 999,
          resetAfterSeconds: 60,
        }),
      },
    });
    await app.listen(0, '127.0.0.1');
  });

  after(async () => {
    await app.close();
    await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS ${quotedDatabaseName(databaseName)}`);
    await admin.end();
  });

  it('authenticates, lists, revokes, persists evidence, and invalidates the live session', async () => {
    const agent = request(app.getHttpServer());
    const authorized = () => ({ Authorization: 'Bearer synthetic-valid-token' });

    const initial = await agent.get('/api/v1/auth/sessions').set(authorized()).expect(200);
    assert.deepEqual(
      new Set(SessionListSchema.parse(initial.body).sessions.map((session) => session.id)),
      new Set([currentFamilyId, otherFamilyId]),
    );

    const foreign = await agent
      .delete(`/api/v1/auth/sessions/${foreignFamilyId}`)
      .set(authorized())
      .expect(404);
    const missing = await agent
      .delete(`/api/v1/auth/sessions/${randomUUID()}`)
      .set(authorized())
      .expect(404);
    assert.equal(ErrorEnvelopeSchema.parse(foreign.body).code, 'SESSION_NOT_FOUND');
    assert.equal(ErrorEnvelopeSchema.parse(missing.body).code, 'SESSION_NOT_FOUND');

    const correlationId = randomUUID();
    await agent
      .delete(`/api/v1/auth/sessions/${otherFamilyId}`)
      .set(authorized())
      .set('X-Correlation-Id', correlationId)
      .expect(204);
    await agent.delete(`/api/v1/auth/sessions/${otherFamilyId}`).set(authorized()).expect(204);

    const evidence = await pool.query<{
      audit_count: string;
      outbox_count: string;
      audit_correlation_id: string;
      outbox_correlation_id: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM platform.audit_events
          WHERE entity_type = 'session_family' AND entity_id = $1) AS audit_count,
         (SELECT count(*)::text FROM platform.outbox_events
          WHERE aggregate_type = 'session_family' AND aggregate_id = $1) AS outbox_count,
         (SELECT correlation_id FROM platform.audit_events
          WHERE entity_type = 'session_family' AND entity_id = $1) AS audit_correlation_id,
         (SELECT correlation_id FROM platform.outbox_events
          WHERE aggregate_type = 'session_family' AND aggregate_id = $1) AS outbox_correlation_id`,
      [otherFamilyId],
    );
    assert.equal(evidence.rows[0]?.audit_count, '1');
    assert.equal(evidence.rows[0]?.outbox_count, '1');
    assert.equal(evidence.rows[0]?.audit_correlation_id, correlationId);
    assert.equal(evidence.rows[0]?.outbox_correlation_id, correlationId);

    const newOtherFamilyId = randomUUID();
    await insertSession(pool, {
      id: randomUUID(),
      userId,
      familyId: newOtherFamilyId,
      label: 'Synthetic late browser',
      issuedAt,
      expiresAt,
    });
    const revokedOthers = await agent.delete('/api/v1/auth/sessions').set(authorized()).expect(200);
    assert.equal(RevocationResultSchema.parse(revokedOthers.body).revokedCount, 1);

    await agent.delete(`/api/v1/auth/sessions/${currentFamilyId}`).set(authorized()).expect(204);
    const revokedCurrent = await agent.get('/api/v1/auth/sessions').set(authorized()).expect(401);
    assert.equal(ErrorEnvelopeSchema.parse(revokedCurrent.body).code, 'SESSION_REVOKED');
  });
});
