import { createHash, randomUUID } from 'node:crypto';

import {
  CatalogProductListSchema,
  CatalogCategorySchema,
  CatalogEntrySchema,
  SubmitProductInputSchema,
  ReviewProductInputSchema,
  ProductSubmissionSchema,
  ProductSubmissionChangedV1PayloadSchema,
  type SubmitProductInput,
  type ReviewProductInput,
  type ProductSubmission,
  CatalogProductSchema,
  CatalogSellerSchema,
  CatalogSlugSchema,
  CorrelationIdSchema,
  CreateOfferInputSchema,
  EventEnvelopeSchema,
  ListProductsInputSchema,
  SellerOfferSchema,
  UpdateOfferInputSchema,
  UuidSchema,
  type CatalogProduct,
  type CatalogProductList,
  type CatalogSeller,
  type CreateOfferInput,
  type ListProductsInput,
  type SellerOffer,
  type UpdateOfferInput,
} from '@atlas/contracts';
import type { Pool, PoolClient } from 'pg';

export type CatalogWriteErrorCode =
  | 'SELLER_NOT_APPROVED'
  | 'PRODUCT_NOT_AVAILABLE'
  | 'OFFER_NOT_FOUND'
  | 'OFFER_NOT_PENDING'
  | 'OFFER_STATE_CONFLICT'
  | 'PRODUCT_STATE_CONFLICT'
  | 'OFFER_ALREADY_EXISTS';

export class CatalogWriteError extends Error {
  public constructor(public readonly code: CatalogWriteErrorCode) {
    super(code);
    this.name = 'CatalogWriteError';
  }
}

export interface CatalogWriteContext {
  readonly actorUserId: string;
  readonly correlationId: string;
}

const PRODUCT_JSON = `jsonb_build_object(
  'id', p.id, 'slug', p.slug,
  'title', jsonb_build_object('fr', p.title_fr, 'ar', p.title_ar),
  'description', jsonb_build_object('fr', p.description_fr, 'ar', p.description_ar),
  'category', jsonb_build_object('slug', c.slug, 'title', jsonb_build_object('fr', c.title_fr, 'ar', c.title_ar)),
  'imageUrl', p.image_url, 'offers', public_offers.items
) AS product`;

// The seller filter restricts the included offers as well as the product result.
const PUBLIC_PRODUCTS = `
  FROM catalog.products p
  JOIN catalog.categories c ON c.id = p.category_id
  JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'id', o.id, 'seller', jsonb_build_object('id', o.seller_id, 'slug', o.seller_slug, 'name', o.seller_name),
      'priceMinor', o.price_minor, 'currency', o.currency,
      'availableQuantity', o.available_quantity, 'handlingDays', o.handling_days,
      'deliveryFeeMinor', o.delivery_fee_minor,
      'preorder', CASE WHEN o.preorder THEN jsonb_build_object('minDays', o.preorder_min_days, 'maxDays', o.preorder_max_days, 'origin', o.preorder_origin) ELSE NULL END
    ) ORDER BY o.price_minor, o.id) AS items
    FROM (
      SELECT offer.*, s.slug AS seller_slug, s.name AS seller_name
      FROM offers.offers offer
      JOIN sellers.sellers s ON s.id = offer.seller_id
      WHERE offer.product_id = p.id AND offer.status = 'APPROVED' AND s.status = 'APPROVED'
        AND ($3::text IS NULL OR s.slug = $3)
      ORDER BY offer.price_minor, offer.id LIMIT 50
    ) o
  ) public_offers ON public_offers.items IS NOT NULL
  WHERE p.status = 'ACTIVE' AND p.moderation_status = 'APPROVED'
    AND c.status = 'ACTIVE' AND c.moderation_status = 'APPROVED' AND c.restriction_class = 'STANDARD'
    AND ($1::text IS NULL OR p.title_fr ILIKE $1 OR p.title_ar ILIKE $1 OR p.slug ILIKE $1
      OR p.description_fr ILIKE $1 OR p.description_ar ILIKE $1
      OR c.title_fr ILIKE $1 OR c.title_ar ILIKE $1)
    AND ($2::text IS NULL OR c.slug = $2)
`;

