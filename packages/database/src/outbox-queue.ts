import { randomInt, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export interface OutboxRetryPolicy {
  readonly maxAttempts: number;
  readonly leaseMs: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
}

export interface OutboxClaim {
  readonly eventId: string;
  readonly eventType: string;
  readonly eventVersion: number;
  readonly producer: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  // PostgreSQL bigint is deliberately not rounded to a JavaScript number.
  readonly aggregateVersion: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly actorType: string;
  readonly actorId: string | null;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly occurredAt: Date;
  readonly leaseToken: string;
  readonly attempt: number;
}

const failureCodes = [
  'BROKER_UNAVAILABLE',
  'BROKER_TIMEOUT',
  'INVALID_EVENT',
  'UNSUPPORTED_EVENT',
  'PUBLISH_REJECTED',
] as const;
export type OutboxFailureCode = (typeof failureCodes)[number];

function boundedInteger(value: number, min: number, max: number): void {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error('Invalid outbox queue configuration or limit');
}

/** Infrastructure only: no broker calls, notification effects, or automatic replay. */
export class PostgresOutboxQueue {
  private readonly policy: OutboxRetryPolicy;

  public constructor(
    private readonly pool: Pool,
    private readonly workerName: string,
    policy: OutboxRetryPolicy,
  ) {
    if (!/^[a-z][a-z0-9-]{1,79}$/.test(workerName)) throw new Error('Invalid outbox worker name');
    boundedInteger(policy.maxAttempts, 1, 100);
    boundedInteger(policy.leaseMs, 100, 300_000);
    boundedInteger(policy.baseDelayMs, 10, 3_600_000);
    boundedInteger(policy.maxDelayMs, policy.baseDelayMs, 3_600_000);
    this.policy = Object.freeze({ ...policy });
  }

  public async claim(limit = 20): Promise<readonly OutboxClaim[]> {
    boundedInteger(limit, 1, 100);
    // A crash on the last allowed attempt must not strand a row forever. Recovery is bounded
    // and never steals a live lease. FAILED predecessors continue to block their aggregate.
    await this.pool.query(
      `WITH exhausted AS (
         SELECT event_id FROM platform.outbox_events
         WHERE delivery_state = 'PENDING' AND attempt_count >= $1
           AND (locked_until IS NULL OR locked_until <= clock_timestamp())
         ORDER BY available_at, occurred_at, event_id
         LIMIT $2 FOR UPDATE SKIP LOCKED
       )
       UPDATE platform.outbox_events e
       SET delivery_state = 'FAILED', locked_by = NULL, locked_until = NULL,
           last_error_code = 'LEASE_EXHAUSTED', last_error_detail = NULL,
           available_at = clock_timestamp()
       FROM exhausted x WHERE e.event_id = x.event_id`,
      [this.policy.maxAttempts, limit],
    );
    const leaseToken = `${this.workerName}:${randomUUID()}`;
    const result = await this.pool.query<OutboxClaim>(
      `WITH candidates AS (
         SELECT e.event_id FROM platform.outbox_events e
         WHERE e.delivery_state = 'PENDING' AND e.attempt_count < $1
           AND e.available_at <= clock_timestamp()
           AND (e.locked_until IS NULL OR e.locked_until <= clock_timestamp())
           AND NOT EXISTS (
             SELECT 1 FROM platform.outbox_events predecessor
             WHERE predecessor.aggregate_type = e.aggregate_type
               AND predecessor.aggregate_id = e.aggregate_id
               AND predecessor.delivery_state <> 'PUBLISHED'
               AND (predecessor.aggregate_version, predecessor.event_type, predecessor.event_id)
                 < (e.aggregate_version, e.event_type, e.event_id)
           )
         ORDER BY e.available_at, e.occurred_at, e.event_id
         LIMIT $2 FOR UPDATE OF e SKIP LOCKED
       )
       UPDATE platform.outbox_events e
       SET locked_by = $3, locked_until = clock_timestamp() + $4 * interval '1 millisecond',
           attempt_count = e.attempt_count + 1
       FROM candidates c WHERE e.event_id = c.event_id
       RETURNING e.event_id AS "eventId", e.event_type AS "eventType",
         e.event_version AS "eventVersion", e.producer, e.aggregate_type AS "aggregateType",
         e.aggregate_id AS "aggregateId", e.aggregate_version::text AS "aggregateVersion",
         e.payload AS data, e.actor_type AS "actorType", e.actor_id AS "actorId",
         e.correlation_id AS "correlationId", e.causation_id AS "causationId",
         e.occurred_at AS "occurredAt", e.locked_by AS "leaseToken", e.attempt_count AS attempt`,
      [this.policy.maxAttempts, limit, leaseToken, this.policy.leaseMs],
    );
    return result.rows;
  }

  /** Call only after durable broker confirmation. False means the lease is no longer owned. */
  public async acknowledge(claim: OutboxClaim): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE platform.outbox_events
       SET delivery_state = 'PUBLISHED', published_at = clock_timestamp(),
           locked_by = NULL, locked_until = NULL, last_error_code = NULL, last_error_detail = NULL
       WHERE event_id = $1 AND locked_by = $2 AND attempt_count = $3
         AND delivery_state = 'PENDING' AND locked_until > clock_timestamp()`,
      [claim.eventId, claim.leaseToken, claim.attempt],
    );
    return result.rowCount === 1;
  }

  public async fail(
    claim: OutboxClaim,
    code: OutboxFailureCode,
    retryable: boolean,
  ): Promise<boolean> {
    if (!failureCodes.includes(code) || typeof retryable !== 'boolean')
      throw new Error('Invalid outbox failure classification');
    boundedInteger(claim.attempt, 1, 100);
    const ceiling = Math.min(
      this.policy.maxDelayMs,
      this.policy.baseDelayMs * 2 ** (claim.attempt - 1),
    );
    const delayMs = randomInt(Math.ceil(ceiling / 2), ceiling + 1);
    const result = await this.pool.query(
      `UPDATE platform.outbox_events
       SET delivery_state = CASE WHEN attempt_count >= $4 OR NOT $6 THEN 'FAILED' ELSE 'PENDING' END,
           available_at = clock_timestamp() + CASE WHEN attempt_count >= $4 OR NOT $6
             THEN 0 ELSE $5 END * interval '1 millisecond',
           locked_by = NULL, locked_until = NULL, last_error_code = $7, last_error_detail = NULL
       WHERE event_id = $1 AND locked_by = $2 AND attempt_count = $3
         AND delivery_state = 'PENDING' AND locked_until > clock_timestamp()`,
      [
        claim.eventId,
        claim.leaseToken,
        claim.attempt,
        this.policy.maxAttempts,
        delayMs,
        retryable,
        code,
      ],
    );
    return result.rowCount === 1;
  }

  /** Operational metadata only: payloads and provider exception details are never exposed here. */
  public async listFailed(limit = 20) {
    boundedInteger(limit, 1, 100);
    const result = await this.pool.query<{
      eventId: string;
      eventType: string;
      correlationId: string;
      attempt: number;
      errorCode: string | null;
    }>(
      `SELECT event_id AS "eventId", event_type AS "eventType", correlation_id AS "correlationId",
         attempt_count AS attempt, last_error_code AS "errorCode"
       FROM platform.outbox_events WHERE delivery_state = 'FAILED'
       ORDER BY available_at, event_id LIMIT $1`,
      [limit],
    );
    return result.rows;
  }
}
