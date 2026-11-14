import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ActorContextSchema,
  CorrelationIdSchema,
  ErrorEnvelopeSchema,
  EventEnvelopeSchema,
  HealthResponseSchema,
  RevocationResultSchema,
  SafeApplicationError,
  SessionListSchema,
  SessionRevokedV1PayloadSchema,
  SuspiciousLoginV1PayloadSchema,
} from '../src/index.js';

describe('shared contracts', () => {
  it('accepts safe upstream correlation identifiers and rejects header injection', () => {
    assert.equal(
      CorrelationIdSchema.parse('01J9QX4T7B3H5K8M2N6P0R1S4V'),
      '01J9QX4T7B3H5K8M2N6P0R1S4V',
    );
    assert.equal(CorrelationIdSchema.safeParse('unsafe\r\nheader').success, false);
  });

  it('validates the stable error envelope', () => {
    const result = ErrorEnvelopeSchema.parse({
      code: 'RESOURCE_NOT_FOUND',
      message: 'Route not found',
      correlationId: '3e4666bf-d5e5-4aa7-b8ce-cefe41c7568a',
    });

    assert.equal(result.code, 'RESOURCE_NOT_FOUND');
  });

  it('requires canonical versioned event envelopes and UUID identifiers', () => {
    const event = EventEnvelopeSchema.parse({
      eventId: '3e4666bf-d5e5-4aa7-b8ce-cefe41c7568a',
      eventType: 'identity.session_revoked',
      eventVersion: 1,
      occurredAt: '2026-10-03T12:00:00.000Z',
      producer: 'atlas-api',
      aggregateType: 'session_family',
      aggregateId: 'e97d36af-d702-458f-9b0f-fc57d63d09d1',
      aggregateVersion: 3,
      correlationId: '3e4666bf-d5e5-4aa7-b8ce-cefe41c7568a',
      causationId: null,
      actor: { type: 'staff', id: '125bec79-8bdb-4df2-a1b5-70e79298b011' },
      data: {
        userId: '36d87198-f6d5-41f6-8a01-358290a7a456',
        sessionId: 'fd3010e0-4df8-4a94-ae25-eb71985d4fc5',
        revocationReason: 'USER_REQUEST',
      },
    });

    assert.equal(event.eventVersion, 1);
    assert.equal(event.aggregateVersion, 3);
    assert.equal(
      EventEnvelopeSchema.safeParse({ ...event, eventType: 'configuration.changed.v1' }).success,
      false,
    );
    for (const suffix of ['v0', 'v00', 'v01']) {
      assert.equal(
        EventEnvelopeSchema.safeParse({ ...event, eventType: `configuration.changed.${suffix}` })
          .success,
        false,
      );
    }
    assert.equal(EventEnvelopeSchema.safeParse({ ...event, eventVersion: 2 }).success, false);
    assert.equal(
      EventEnvelopeSchema.safeParse({
        ...event,
        data: { ...event.data, refreshToken: 'prohibited' },
      }).success,
      false,
    );
  });

  it('validates complete actor and identity session contracts', () => {
    const actor = ActorContextSchema.parse({
      actorType: 'customer',
      actorId: '36d87198-f6d5-41f6-8a01-358290a7a456',
      sessionId: 'fc4e7cf5-fb25-4e2e-ad85-fd3bac3037b6',
      sessionFamilyId: 'fd3010e0-4df8-4a94-ae25-eb71985d4fc5',
      effectiveRoles: ['CUSTOMER'],
      permissions: ['session.read', 'session.revoke'],
      assuranceLevel: 'PRIMARY',
      mfaCompletedAt: null,
      scope: { type: 'GLOBAL' },
    });
    const sessions = SessionListSchema.parse({
      sessions: [
        {
          id: actor.sessionFamilyId,
          deviceLabel: 'Synthetic browser',
          assuranceLevel: 'PRIMARY',
          issuedAt: '2026-10-03T12:00:00.000Z',
          lastSeenAt: null,
          expiresAt: '2026-10-10T12:00:00.000Z',
          current: true,
        },
      ],
    });

    assert.equal(sessions.sessions[0]?.current, true);
    assert.equal(RevocationResultSchema.parse({ revokedCount: 2 }).revokedCount, 2);
    assert.equal(
      ActorContextSchema.safeParse({ ...actor, scope: { type: 'SELLER', id: null } }).success,
      false,
    );
    assert.equal(
      ActorContextSchema.safeParse({
        ...actor,
        assuranceLevel: 'MFA',
        mfaCompletedAt: null,
      }).success,
      false,
    );
    assert.equal(ActorContextSchema.safeParse({ ...actor, actorId: null }).success, false);
    assert.equal(
      ActorContextSchema.safeParse({
        ...actor,
        actorType: 'staff',
        assuranceLevel: 'PRIMARY',
      }).success,
      false,
    );
  });

  it('maps typed application failures without caller-controlled public messages', () => {
    const error = new SafeApplicationError('SESSION_NOT_FOUND');

    assert.equal(error.status, 404);
    assert.equal(error.safeMessage, 'The session was not found.');
    assert.throws(
      () => new SafeApplicationError('SESSION_NOT_FOUND', { token: 'prohibited' }),
      TypeError,
    );
    assert.deepEqual(
      new SafeApplicationError('VALIDATION_FAILED', {
        fields: [{ path: 'deviceLabel', reason: 'INVALID_LENGTH' }],
      }).details,
      { fields: [{ path: 'deviceLabel', reason: 'INVALID_LENGTH' }] },
    );
  });

  it('validates the minimal session-revoked event payload', () => {
    const payload = SessionRevokedV1PayloadSchema.parse({
      userId: '36d87198-f6d5-41f6-8a01-358290a7a456',
      sessionId: 'fd3010e0-4df8-4a94-ae25-eb71985d4fc5',
      revocationReason: 'USER_REQUEST',
    });

    assert.equal(payload.revocationReason, 'USER_REQUEST');
    assert.equal(
      SessionRevokedV1PayloadSchema.safeParse({ ...payload, token: 'prohibited' }).success,
      false,
    );
  });

  it('validates a token-free refresh-reuse alert payload', () => {
    const payload = SuspiciousLoginV1PayloadSchema.parse({
      userId: '36d87198-f6d5-41f6-8a01-358290a7a456',
      reasonCodes: ['REFRESH_TOKEN_REUSE_DETECTED'],
      sessionId: 'fd3010e0-4df8-4a94-ae25-eb71985d4fc5',
      occurredAt: '2026-10-03T12:00:00.000Z',
    });

    assert.deepEqual(payload.reasonCodes, ['REFRESH_TOKEN_REUSE_DETECTED']);
    assert.equal(
      SuspiciousLoginV1PayloadSchema.safeParse({ ...payload, refreshToken: 'prohibited' }).success,
      false,
    );
    assert.equal(
      EventEnvelopeSchema.safeParse({
        eventId: '3e4666bf-d5e5-4aa7-b8ce-cefe41c7568a',
        eventType: 'identity.login_suspicious',
        eventVersion: 1,
        occurredAt: payload.occurredAt,
        producer: 'atlas-api',
        aggregateType: 'session_family',
        aggregateId: 'e97d36af-d702-458f-9b0f-fc57d63d09d1',
        aggregateVersion: 3,
        correlationId: '3e4666bf-d5e5-4aa7-b8ce-cefe41c7568a',
        causationId: null,
        actor: { type: 'customer', id: payload.userId },
        data: payload,
      }).success,
      true,
    );
  });

  it('validates liveness and dependency-aware readiness payloads', () => {
    const ready = HealthResponseSchema.parse({
      status: 'ok',
      service: 'atlas-api',
      timestamp: '2026-10-03T12:00:00.000Z',
      correlationId: '3e4666bf-d5e5-4aa7-b8ce-cefe41c7568a',
      dependencies: { postgres: 'up' },
    });

    assert.equal(ready.dependencies?.postgres, 'up');
  });
});