const OFFER_COLUMNS = `id, seller_id AS "sellerId", product_id AS "productId",
  price_minor AS "priceMinor", currency, available_quantity AS "availableQuantity",
  handling_days AS "handlingDays", delivery_fee_minor AS "deliveryFeeMinor", status,
  row_version AS "rowVersion",
  CASE WHEN preorder THEN jsonb_build_object('minDays', preorder_min_days, 'maxDays', preorder_max_days, 'origin', preorder_origin) ELSE NULL END AS preorder`;

/** Column values for an offer's pre-order terms (all null when the item is in stock). */
const preorderColumns = (
  preorder: { minDays: number; maxDays: number; origin: string | null } | null | undefined,
) =>
  preorder
    ? [true, preorder.minDays, preorder.maxDays, preorder.origin]
    : [false, null, null, null];

const SUBMISSION_SELECT = `SELECT jsonb_build_object(
  'id', s.id, 'sellerId', s.seller_id,
  'category', jsonb_build_object('id', c.id, 'slug', c.slug, 'title', jsonb_build_object('fr', c.title_fr, 'ar', c.title_ar)),
  'title', jsonb_build_object('fr', s.title_fr, 'ar', s.title_ar),
  'description', jsonb_build_object('fr', s.description_fr, 'ar', s.description_ar),
  'status', s.status, 'rowVersion', s.row_version, 'productId', s.product_id,
  'reviewReason', s.review_reason, 'revisionOfSubmissionId', s.revision_of_submission_id,
  'canRevise', s.status='APPROVED' AND NOT EXISTS (
    SELECT 1 FROM catalog.product_submissions next WHERE next.revision_of_submission_id=s.id
    AND next.status IN ('PENDING_REVIEW','APPROVED')),
  'previous', CASE WHEN previous.id IS NULL THEN NULL ELSE jsonb_build_object(
    'title', jsonb_build_object('fr',previous.title_fr,'ar',previous.title_ar),
    'description', jsonb_build_object('fr',previous.description_fr,'ar',previous.description_ar)) END
) AS submission FROM catalog.product_submissions s JOIN catalog.categories c ON c.id=s.category_id
LEFT JOIN catalog.product_submissions previous ON previous.id=s.revision_of_submission_id`;

async function lockRevisionSource(
  client: PoolClient,
  sellerId: string,
  sourceId: string,
  categoryId: string,
) {
  const result = await client.query<{ id: string }>(
    `SELECT p.id FROM catalog.product_submissions source
    JOIN catalog.products p ON p.id=source.product_id
    WHERE source.id=$1 AND source.seller_id=$2 AND source.status='APPROVED'
      AND source.category_id=$3 AND p.category_id=$3
      AND p.status='ACTIVE' AND p.moderation_status='APPROVED'
      AND NOT EXISTS (SELECT 1 FROM catalog.product_submissions next
        WHERE next.revision_of_submission_id=source.id AND next.status='APPROVED')
    FOR UPDATE OF p`,
    [sourceId, sellerId, categoryId],
  );
  if (!result.rows[0]) throw new CatalogWriteError('PRODUCT_STATE_CONFLICT');
  return result.rows[0].id;
}

async function submissionById(client: PoolClient, id: string): Promise<ProductSubmission> {
  const result = await client.query<{ submission: unknown }>(`${SUBMISSION_SELECT} WHERE s.id=$1`, [
    id,
  ]);
  return ProductSubmissionSchema.parse(result.rows[0]?.submission);
}

