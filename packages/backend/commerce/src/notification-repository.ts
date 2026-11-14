import {
  NotificationCursorSchema,
  NotificationPageSchema,
  NotificationQuerySchema,
  NotificationReadInputSchema,
  NotificationReadResultSchema,
  SafeApplicationError,
  UuidSchema,
  type NotificationReadInput,
  type OrderNotification,
} from '@atlas/contracts';
import type { Pool } from 'pg';

export type NotificationOwner =
  | { readonly type: 'customer'; readonly userId: string }
  | { readonly type: 'seller_user'; readonly userId: string; readonly sellerId: string };

const joins = `FROM commerce.seller_order_history h
  JOIN commerce.seller_orders so ON so.id=h.seller_order_id
  JOIN commerce.orders o ON o.id=so.order_id`;
const scope = `(($1='customer' AND o.customer_id=$2::uuid)
  OR ($1='seller_user' AND so.seller_id=$2::uuid))`;
const time = (column: string) =>
  `to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

function ownerValues(owner: NotificationOwner) {
  const user = UuidSchema.safeParse(owner.userId);
  const target = UuidSchema.safeParse(owner.type === 'seller_user' ? owner.sellerId : owner.userId);
  if (!['customer', 'seller_user'].includes(owner.type) || !user.success || !target.success)
    throw new SafeApplicationError('FORBIDDEN');
  return [owner.type, target.data, user.data];
}

export class PostgresOrderNotificationRepository {
  constructor(private readonly pool: Pool) {}

  async list(owner: NotificationOwner, query: unknown = {}) {
    const parsed = NotificationQuerySchema.safeParse(query);
    if (!parsed.success) throw new SafeApplicationError('VALIDATION_FAILED');
    let cursor = null;
    if (parsed.data.cursor) {
      try {
        cursor = NotificationCursorSchema.parse(
          JSON.parse(Buffer.from(parsed.data.cursor, 'base64url').toString('utf8')),
        );
      } catch {
        throw new SafeApplicationError('VALIDATION_FAILED');
      }
    }
    const values = ownerValues(owner);
    const result = await this.pool.query<OrderNotification>(
      `SELECT h.seller_order_id AS "sellerOrderId", h.version, so.order_id AS "orderId",
        so.snapshot->>'sellerName' AS "sellerName", h.status,
        CASE h.actor_type WHEN 'seller_user' THEN 'SELLER' WHEN 'customer' THEN 'CUSTOMER' ELSE 'SYSTEM' END AS attribution,
        ${time('h.occurred_at')} AS "occurredAt", ${time('r.read_at')} AS "readAt"
       ${joins} LEFT JOIN commerce.order_notification_reads r
         ON r.seller_order_id=h.seller_order_id AND r.version=h.version AND r.user_id=$3::uuid
       WHERE ${scope} AND ($4::timestamptz IS NULL OR
         (h.occurred_at,h.seller_order_id,h.version)<($4::timestamptz,$5::uuid,$6::integer))
       ORDER BY h.occurred_at DESC,h.seller_order_id DESC,h.version DESC LIMIT 31`,
      [
        ...values,
        cursor?.occurredAt ?? null,
        cursor?.sellerOrderId ?? null,
        cursor?.version ?? null,
      ],
    );
    const count = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count ${joins}
       WHERE ${scope} AND NOT EXISTS (SELECT 1 FROM commerce.order_notification_reads r
         WHERE r.user_id=$3::uuid AND r.seller_order_id=h.seller_order_id AND r.version=h.version)`,
      values,
    );
    const items = result.rows.slice(0, 30);
    const last = items.at(-1);
    return NotificationPageSchema.parse({
      items,
      unreadCount: Number(count.rows[0]?.count ?? 0),
      nextCursor:
        result.rows.length > 30 && last
          ? Buffer.from(
              JSON.stringify({
                occurredAt: last.occurredAt,
                sellerOrderId: last.sellerOrderId,
                version: last.version,
              }),
            ).toString('base64url')
          : null,
    });
  }

  async markRead(owner: NotificationOwner, input: NotificationReadInput) {
    const parsed = NotificationReadInputSchema.safeParse(input);
    if (!parsed.success) throw new SafeApplicationError('VALIDATION_FAILED');
    const result = await this.pool.query<{ readAt: string }>(
      `INSERT INTO commerce.order_notification_reads(user_id,seller_order_id,version)
       SELECT $3::uuid,h.seller_order_id,h.version ${joins}
       WHERE ${scope} AND h.seller_order_id=$4::uuid AND h.version=$5
       ON CONFLICT(user_id,seller_order_id,version) DO UPDATE
         SET read_at=commerce.order_notification_reads.read_at
       RETURNING ${time('read_at')} AS "readAt"`,
      [...ownerValues(owner), parsed.data.sellerOrderId, parsed.data.version],
    );
    if (!result.rows[0]) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    return NotificationReadResultSchema.parse(result.rows[0]);
  }
}
