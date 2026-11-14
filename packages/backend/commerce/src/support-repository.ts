import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
  CorrelationIdSchema,
  CreateSupportCaseInputSchema,
  EventEnvelopeSchema,
  SupportCursorSchema,
  SupportListQuerySchema,
  SupportPageQuerySchema,
  type SupportCursor,
  SafeApplicationError,
  SupportActionInputSchema,
  SupportCaseSchema,
  SupportDetailSchema,
  SupportListSchema,
  UuidSchema,
  type SupportCase,
} from '@atlas/contracts';

export type SupportOwner =
  | { type: 'customer' | 'staff'; userId: string }
  | { type: 'seller_user'; userId: string; sellerId: string };
const actorValues = (actor: SupportOwner) => {
  if (!['customer', 'seller_user', 'staff'].includes(actor.type))
    throw new SafeApplicationError('FORBIDDEN');
  return [
    actor.type,
    UuidSchema.parse(actor.userId),
    actor.type === 'seller_user' ? UuidSchema.parse(actor.sellerId) : null,
  ];
};
const stamp = (column: string) =>
  `to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const columns = `c.id,c.seller_order_id AS "sellerOrderId",so.order_id AS "orderId",so.snapshot->>'sellerName' AS "sellerName",c.category,c.status,c.row_version AS version,${stamp('c.created_at')} AS "createdAt",${stamp('c.updated_at')} AS "updatedAt"`;
const joins =
  'FROM commerce.support_cases c JOIN commerce.seller_orders so ON so.id=c.seller_order_id JOIN commerce.orders o ON o.id=so.order_id';
const scope = `(($1='customer' AND o.customer_id=$2::uuid) OR ($1='seller_user' AND so.seller_id=$3::uuid) OR ($1='staff' AND (c.status='ESCALATED' OR EXISTS(SELECT 1 FROM commerce.support_messages sm WHERE sm.case_id=c.id AND sm.actor_type='staff'))))`;
const invalid = () => new SafeApplicationError('VALIDATION_FAILED');
const conflict = () => new SafeApplicationError('SUPPORT_CONFLICT');

export class PostgresSupportRepository {
  constructor(private readonly pool: Pool) {}

  private async transaction<T>(run: (db: PoolClient) => Promise<T>): Promise<T> {
    const db = await this.pool.connect();
    let broken = false;
    try {
      await db.query('BEGIN');
      const result = await run(db);
      await db.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await db.query('ROLLBACK');
      } catch {
        broken = true;
      }
      throw error;
    } finally {
      db.release(broken);
    }
  }

  async list(actor: SupportOwner, query: unknown = {}) {
    const input = SupportListQuerySchema.safeParse(query);
    if (!input.success) throw invalid();
    let cursor: SupportCursor | undefined;
    if (input.data.cursor) {
      try {
        cursor = SupportCursorSchema.parse(
          JSON.parse(Buffer.from(input.data.cursor, 'base64url').toString('utf8')),
        );
      } catch {
        throw invalid();
      }
    }
    const rows = await this.pool.query(
      `SELECT ${columns} ${joins} WHERE ${scope} AND ($4::timestamptz IS NULL OR (c.created_at,c.id)<($4::timestamptz,$5::uuid)) ORDER BY c.created_at DESC,c.id DESC LIMIT 51`,
      [...actorValues(actor), cursor?.createdAt ?? null, cursor?.id ?? null],
    );
    const items = rows.rows.slice(0, 50).map((row: unknown) => SupportCaseSchema.parse(row));
    const last = items.at(-1);
    return SupportListSchema.parse({
      items,
      nextCursor:
        rows.rows.length > 50 && last
          ? Buffer.from(JSON.stringify({ createdAt: last.createdAt, id: last.id })).toString(
              'base64url',
            )
          : null,
    });
  }

  private async detail(
    db: Pool | PoolClient,
    actor: SupportOwner,
    id: string,
    beforeVersion?: number,
  ) {
    const result = await db.query(`SELECT ${columns} ${joins} WHERE ${scope} AND c.id=$4`, [
      ...actorValues(actor),
      UuidSchema.parse(id),
    ]);
    if (!result.rows[0]) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    const rows = await db.query(
      `SELECT version,CASE actor_type WHEN 'customer' THEN 'CUSTOMER' WHEN 'seller_user' THEN 'SELLER' ELSE 'STAFF' END AS attribution,action,body,${stamp('created_at')} AS "createdAt" FROM commerce.support_messages WHERE case_id=$1 AND ($2::integer IS NULL OR version<$2) ORDER BY version DESC LIMIT 51`,
      [id, beforeVersion ?? null],
    );
    const messages = rows.rows.slice(0, 50).reverse();
    return SupportDetailSchema.parse({
      case: result.rows[0],
      messages,
      nextBeforeVersion: rows.rows.length > 50 ? messages[0]?.version : null,
    });
  }

  async get(actor: SupportOwner, id: string, query: unknown = {}) {
    const page = SupportPageQuerySchema.safeParse(query);
    if (!page.success) throw invalid();
    return this.detail(this.pool, actor, id, page.data.beforeVersion);
  }

  async forOrder(actor: SupportOwner, sellerOrderId: string) {
    const result = await this.pool.query(
      `SELECT c.id ${joins} WHERE ${scope} AND c.seller_order_id=$4`,
      [...actorValues(actor), UuidSchema.parse(sellerOrderId)],
    );
    return result.rows[0] ? this.detail(this.pool, actor, String(result.rows[0].id)) : null;
  }

  private async evidence(
    db: PoolClient,
    actor: SupportOwner,
    item: SupportCase,
    correlationId: string,
  ) {
    const data = { caseId: item.id, sellerOrderId: item.sellerOrderId, status: item.status };
    const envelope = EventEnvelopeSchema.parse({
      eventId: randomUUID(),
      eventType: 'support.case_changed',
      eventVersion: 1,
      occurredAt: item.updatedAt,
      producer: 'atlas-api',
      aggregateType: 'support_case',
      aggregateId: item.id,
      aggregateVersion: item.version,
      correlationId,
      causationId: null,
      actor: { type: actor.type, id: actor.userId },
      data,
    });
    await db.query(
      `INSERT INTO platform.audit_events(occurred_at,actor_type,actor_id,scope_snapshot,action,outcome,entity_type,entity_id,entity_version,correlation_id,after_data) VALUES($1,$2,$3,$4,'support.case_changed','SUCCEEDED','support_case',$5,$6,$7,$8)`,
      [
        item.updatedAt,
        actor.type,
        actor.userId,
        actor.type === 'seller_user' ? { type: 'SELLER', id: actor.sellerId } : { type: 'GLOBAL' },
        item.id,
        item.version,
        correlationId,
        data,
      ],
    );
    await db.query(
      `INSERT INTO platform.outbox_events(event_id,event_type,event_version,producer,aggregate_type,aggregate_id,aggregate_version,payload,actor_type,actor_id,correlation_id,occurred_at) VALUES($1,'support.case_changed',1,'atlas-api','support_case',$2,$3,$4,$5,$6,$7,$8)`,
      [
        envelope.eventId,
        item.id,
        item.version,
        data,
        actor.type,
        actor.userId,
        correlationId,
        item.updatedAt,
      ],
    );
  }

  async create(actor: SupportOwner, input: unknown, correlationId: string) {
    actorValues(actor);
    if (actor.type !== 'customer') throw new SafeApplicationError('FORBIDDEN');
    const parsed = CreateSupportCaseInputSchema.safeParse(input);
    if (!parsed.success) throw invalid();
    CorrelationIdSchema.parse(correlationId);
    const data = parsed.data;
    return this.transaction(async (db) => {
      const owned = await db.query(
        'SELECT so.id FROM commerce.seller_orders so JOIN commerce.orders o ON o.id=so.order_id WHERE so.id=$1 AND o.customer_id=$2 FOR UPDATE OF so',
        [data.sellerOrderId, actor.userId],
      );
      if (!owned.rows[0]) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
      const existing = await db.query(
        'SELECT c.id,c.category,m.body FROM commerce.support_cases c JOIN commerce.support_messages m ON m.case_id=c.id AND m.version=1 WHERE c.seller_order_id=$1',
        [data.sellerOrderId],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].category !== data.category || existing.rows[0].body !== data.body)
          throw conflict();
        return this.detail(db, actor, String(existing.rows[0].id));
      }
      const id = randomUUID();
      await db.query(
        'INSERT INTO commerce.support_cases(id,seller_order_id,category) VALUES($1,$2,$3)',
        [id, data.sellerOrderId, data.category],
      );
      await db.query(
        "INSERT INTO commerce.support_messages(case_id,version,actor_id,actor_type,action,body,request_id) VALUES($1,1,$2,'customer','OPEN',$3,$1)",
        [id, actor.userId, data.body],
      );
      const detail = await this.detail(db, actor, id);
      await this.evidence(db, actor, detail.case, correlationId);
      return detail;
    });
  }

  async act(actor: SupportOwner, id: string, input: unknown, correlationId: string) {
    const parsed = SupportActionInputSchema.safeParse(input);
    if (!parsed.success) throw invalid();
    UuidSchema.parse(id);
    CorrelationIdSchema.parse(correlationId);
    const data = parsed.data;
    return this.transaction(async (db) => {
      const found = await db.query(
        `SELECT ${columns} ${joins} WHERE ${scope} AND c.id=$4 FOR UPDATE OF c`,
        [...actorValues(actor), id],
      );
      if (!found.rows[0]) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
      const current = SupportCaseSchema.parse(found.rows[0]);
      if (actor.type === 'seller_user') {
        const seller = await db.query(
          "SELECT id FROM sellers.sellers WHERE id=$1 AND status='APPROVED' FOR SHARE",
          [actor.sellerId],
        );
        if (!seller.rows[0]) throw new SafeApplicationError('FORBIDDEN');
      }
      const prior = await db.query(
        'SELECT actor_id,actor_type,action,body,version FROM commerce.support_messages WHERE case_id=$1 AND request_id=$2',
        [id, data.requestId],
      );
      if (prior.rows[0]) {
        const m = prior.rows[0];
        if (
          m.actor_id !== actor.userId ||
          m.actor_type !== actor.type ||
          m.action !== data.action ||
          m.body !== data.body ||
          m.version !== data.expectedVersion + 1
        )
          throw conflict();
        return this.detail(db, actor, id);
      }
      if (current.version !== data.expectedVersion) throw conflict();
      let status: SupportCase['status'];
      if (actor.type === 'seller_user') {
        if (data.action !== 'REPLY' || current.status === 'RESOLVED')
          throw new SafeApplicationError('FORBIDDEN');
        status = current.status === 'ESCALATED' ? 'ESCALATED' : 'WAITING_CUSTOMER';
      } else if (actor.type === 'staff') {
        if (current.status !== 'ESCALATED' || !['REPLY', 'STAFF_RESOLVE'].includes(data.action))
          throw new SafeApplicationError('FORBIDDEN');
        status = data.action === 'STAFF_RESOLVE' ? 'RESOLVED' : 'ESCALATED';
      } else {
        if (data.action === 'STAFF_RESOLVE') throw new SafeApplicationError('FORBIDDEN');
        if (data.action !== 'REPLY' && current.status === 'RESOLVED') throw conflict();
        status =
          data.action === 'CONFIRM_RESOLUTION'
            ? 'RESOLVED'
            : data.action === 'ESCALATE' || current.status === 'ESCALATED'
              ? 'ESCALATED'
              : 'OPEN';
      }
      await db.query(
        'UPDATE commerce.support_cases SET status=$2,row_version=row_version+1,updated_at=clock_timestamp() WHERE id=$1',
        [id, status],
      );
      await db.query(
        'INSERT INTO commerce.support_messages(case_id,version,actor_id,actor_type,action,body,request_id) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [id, current.version + 1, actor.userId, actor.type, data.action, data.body, data.requestId],
      );
      const detail = await this.detail(db, actor, id);
      await this.evidence(db, actor, detail.case, correlationId);
      return detail;
    });
  }
}