async function recordSubmission(
  client: PoolClient,
  submission: ProductSubmission,
  context: CatalogWriteContext,
  staff: boolean,
): Promise<void> {
  const actorType = staff ? 'staff' : 'seller_user';
  const time = await client.query<{ occurredAt: Date }>('SELECT clock_timestamp() AS "occurredAt"');
  const payload = ProductSubmissionChangedV1PayloadSchema.parse({
    id: submission.id,
    sellerId: submission.sellerId,
    status: submission.status,
    productId: submission.productId,
  });
  const event = EventEnvelopeSchema.parse({
    eventId: randomUUID(),
    eventType: 'product_submission.changed',
    eventVersion: 1,
    occurredAt: time.rows[0]?.occurredAt.toISOString(),
    producer: 'atlas-api',
    aggregateType: 'product_submission',
    aggregateId: submission.id,
    aggregateVersion: submission.rowVersion,
    correlationId: context.correlationId,
    causationId: null,
    actor: { type: actorType, id: context.actorUserId },
    data: payload,
  });
  await client.query(
    `INSERT INTO platform.audit_events
    (occurred_at,actor_type,actor_id,scope_snapshot,action,outcome,entity_type,entity_id,entity_version,correlation_id,after_data)
    VALUES ($1,$2,$3,$4,'product_submission.changed','SUCCEEDED','product_submission',$5,$6,$7,$8)`,
    [
      event.occurredAt,
      actorType,
      context.actorUserId,
      JSON.stringify(staff ? { type: 'GLOBAL' } : { type: 'SELLER', id: submission.sellerId }),
      submission.id,
      submission.rowVersion,
      context.correlationId,
      JSON.stringify(payload),
    ],
  );
  await client.query(
    `INSERT INTO platform.outbox_events
    (event_id,event_type,event_version,producer,aggregate_type,aggregate_id,aggregate_version,payload,actor_type,actor_id,correlation_id,occurred_at)
    VALUES ($1,'product_submission.changed',1,'atlas-api','product_submission',$2,$3,$4,$5,$6,$7,$8)`,
    [
      event.eventId,
      submission.id,
      submission.rowVersion,
      JSON.stringify(payload),
      actorType,
      context.actorUserId,
      context.correlationId,
      event.occurredAt,
    ],
  );
}

