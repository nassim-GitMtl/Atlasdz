import type { Pool, PoolClient } from 'pg';
import {
  CatalogSlugSchema,
  CorrelationIdSchema,
  DeleteReviewQuerySchema,
  OrderReviewsSchema,
  OwnReviewSchema,
  REVIEW_PAGE_SIZE,
  ReviewCursorSchema,
  ReviewListQuerySchema,
  ReviewModerationInputSchema,
  ReviewPageSchema,
  ReviewReplyInputSchema,
  SafeApplicationError,
  SellerReviewPageSchema,
  SellerReviewSchema,
  StaffReviewListQuerySchema,
  StaffReviewPageSchema,
  StaffReviewSchema,
  UuidSchema,
  WriteReviewInputSchema,
  type OwnReview,
  type ReviewCursor,
  type ReviewSummary,
} from '@atlas/contracts';

export type ReviewActor =
  | { readonly type: 'customer' | 'staff'; readonly userId: string }
  | { readonly type: 'seller_user'; readonly userId: string; readonly sellerId: string };

/** The seller reported the delivery, or the buyer confirmed it. */
const REVIEWABLE = new Set(['DELIVERY_REPORTED', 'DELIVERED']);
const stamp = (column: string) =>
  `to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const publicColumns = `r.id, r.rating, r.body,
  jsonb_build_object('fr', p.title_fr, 'ar', p.title_ar) AS "productTitle",
  s.name AS "sellerName", r.reply, ${stamp('r.replied_at')} AS "repliedAt",
  ${stamp('r.created_at')} AS "createdAt", ${stamp('r.updated_at')} AS "updatedAt"`;
const sellerColumns = `${publicColumns}, r.product_id AS "productId",
  r.seller_order_id AS "sellerOrderId", r.status, r.row_version AS version`;
const staffColumns = `${sellerColumns}, r.moderation_reason AS "moderationReason"`;
const ownColumns = `r.id, r.rating, r.body, r.status, r.reply, ${stamp('r.replied_at')} AS "repliedAt",
  r.row_version AS version, ${stamp('r.created_at')} AS "createdAt", ${stamp('r.updated_at')} AS "updatedAt"`;
const joins = `FROM commerce.product_reviews r
  JOIN catalog.products p ON p.id = r.product_id
  JOIN sellers.sellers s ON s.id = r.seller_id`;
const after = (index: number) =>
  `($${index}::timestamptz IS NULL OR (r.created_at, r.id) < ($${index}::timestamptz, $${index + 1}::uuid))`;
const newestFirst = `ORDER BY r.created_at DESC, r.id DESC LIMIT ${REVIEW_PAGE_SIZE + 1}`;

const invalid = () => new SafeApplicationError('VALIDATION_FAILED');
const conflict = () => new SafeApplicationError('REVIEW_CONFLICT');
const notFound = () => new SafeApplicationError('RESOURCE_NOT_FOUND');
const uuid = (value: string) => {
  const parsed = UuidSchema.safeParse(value);
  if (!parsed.success) throw notFound();
  return parsed.data;
};

function cursorOf(
  query: unknown,
  schema: typeof ReviewListQuerySchema | typeof StaffReviewListQuerySchema = ReviewListQuerySchema,
) {
  const input = schema.safeParse(query);
  if (!input.success) throw invalid();
  let cursor: ReviewCursor | undefined;
  if (input.data.cursor !== undefined) {
    try {
      cursor = ReviewCursorSchema.parse(
        JSON.parse(Buffer.from(input.data.cursor, 'base64url').toString('utf8')),
      );
    } catch {
      throw invalid();
    }
  }
  return { input: input.data, values: [cursor?.createdAt ?? null, cursor?.id ?? null] };
}

function page<T extends { createdAt: string; id: string }>(rows: readonly T[]) {
  const items = rows.slice(0, REVIEW_PAGE_SIZE);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      rows.length > REVIEW_PAGE_SIZE && last
        ? Buffer.from(JSON.stringify({ createdAt: last.createdAt, id: last.id })).toString(
            'base64url',
          )
        : null,
  };
}

const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';

export class PostgresReviewRepository {
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

  private async summary(where: string, values: readonly unknown[]): Promise<ReviewSummary> {
    const result = await this.pool.query<{
      count: number;
      average: number | null;
      s1: number;
      s2: number;
      s3: number;
      s4: number;
      s5: number;
    }>(
      `SELECT count(*)::int AS count, round(avg(r.rating), 1)::float8 AS average,
         count(*) FILTER (WHERE r.rating = 1)::int AS s1, count(*) FILTER (WHERE r.rating = 2)::int AS s2,
         count(*) FILTER (WHERE r.rating = 3)::int AS s3, count(*) FILTER (WHERE r.rating = 4)::int AS s4,
         count(*) FILTER (WHERE r.rating = 5)::int AS s5
       FROM commerce.product_reviews r WHERE r.status = 'PUBLISHED' AND ${where}`,
      [...values],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error('Review summary returned no row');
    return {
      count: row.count,
      average: row.average,
      stars: [row.s1, row.s2, row.s3, row.s4, row.s5],
    };
  }

  private async audit(
    db: PoolClient,
    actor: ReviewActor,
    action:
      'review.written' | 'review.deleted' | 'review.replied' | 'review.hidden' | 'review.published',
    review: { readonly id: string; readonly version: number },
    data: Record<string, unknown>,
    correlationId: string,
    reason: string | null = null,
  ) {
    // Review text stays out of the append-only audit trail: deleting it must really delete it.
    await db.query(
      `INSERT INTO platform.audit_events(occurred_at,actor_type,actor_id,scope_snapshot,action,outcome,entity_type,entity_id,entity_version,correlation_id,after_data,reason)
       VALUES(clock_timestamp(),$1,$2,$3,$4,'SUCCEEDED','product_review',$5,$6,$7,$8,$9)`,
      [
        actor.type,
        actor.userId,
        actor.type === 'seller_user' ? { type: 'SELLER', id: actor.sellerId } : { type: 'GLOBAL' },
        action,
        review.id,
        review.version,
        correlationId,
        data,
        reason,
      ],
    );
  }

  private customer(actor: ReviewActor) {
    if (actor.type !== 'customer') throw new SafeApplicationError('FORBIDDEN');
    return UuidSchema.parse(actor.userId);
  }

  private seller(actor: ReviewActor) {
    if (actor.type !== 'seller_user') throw new SafeApplicationError('FORBIDDEN');
    UuidSchema.parse(actor.userId);
    return UuidSchema.parse(actor.sellerId);
  }

  private staff(actor: ReviewActor) {
    if (actor.type !== 'staff') throw new SafeApplicationError('FORBIDDEN');
    return UuidSchema.parse(actor.userId);
  }

  /** Public: published reviews of a listed product. */
  async forProduct(slug: string, query: unknown = {}) {
    const parsed = CatalogSlugSchema.safeParse(slug);
    if (!parsed.success) throw notFound();
    const { values } = cursorOf(query);
    const product = await this.pool.query<{ id: string }>(
      `SELECT id FROM catalog.products
       WHERE slug = $1 AND status = 'ACTIVE' AND moderation_status = 'APPROVED'`,
      [parsed.data],
    );
    const productId = product.rows[0]?.id;
    if (productId === undefined) throw notFound();
    const rows = await this.pool.query(
      `SELECT ${publicColumns} ${joins}
       WHERE r.product_id = $1 AND r.status = 'PUBLISHED' AND ${after(2)} ${newestFirst}`,
      [productId, ...values],
    );
    return ReviewPageSchema.parse({
      summary: await this.summary('r.product_id = $1', [productId]),
      ...page(rows.rows),
    });
  }

  /** Public: published reviews of everything an approved seller sold. */
  async forSeller(slug: string, query: unknown = {}) {
    const parsed = CatalogSlugSchema.safeParse(slug);
    if (!parsed.success) throw notFound();
    const { values } = cursorOf(query);
    const seller = await this.pool.query<{ id: string }>(
      "SELECT id FROM sellers.sellers WHERE slug = $1 AND status = 'APPROVED'",
      [parsed.data],
    );
    const sellerId = seller.rows[0]?.id;
    if (sellerId === undefined) throw notFound();
    const rows = await this.pool.query(
      `SELECT ${publicColumns} ${joins}
       WHERE r.seller_id = $1 AND r.status = 'PUBLISHED' AND ${after(2)} ${newestFirst}`,
      [sellerId, ...values],
    );
    return ReviewPageSchema.parse({
      summary: await this.summary('r.seller_id = $1', [sellerId]),
      ...page(rows.rows),
    });
  }

  /** The buyer's items of one seller order, with their own reviews. */
  async forOrder(actor: ReviewActor, sellerOrderId: string) {
    const customerId = this.customer(actor);
    const id = uuid(sellerOrderId);
    const order = await this.pool.query<{
      status: string;
      items: { productId: string; title: unknown; imageUrl: string }[];
    }>(
      `SELECT so.status, so.snapshot->'items' AS items
       FROM commerce.seller_orders so JOIN commerce.orders o ON o.id = so.order_id
       WHERE so.id = $1 AND o.customer_id = $2`,
      [id, customerId],
    );
    const row = order.rows[0];
    if (row === undefined) throw notFound();
    const productIds = [...new Set(row.items.map((item) => item.productId))];
    const reviews = await this.pool.query<OwnReview & { productId: string }>(
      `SELECT r.product_id AS "productId", ${ownColumns}
       FROM commerce.product_reviews r WHERE r.seller_order_id = $1`,
      [id],
    );
    const listed = await this.pool.query<{ id: string; slug: string }>(
      `SELECT id, slug FROM catalog.products
       WHERE id = ANY($1::uuid[]) AND status = 'ACTIVE' AND moderation_status = 'APPROVED'`,
      [productIds],
    );
    const slugs = new Map(listed.rows.map((product) => [product.id, product.slug]));
    const own = new Map(
      reviews.rows.map(({ productId, ...review }) => [productId, OwnReviewSchema.parse(review)]),
    );
    return OrderReviewsSchema.parse({
      sellerOrderId: id,
      canReview: REVIEWABLE.has(row.status),
      items: productIds.map((productId) => {
        const item = row.items.find((candidate) => candidate.productId === productId);
        return {
          productId,
          slug: slugs.get(productId) ?? null,
          title: item?.title,
          imageUrl: item?.imageUrl,
          review: own.get(productId) ?? null,
        };
      }),
    });
  }

  /** Creates (expectedVersion 0) or edits the buyer's review of a delivered item. */
  async write(
    actor: ReviewActor,
    sellerOrderId: string,
    productId: string,
    input: unknown,
    correlationId: string,
  ): Promise<OwnReview> {
    const customerId = this.customer(actor);
    const orderId = uuid(sellerOrderId);
    const product = uuid(productId);
    const parsed = WriteReviewInputSchema.safeParse(input);
    if (!parsed.success) throw invalid();
    CorrelationIdSchema.parse(correlationId);
    const { rating, body, expectedVersion } = parsed.data;
    return this.transaction(async (db) => {
      const order = await db.query<{ status: string; sellerId: string; hasItem: boolean }>(
        `SELECT so.status, so.seller_id AS "sellerId",
           so.snapshot->'items' @> jsonb_build_array(jsonb_build_object('productId', $3::text)) AS "hasItem"
         FROM commerce.seller_orders so JOIN commerce.orders o ON o.id = so.order_id
         WHERE so.id = $1 AND o.customer_id = $2`,
        [orderId, customerId, product],
      );
      const row = order.rows[0];
      if (row === undefined || !row.hasItem) throw notFound();
      if (!REVIEWABLE.has(row.status)) throw new SafeApplicationError('REVIEW_NOT_ALLOWED');
      const existing = await db.query(
        `SELECT ${ownColumns} FROM commerce.product_reviews r
         WHERE r.seller_order_id = $1 AND r.product_id = $2 FOR UPDATE`,
        [orderId, product],
      );
      const current = existing.rows[0] ? OwnReviewSchema.parse(existing.rows[0]) : null;
      const data = { sellerOrderId: orderId, productId: product, rating };
      if (current === null) {
        if (expectedVersion !== 0) throw conflict();
        let created: OwnReview;
        try {
          const inserted = await db.query(
            `INSERT INTO commerce.product_reviews AS r
               (seller_order_id, seller_id, product_id, customer_id, rating, body)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${ownColumns}`,
            [orderId, row.sellerId, product, customerId, rating, body],
          );
          created = OwnReviewSchema.parse(inserted.rows[0]);
        } catch (error) {
          if (isUniqueViolation(error)) throw conflict();
          throw error;
        }
        await this.audit(db, actor, 'review.written', created, data, correlationId);
        return created;
      }
      const same = current.rating === rating && current.body === body;
      // A retried creation, or a save without changes, returns the review as it is.
      if (same && (expectedVersion === 0 || expectedVersion === current.version)) return current;
      if (current.version !== expectedVersion) throw conflict();
      const updated = await db.query(
        `UPDATE commerce.product_reviews AS r
         SET rating = $2, body = $3, row_version = row_version + 1, updated_at = clock_timestamp()
         WHERE r.id = $1 RETURNING ${ownColumns}`,
        [current.id, rating, body],
      );
      const review = OwnReviewSchema.parse(updated.rows[0]);
      await this.audit(db, actor, 'review.written', review, data, correlationId);
      return review;
    });
  }

  async remove(
    actor: ReviewActor,
    sellerOrderId: string,
    productId: string,
    query: unknown,
    correlationId: string,
  ) {
    const customerId = this.customer(actor);
    const orderId = uuid(sellerOrderId);
    const product = uuid(productId);
    const parsed = DeleteReviewQuerySchema.safeParse(query);
    if (!parsed.success) throw invalid();
    CorrelationIdSchema.parse(correlationId);
    return this.transaction(async (db) => {
      const found = await db.query<{ id: string; version: number }>(
        `SELECT r.id, r.row_version AS version FROM commerce.product_reviews r
         WHERE r.seller_order_id = $1 AND r.product_id = $2 AND r.customer_id = $3 FOR UPDATE`,
        [orderId, product, customerId],
      );
      const current = found.rows[0];
      if (current === undefined) throw notFound();
      if (current.version !== parsed.data.version) throw conflict();
      await db.query('DELETE FROM commerce.product_reviews WHERE id = $1', [current.id]);
      await this.audit(
        db,
        actor,
        'review.deleted',
        current,
        { sellerOrderId: orderId, productId: product },
        correlationId,
      );
      return { deleted: true as const };
    });
  }

  /** The seller's reviews (hidden ones included, marked) and their published average. */
  async sellerList(actor: ReviewActor, query: unknown = {}) {
    const sellerId = this.seller(actor);
    const { values } = cursorOf(query);
    const rows = await this.pool.query(
      `SELECT ${sellerColumns} ${joins} WHERE r.seller_id = $1 AND ${after(2)} ${newestFirst}`,
      [sellerId, ...values],
    );
    return SellerReviewPageSchema.parse({
      summary: await this.summary('r.seller_id = $1', [sellerId]),
      ...page(rows.rows),
    });
  }

  /** Publishes or replaces the seller's public answer to a review. */
  async reply(actor: ReviewActor, reviewId: string, input: unknown, correlationId: string) {
    const sellerId = this.seller(actor);
    const id = uuid(reviewId);
    const parsed = ReviewReplyInputSchema.safeParse(input);
    if (!parsed.success) throw invalid();
    CorrelationIdSchema.parse(correlationId);
    return this.transaction(async (db) => {
      const approved = await db.query(
        "SELECT id FROM sellers.sellers WHERE id = $1 AND status = 'APPROVED' FOR SHARE",
        [sellerId],
      );
      if (!approved.rows[0]) throw new SafeApplicationError('FORBIDDEN');
      const found = await db.query(
        `SELECT ${sellerColumns} ${joins} WHERE r.id = $1 AND r.seller_id = $2 FOR UPDATE OF r`,
        [id, sellerId],
      );
      if (!found.rows[0]) throw notFound();
      const current = SellerReviewSchema.parse(found.rows[0]);
      if (current.reply === parsed.data.body) return current;
      if (current.version !== parsed.data.expectedVersion || current.status !== 'PUBLISHED')
        throw conflict();
      await db.query(
        `UPDATE commerce.product_reviews
         SET reply = $2, replied_at = clock_timestamp(), row_version = row_version + 1,
             updated_at = clock_timestamp()
         WHERE id = $1`,
        [id, parsed.data.body],
      );
      const updated = await db.query(`SELECT ${sellerColumns} ${joins} WHERE r.id = $1`, [id]);
      const review = SellerReviewSchema.parse(updated.rows[0]);
      await this.audit(
        db,
        actor,
        'review.replied',
        review,
        { sellerOrderId: review.sellerOrderId, productId: review.productId },
        correlationId,
      );
      return review;
    });
  }

  /** Staff: newest reviews first, optionally only published or hidden ones. */
  async staffList(actor: ReviewActor, query: unknown = {}) {
    this.staff(actor);
    const { input, values } = cursorOf(query, StaffReviewListQuerySchema);
    const status = 'status' in input ? (input.status ?? null) : null;
    const rows = await this.pool.query(
      `SELECT ${staffColumns} ${joins}
       WHERE ($1::text IS NULL OR r.status = $1) AND ${after(2)} ${newestFirst}`,
      [status, ...values],
    );
    return StaffReviewPageSchema.parse(page(rows.rows));
  }

  /** Staff: hides a review with a reason, or publishes it again. */
  async moderate(actor: ReviewActor, reviewId: string, input: unknown, correlationId: string) {
    this.staff(actor);
    const id = uuid(reviewId);
    const parsed = ReviewModerationInputSchema.safeParse(input);
    if (!parsed.success) throw invalid();
    CorrelationIdSchema.parse(correlationId);
    const data = parsed.data;
    const status = data.action === 'HIDE' ? 'HIDDEN' : 'PUBLISHED';
    const reason = data.action === 'HIDE' ? data.reason : null;
    return this.transaction(async (db) => {
      const found = await db.query(
        `SELECT ${staffColumns} ${joins} WHERE r.id = $1 FOR UPDATE OF r`,
        [id],
      );
      if (!found.rows[0]) throw notFound();
      const current = StaffReviewSchema.parse(found.rows[0]);
      if (current.status === status && current.moderationReason === reason) return current;
      if (current.version !== data.expectedVersion) throw conflict();
      await db.query(
        `UPDATE commerce.product_reviews
         SET status = $2, moderation_reason = $3, row_version = row_version + 1,
             updated_at = clock_timestamp()
         WHERE id = $1`,
        [id, status, reason],
      );
      const updated = await db.query(`SELECT ${staffColumns} ${joins} WHERE r.id = $1`, [id]);
      const review = StaffReviewSchema.parse(updated.rows[0]);
      await this.audit(
        db,
        actor,
        data.action === 'HIDE' ? 'review.hidden' : 'review.published',
        review,
        { sellerOrderId: review.sellerOrderId, productId: review.productId, status },
        correlationId,
        reason,
      );
      return review;
    });
  }
}
