import type { Pool } from 'pg';

export type ReportErrorCode = 'NOT_FOUND' | 'LIMIT_REACHED';
export class ReportError extends Error {
  public constructor(public readonly code: ReportErrorCode) {
    super(code);
    this.name = 'ReportError';
  }
}

/** Reports a customer may file per 24 hours (all products). */
export const REPORTS_PER_DAY = 10;

const ISO = (column: string) =>
  `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

export class PostgresReportRepository {
  public constructor(private readonly pool: Pool) {}

  /** Files (or, when one is already open, updates) the customer's report on a public product. */
  public async report(
    customerId: string,
    slug: string,
    input: { reason: string; details?: string | undefined },
  ) {
    const client = await this.pool.connect();
    let broken = false;
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM identity.users WHERE id = $1 FOR UPDATE', [customerId]);
      const product = await client.query<{ id: string }>(
        `SELECT id FROM catalog.products WHERE slug = $1 AND status = 'ACTIVE' AND moderation_status = 'APPROVED'`,
        [slug],
      );
      const productId = product.rows[0]?.id;
      if (productId === undefined) throw new ReportError('NOT_FOUND');
      const recent = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM catalog.product_reports
         WHERE reporter_id = $1 AND created_at > clock_timestamp() - interval '24 hours'`,
        [customerId],
      );
      if ((recent.rows[0]?.n ?? 0) >= REPORTS_PER_DAY) throw new ReportError('LIMIT_REACHED');
      await client.query(
        `INSERT INTO catalog.product_reports (product_id, reporter_id, reason, details)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (product_id, reporter_id) WHERE status = 'OPEN'
         DO UPDATE SET reason = EXCLUDED.reason, details = EXCLUDED.details`,
        [productId, customerId, input.reason, input.details ?? null],
      );
      await client.query('COMMIT');
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        broken = true;
      }
      throw error;
    } finally {
      client.release(broken);
    }
  }

  /** Products with open reports, most reported first (reasons counted, latest details). */
  public async openByProduct() {
    const result = await this.pool.query<{ item: unknown }>(
      `SELECT jsonb_build_object(
         'productId', p.id, 'slug', p.slug, 'title', p.title_fr, 'productStatus', p.status,
         'count', count(*)::int,
         'reasons', (SELECT jsonb_object_agg(x.reason, x.n) FROM (
           SELECT reason, count(*)::int AS n FROM catalog.product_reports
           WHERE product_id = p.id AND status = 'OPEN' GROUP BY reason) x),
         'latestAt', ${ISO('max(r.created_at)')},
         'details', COALESCE(jsonb_agg(r.details ORDER BY r.created_at DESC)
           FILTER (WHERE r.details IS NOT NULL), '[]'::jsonb)
       ) AS item
       FROM catalog.product_reports r JOIN catalog.products p ON p.id = r.product_id
       WHERE r.status = 'OPEN'
       GROUP BY p.id ORDER BY count(*) DESC, max(r.created_at) DESC LIMIT 100`,
    );
    return result.rows.map((row) => row.item);
  }

  /** Closes a product's open reports (DISMISSED or ACTIONED); audited. Returns how many. */
  public async resolve(
    productId: string,
    outcome: 'DISMISSED' | 'ACTIONED',
    staffUserId: string,
    correlationId: string,
  ): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query(
        `UPDATE catalog.product_reports SET status = $2, resolved_at = clock_timestamp(), resolved_by = $3
         WHERE product_id = $1 AND status = 'OPEN'`,
        [productId, outcome, staffUserId],
      );
      await client.query(
        `INSERT INTO platform.audit_events
           (actor_type, actor_id, scope_snapshot, action, outcome, entity_type, entity_id, correlation_id, after_data)
         VALUES ('staff', $1, '{"type":"GLOBAL"}', 'product_reports.resolved', 'SUCCEEDED', 'product', $2, $3, $4)`,
        [staffUserId, productId, correlationId, JSON.stringify({ outcome, reports: updated.rowCount })],
      );
      await client.query('COMMIT');
      return updated.rowCount ?? 0;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