export function escapeCatalogSearch(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

async function transaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
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

async function lockSeller(client: PoolClient, sellerId: string): Promise<void> {
  const result = await client.query<{ status: string }>(
    'SELECT status FROM sellers.sellers WHERE id = $1 FOR UPDATE',
    [sellerId],
  );
  if (result.rows[0]?.status !== 'APPROVED') {
    throw new CatalogWriteError('SELLER_NOT_APPROVED');
  }
}

async function lockProduct(client: PoolClient, productId: string): Promise<string> {
  const result = await client.query<{ variantId: string }>(
    `
    SELECT v.id AS "variantId" FROM catalog.products p
    JOIN catalog.categories c ON c.id = p.category_id
    JOIN catalog.product_variants v ON v.product_id = p.id AND v.is_default
    WHERE p.id = $1 AND p.status = 'ACTIVE' AND p.moderation_status = 'APPROVED'
      AND c.status = 'ACTIVE' AND c.moderation_status = 'APPROVED' AND c.restriction_class = 'STANDARD'
    FOR SHARE OF c, p, v
  `,
    [productId],
  );
  if (result.rows[0] === undefined) throw new CatalogWriteError('PRODUCT_NOT_AVAILABLE');
  return UuidSchema.parse(result.rows[0].variantId);
}

async function recordMutation(
  client: PoolClient,
  offer: SellerOffer,
  variantId: string,
  context: CatalogWriteContext,
  action: 'offer.created' | 'offer.activated' | 'offer.updated',
): Promise<void> {
  const actorType = action === 'offer.activated' ? 'staff' : 'seller_user';
  const time = await client.query<{ occurredAt: Date }>('SELECT clock_timestamp() AS "occurredAt"');
  const occurredAt = time.rows[0]?.occurredAt.toISOString();
  const envelope = EventEnvelopeSchema.parse({
    eventId: randomUUID(),
    eventType: action,
    eventVersion: 1,
    occurredAt,
    producer: 'atlas-api',
    aggregateType: 'offer',
    aggregateId: offer.id,
    aggregateVersion: offer.rowVersion,
    correlationId: context.correlationId,
    causationId: null,
    actor: { type: actorType, id: context.actorUserId },
    data:
      action === 'offer.updated'
        ? {
            offerId: offer.id,
            sellerId: offer.sellerId,
            priceMinor: offer.priceMinor,
            availableQuantity: offer.availableQuantity,
            handlingDays: offer.handlingDays,
          }
        : action === 'offer.created'
          ? {
              offerId: offer.id,
              sellerId: offer.sellerId,
              productId: offer.productId,
              variantId,
              fulfillmentMethod: 'SELLER_FULFILLED',
            }
          : {
              offerId: offer.id,
              sellerId: offer.sellerId,
              variantId,
              price: { amountMinor: offer.priceMinor, currency: offer.currency },
              fulfillmentMethod: 'SELLER_FULFILLED',
              activatedAt: occurredAt,
            },
  });
  await client.query(
    `
    INSERT INTO platform.audit_events (
      occurred_at, actor_type, actor_id, scope_snapshot, action, outcome,
      entity_type, entity_id, entity_version, correlation_id, after_data
    ) VALUES ($1, $2, $3, $4, $5, 'SUCCEEDED', 'offer', $6, $7, $8, $9)
  `,
    [
      envelope.occurredAt,
      actorType,
      context.actorUserId,
      JSON.stringify(
        actorType === 'seller_user' ? { type: 'SELLER', id: offer.sellerId } : { type: 'GLOBAL' },
      ),
      action,
      offer.id,
      offer.rowVersion,
      context.correlationId,
      JSON.stringify(offer),
    ],
  );
  await client.query(
    `
    INSERT INTO platform.outbox_events (
      event_id, event_type, event_version, producer, aggregate_type, aggregate_id,
      aggregate_version, payload, actor_type, actor_id, correlation_id, occurred_at
    ) VALUES ($1, $2, 1, 'atlas-api', 'offer', $3, $4, $5, $6, $7, $8, $9)
  `,
    [
      envelope.eventId,
      action,
      offer.id,
      offer.rowVersion,
      JSON.stringify(envelope.data),
      actorType,
      context.actorUserId,
      context.correlationId,
      envelope.occurredAt,
    ],
  );
}

/** Public read visibility is always derived from current seller, category, product and offer state. */
export class PostgresCatalogRepository {
  public constructor(private readonly pool: Pool) {}

  public async listProductCategories() {
    const result = await this.pool
      .query(`SELECT id, slug, jsonb_build_object('fr',title_fr,'ar',title_ar) AS title
      FROM catalog.categories WHERE status='ACTIVE' AND moderation_status='APPROVED' AND restriction_class='STANDARD' ORDER BY slug LIMIT 100`);
    return CatalogCategorySchema.array().parse(result.rows);
  }

  public async listOfferProducts() {
    const result = await this.pool.query<{ product: unknown }>(`SELECT jsonb_build_object(
      'id',p.id,'slug',p.slug,'title',jsonb_build_object('fr',p.title_fr,'ar',p.title_ar),
      'description',jsonb_build_object('fr',p.description_fr,'ar',p.description_ar),
      'category',jsonb_build_object('slug',c.slug,'title',jsonb_build_object('fr',c.title_fr,'ar',c.title_ar)),
      'imageUrl',p.image_url) AS product
      FROM catalog.products p JOIN catalog.categories c ON c.id=p.category_id
      WHERE p.status='ACTIVE' AND p.moderation_status='APPROVED' AND c.status='ACTIVE'
      AND c.moderation_status='APPROVED' AND c.restriction_class='STANDARD'
      ORDER BY p.created_at DESC,p.id LIMIT 100`);
    return result.rows.map((row) => CatalogEntrySchema.parse(row.product));
  }

  public async listProductSubmissions(sellerId: string) {
    const result = await this.pool.query<{ submission: unknown }>(
      `${SUBMISSION_SELECT}
      WHERE s.seller_id=$1 ORDER BY s.created_at DESC,s.id LIMIT 100`,
      [UuidSchema.parse(sellerId)],
    );
    return result.rows.map((row) => ProductSubmissionSchema.parse(row.submission));
  }

  public async listPendingProducts() {
    const result = await this.pool.query<{ submission: unknown }>(`${SUBMISSION_SELECT}
      WHERE s.status='PENDING_REVIEW' ORDER BY s.created_at,s.id LIMIT 100`);
    return result.rows.map((row) => ProductSubmissionSchema.parse(row.submission));
  }

  public async getProductSubmission(sellerId: string, id: string) {
    const result = await this.pool.query<{ submission: unknown }>(
      `${SUBMISSION_SELECT} WHERE s.seller_id=$1 AND s.id=$2`,
      [UuidSchema.parse(sellerId), UuidSchema.parse(id)],
    );
    return result.rows[0] ? ProductSubmissionSchema.parse(result.rows[0].submission) : null;
  }

  public async submitProduct(
    sellerId: string,
    input: SubmitProductInput,
    context: CatalogWriteContext,
  ): Promise<ProductSubmission> {
    UuidSchema.parse(sellerId);
    UuidSchema.parse(context.actorUserId);
    CorrelationIdSchema.parse(context.correlationId);
    const data = SubmitProductInputSchema.parse(input);
    const hash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
    return transaction(this.pool, async (client) => {
      await lockSeller(client, sellerId);
      const prior = await client.query<{ id: string; hash: string }>(
        'SELECT id,request_hash AS hash FROM catalog.product_submissions WHERE seller_id=$1 AND request_id=$2',
        [sellerId, data.requestId],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].hash !== hash) throw new CatalogWriteError('PRODUCT_STATE_CONFLICT');
        return submissionById(client, prior.rows[0].id);
      }
      const count = await client.query<{ count: string }>(
        "SELECT count(*) FROM catalog.product_submissions WHERE seller_id=$1 AND status='PENDING_REVIEW'",
        [sellerId],
      );
      if (Number(count.rows[0]?.count) >= 100)
        throw new CatalogWriteError('PRODUCT_STATE_CONFLICT');
      const category = await client.query(
        `SELECT id FROM catalog.categories WHERE id=$1
        AND status='ACTIVE' AND moderation_status='APPROVED' AND restriction_class='STANDARD' FOR SHARE`,
        [data.categoryId],
      );
      if (!category.rows[0]) throw new CatalogWriteError('PRODUCT_NOT_AVAILABLE');
      if (data.revisionOfSubmissionId) {
        await lockRevisionSource(client, sellerId, data.revisionOfSubmissionId, data.categoryId);
        const pending = await client.query(
          `SELECT id FROM catalog.product_submissions WHERE revision_of_submission_id=$1 AND status='PENDING_REVIEW'`,
          [data.revisionOfSubmissionId],
        );
        if (pending.rows[0]) throw new CatalogWriteError('PRODUCT_STATE_CONFLICT');
      }
      const result = await client.query<{ id: string }>(
        `INSERT INTO catalog.product_submissions
        (seller_id,request_id,request_hash,category_id,title_fr,title_ar,description_fr,description_ar,revision_of_submission_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [
          sellerId,
          data.requestId,
          hash,
          data.categoryId,
          data.title.fr,
          data.title.ar,
          data.description.fr,
          data.description.ar,
          data.revisionOfSubmissionId ?? null,
        ],
      );
      const submission = await submissionById(client, UuidSchema.parse(result.rows[0]?.id));
      await recordSubmission(client, submission, context, false);
      return submission;
    });
  }

  public async reviewProduct(
    id: string,
    input: ReviewProductInput,
    context: CatalogWriteContext,
  ): Promise<ProductSubmission> {
    UuidSchema.parse(id);
    UuidSchema.parse(context.actorUserId);
    CorrelationIdSchema.parse(context.correlationId);
    const data = ReviewProductInputSchema.parse(input);
    return transaction(this.pool, async (client) => {
      const location = await client.query<{ sellerId: string; categoryId: string }>(
        'SELECT seller_id AS "sellerId",category_id AS "categoryId" FROM catalog.product_submissions WHERE id=$1',
        [id],
      );
      const located = location.rows[0];
      if (!located) throw new CatalogWriteError('PRODUCT_NOT_AVAILABLE');
      // Seller -> category -> submission order also serializes submission and offer creation.
      if (data.decision === 'APPROVED') await lockSeller(client, located.sellerId);
      else
        await client.query('SELECT id FROM sellers.sellers WHERE id=$1 FOR UPDATE', [
          located.sellerId,
        ]);
      const category = await client.query<{
        status: string;
        moderation_status: string;
        restriction_class: string;
      }>(
        'SELECT status,moderation_status,restriction_class FROM catalog.categories WHERE id=$1 FOR SHARE',
        [located.categoryId],
      );
      if (
        data.decision === 'APPROVED' &&
        (category.rows[0]?.status !== 'ACTIVE' ||
          category.rows[0].moderation_status !== 'APPROVED' ||
          category.rows[0].restriction_class !== 'STANDARD')
      )
        throw new CatalogWriteError('PRODUCT_NOT_AVAILABLE');
      await client.query('SELECT id FROM catalog.product_submissions WHERE id=$1 FOR UPDATE', [id]);
      const prior = await submissionById(client, id);
      const reason = data.decision === 'REJECTED' ? data.reason : null;
      if (
        prior.status === data.decision &&
        prior.rowVersion === data.expectedVersion + 1 &&
        prior.reviewReason === reason
      )
        return prior;
      if (prior.status !== 'PENDING_REVIEW' || prior.rowVersion !== data.expectedVersion)
        throw new CatalogWriteError('PRODUCT_STATE_CONFLICT');
      let productId: string | null = null;
      if (data.decision === 'APPROVED' && prior.revisionOfSubmissionId) {
        productId = await lockRevisionSource(
          client,
          located.sellerId,
          prior.revisionOfSubmissionId,
          located.categoryId,
        );
        await client.query(
          `UPDATE catalog.products SET title_fr=$2,title_ar=$3,description_fr=$4,description_ar=$5 WHERE id=$1`,
          [productId, prior.title.fr, prior.title.ar, prior.description.fr, prior.description.ar],
        );
      } else if (data.decision === 'APPROVED') {
        productId = randomUUID();
        await client.query(
          `INSERT INTO catalog.products (id,category_id,slug,title_fr,title_ar,description_fr,description_ar,image_url,status,moderation_status)
          VALUES ($1,$2,$3,$4,$5,$6,$7,'/assets/product-placeholder.svg','ACTIVE','APPROVED')`,
          [
            productId,
            located.categoryId,
            `p-${productId}`,
            prior.title.fr,
            prior.title.ar,
            prior.description.fr,
            prior.description.ar,
          ],
        );
        await client.query(
          'INSERT INTO catalog.product_variants (product_id,sku,is_default) VALUES ($1,$2,true)',
          [productId, `ATLAS-${productId}`],
        );
      }
      await client.query(
        `UPDATE catalog.product_submissions SET status=$2,product_id=$3,review_reason=$4,
        reviewed_by=$5,reviewed_at=clock_timestamp(),row_version=row_version+1 WHERE id=$1`,
        [id, data.decision, productId, reason, context.actorUserId],
      );
      const submission = await submissionById(client, id);
      await recordSubmission(client, submission, context, true);
      return submission;
    });
  }

  public async listProducts(input: ListProductsInput = {}): Promise<CatalogProductList> {
    const parsed = ListProductsInputSchema.parse(input);
    const result = await this.pool.query<{ product: unknown }>(
      `
      SELECT ${PRODUCT_JSON} ${PUBLIC_PRODUCTS} ORDER BY p.slug, p.id LIMIT $4
    `,
      [
        parsed.query ? `%${escapeCatalogSearch(parsed.query)}%` : null,
        parsed.category ?? null,
        parsed.seller ?? null,
        parsed.limit ?? 24,
      ],
    );
    return CatalogProductListSchema.parse({ items: result.rows.map((row) => row.product) });
  }

  public async getProduct(slug: string): Promise<CatalogProduct | null> {
    const parsed = CatalogSlugSchema.parse(slug);
    const result = await this.pool.query<{ product: unknown }>(
      `
      SELECT ${PRODUCT_JSON} ${PUBLIC_PRODUCTS} AND p.slug = $4
    `,
      [null, null, null, parsed],
    );
    return result.rows[0] === undefined ? null : CatalogProductSchema.parse(result.rows[0].product);
  }

  public async getSeller(slug: string): Promise<CatalogSeller | null> {
    const result = await this.pool.query<{ seller: unknown }>(
      `
      SELECT jsonb_build_object('id', id, 'slug', slug, 'name', name,
        'description', jsonb_build_object('fr', description_fr, 'ar', description_ar)) AS seller
      FROM sellers.sellers WHERE slug = $1 AND status = 'APPROVED'
    `,
      [CatalogSlugSchema.parse(slug)],
    );
    return result.rows[0] === undefined ? null : CatalogSellerSchema.parse(result.rows[0].seller);
  }

  public async listSellerOffers(actorSellerId: string): Promise<readonly SellerOffer[]> {
    const result = await this.pool.query(
      `
      SELECT ${OFFER_COLUMNS} FROM offers.offers WHERE seller_id = $1 ORDER BY created_at DESC, id LIMIT 100
    `,
      [UuidSchema.parse(actorSellerId)],
    );
    return result.rows.map((row: unknown) => SellerOfferSchema.parse(row));
  }

  public async listPendingOffers(): Promise<readonly SellerOffer[]> {
    const result = await this.pool.query(`
      SELECT ${OFFER_COLUMNS} FROM offers.offers
      WHERE status = 'PENDING_REVIEW' ORDER BY created_at, id LIMIT 100
    `);
    return result.rows.map((row: unknown) => SellerOfferSchema.parse(row));
  }

  public async getSellerOffer(sellerId: string, offerId: string): Promise<SellerOffer | null> {
    const result = await this.pool.query(
      `SELECT ${OFFER_COLUMNS} FROM offers.offers WHERE seller_id=$1 AND id=$2`,
      [UuidSchema.parse(sellerId), UuidSchema.parse(offerId)],
    );
    return result.rows[0] ? SellerOfferSchema.parse(result.rows[0]) : null;
  }

  public async updateOffer(
    sellerId: string,
    offerId: string,
    input: UpdateOfferInput,
    context: CatalogWriteContext,
  ): Promise<SellerOffer> {
    UuidSchema.parse(sellerId);
    UuidSchema.parse(offerId);
    UuidSchema.parse(context.actorUserId);
    CorrelationIdSchema.parse(context.correlationId);
    const data = UpdateOfferInputSchema.parse(input);
    return transaction(this.pool, async (client) => {
      // Same seller -> offer lock order as checkout and approval. Ownership precedes lookup.
      await lockSeller(client, sellerId);
      const found = await client.query(
        `SELECT ${OFFER_COLUMNS} FROM offers.offers WHERE id=$1 AND seller_id=$2 FOR UPDATE`,
        [offerId, sellerId],
      );
      if (!found.rows[0]) throw new CatalogWriteError('OFFER_NOT_FOUND');
      const prior = SellerOfferSchema.parse(found.rows[0]);
      if (!['PENDING_REVIEW', 'APPROVED'].includes(prior.status))
        throw new CatalogWriteError('OFFER_STATE_CONFLICT');
      if (prior.rowVersion !== data.expectedVersion)
        throw new CatalogWriteError('OFFER_STATE_CONFLICT');
      if (
        prior.priceMinor === data.priceMinor &&
        prior.availableQuantity === data.availableQuantity &&
        prior.handlingDays === data.handlingDays &&
        JSON.stringify(prior.preorder ?? null) === JSON.stringify(data.preorder ?? null)
      )
        return prior;
      // Leave room for every outstanding reservation to be released without exceeding the cap.
      const reserved = await client.query<{ quantity: string }>(
        `SELECT COALESCE(sum(quantity),0)::text AS quantity FROM commerce.stock_reservations WHERE offer_id=$1 AND released_at IS NULL AND consumed_at IS NULL`,
        [offerId],
      );
      if (data.availableQuantity + Number(reserved.rows[0]?.quantity ?? 0) > 1_000_000)
        throw new CatalogWriteError('OFFER_STATE_CONFLICT');
      const result = await client.query(
        `UPDATE offers.offers SET price_minor=$3,available_quantity=$4,handling_days=$5,
           preorder=$6,preorder_min_days=$7,preorder_max_days=$8,preorder_origin=$9,
           row_version=row_version+1 WHERE id=$1 AND seller_id=$2 RETURNING ${OFFER_COLUMNS}`,
        [
          offerId,
          sellerId,
          data.priceMinor,
          data.availableQuantity,
          data.handlingDays,
          ...preorderColumns(data.preorder),
        ],
      );
      const offer = SellerOfferSchema.parse(result.rows[0]);
      // No publication, product identity, shipping rates or existing order snapshot is changed.
      const variant = await client.query<{ id: string }>(
        'SELECT variant_id AS id FROM offers.offers WHERE id=$1',
        [offerId],
      );
      await recordMutation(
        client,
        offer,
        UuidSchema.parse(variant.rows[0]?.id),
        context,
        'offer.updated',
      );
      return offer;
    });
  }

  public async createOffer(
    actorSellerId: string,
    input: CreateOfferInput,
    context: CatalogWriteContext,
  ): Promise<SellerOffer> {
    const sellerId = UuidSchema.parse(actorSellerId);
    const data = CreateOfferInputSchema.parse(input);
    UuidSchema.parse(context.actorUserId);
    CorrelationIdSchema.parse(context.correlationId);
    return transaction(this.pool, async (client) => {
      await lockSeller(client, sellerId);
      const variantId = await lockProduct(client, data.productId);
      const existing = await client.query(
        'SELECT id FROM offers.offers WHERE seller_id = $1 AND variant_id = $2',
        [sellerId, variantId],
      );
      if (existing.rows.length > 0) throw new CatalogWriteError('OFFER_ALREADY_EXISTS');
      const result = await client.query(
        `
        INSERT INTO offers.offers (seller_id, product_id, variant_id, price_minor,
          available_quantity, handling_days, delivery_fee_minor,
          preorder, preorder_min_days, preorder_max_days, preorder_origin)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING ${OFFER_COLUMNS}
      `,
        [
          sellerId,
          data.productId,
          variantId,
          data.priceMinor,
          data.availableQuantity,
          data.handlingDays,
          data.deliveryFeeMinor,
          ...preorderColumns(data.preorder),
        ],
      );
      const offer = SellerOfferSchema.parse(result.rows[0]);
      await recordMutation(client, offer, variantId, context, 'offer.created');
      return offer;
    });
  }

  public async approveOffer(
    actorUserId: string,
    offerId: string,
    correlationId: string,
  ): Promise<SellerOffer> {
    const context = {
      actorUserId: UuidSchema.parse(actorUserId),
      correlationId: CorrelationIdSchema.parse(correlationId),
    };
    const id = UuidSchema.parse(offerId);
    return transaction(this.pool, async (client) => {
      const located = await client.query<{ sellerId: string; productId: string }>(
        'SELECT seller_id AS "sellerId", product_id AS "productId" FROM offers.offers WHERE id = $1',
        [id],
      );
      const location = located.rows[0];
      if (location === undefined) throw new CatalogWriteError('OFFER_NOT_FOUND');
      await lockSeller(client, location.sellerId);
      const variantId = await lockProduct(client, location.productId);
      const locked = await client.query(
        `
        SELECT ${OFFER_COLUMNS} FROM offers.offers
        WHERE id = $1 AND seller_id = $2 AND product_id = $3 AND variant_id = $4 FOR UPDATE
      `,
        [id, location.sellerId, location.productId, variantId],
      );
      if (locked.rows[0] === undefined) throw new CatalogWriteError('OFFER_NOT_FOUND');
      const prior = SellerOfferSchema.parse(locked.rows[0]);
      if (prior.status !== 'PENDING_REVIEW') throw new CatalogWriteError('OFFER_NOT_PENDING');
      const updated = await client.query(
        `
        UPDATE offers.offers SET status = 'APPROVED', row_version = row_version + 1,
          approved_at = clock_timestamp(), approved_by = $2 WHERE id = $1
        RETURNING ${OFFER_COLUMNS}
      `,
        [id, context.actorUserId],
      );
      const offer = SellerOfferSchema.parse(updated.rows[0]);
      await recordMutation(client, offer, variantId, context, 'offer.activated');
      return offer;
    });
  }
}
