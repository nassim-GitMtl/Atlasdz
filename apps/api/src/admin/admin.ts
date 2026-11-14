import type { Pool } from 'pg';

import { deleteMediaFiles } from '../media/media.js';

export const ADMIN_SERVICE = Symbol('atlas.admin');

export interface CategoryRow {
  readonly id: string;
  readonly slug: string;
  readonly title: { fr: string; ar: string };
  readonly status: 'ACTIVE' | 'INACTIVE';
  readonly restrictionClass: 'STANDARD' | 'REVIEW_REQUIRED' | 'PROHIBITED';
  readonly products: number;
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Staff operations: categories, seller status, photo takedown and metrics. */
export class AdminService {
  public constructor(
    private readonly pool: Pool,
    /** Where seller photos are stored; a takedown deletes the files. */
    private readonly mediaDirectory: string | null = null,
  ) {}

  private async audit(
    actorId: string,
    action: string,
    entityType: string,
    entityId: string,
    correlationId: string,
    after: Record<string, unknown>,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO platform.audit_events
         (actor_type, actor_id, scope_snapshot, action, outcome, entity_type, entity_id,
          correlation_id, after_data)
       VALUES ('staff', $1, '{"type":"GLOBAL"}', $2, 'SUCCEEDED', $3, $4, $5, $6)`,
      [actorId, action, entityType, entityId, correlationId, JSON.stringify(after)],
    );
  }

  public async listCategories(): Promise<readonly CategoryRow[]> {
    const result = await this.pool.query<{
      id: string;
      slug: string;
      title_fr: string;
      title_ar: string;
      status: 'ACTIVE' | 'INACTIVE';
      restriction_class: CategoryRow['restrictionClass'];
      products: string;
    }>(
      `SELECT c.id, c.slug, c.title_fr, c.title_ar, c.status, c.restriction_class,
         (SELECT count(*) FROM catalog.products p WHERE p.category_id = c.id) AS products
       FROM catalog.categories c WHERE NOT c.is_synthetic ORDER BY c.slug LIMIT 200`,
    );
    return result.rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: { fr: row.title_fr, ar: row.title_ar },
      status: row.status,
      restrictionClass: row.restriction_class,
      products: Number(row.products),
    }));
  }

  public async createCategory(
    input: { slug: string; titleFr: string; titleAr: string },
    actorId: string,
    correlationId: string,
  ): Promise<'CREATED' | 'CONFLICT' | 'INVALID'> {
    if (!SLUG.test(input.slug) || input.slug.length > 100) return 'INVALID';
    const created = await this.pool.query<{ id: string }>(
      `INSERT INTO catalog.categories (slug, title_fr, title_ar, status, moderation_status, restriction_class)
       VALUES ($1, $2, $3, 'ACTIVE', 'APPROVED', 'STANDARD')
       ON CONFLICT (slug) DO NOTHING RETURNING id`,
      [input.slug, input.titleFr, input.titleAr],
    );
    const id = created.rows[0]?.id;
    if (id === undefined) return 'CONFLICT';
    await this.audit(actorId, 'catalog.category_created', 'category', id, correlationId, input);
    return 'CREATED';
  }

  public async updateCategory(
    id: string,
    input: {
      titleFr: string;
      titleAr: string;
      status: 'ACTIVE' | 'INACTIVE';
      restrictionClass: CategoryRow['restrictionClass'];
    },
    actorId: string,
    correlationId: string,
  ): Promise<boolean> {
    const updated = await this.pool.query(
      `UPDATE catalog.categories SET title_fr = $2, title_ar = $3, status = $4, restriction_class = $5
       WHERE id = $1 AND NOT is_synthetic`,
      [id, input.titleFr, input.titleAr, input.status, input.restrictionClass],
    );
    if (updated.rowCount !== 1) return false;
    await this.audit(actorId, 'catalog.category_updated', 'category', id, correlationId, input);
    return true;
  }

  public async listSellers(status: string | undefined) {
    const result = await this.pool.query<{
      id: string;
      slug: string;
      name: string;
      status: string;
      suspended_reason: string | null;
      created_at: Date;
      offers: string;
      orders: string;
    }>(
      `SELECT s.id, s.slug, s.name, s.status, s.suspended_reason, s.created_at,
         (SELECT count(*) FROM offers.offers o WHERE o.seller_id = s.id AND o.status = 'APPROVED') AS offers,
         (SELECT count(*) FROM commerce.seller_orders so WHERE so.seller_id = s.id) AS orders
       FROM sellers.sellers s
       WHERE NOT s.is_synthetic AND ($1::text IS NULL OR s.status = $1)
       ORDER BY s.created_at DESC LIMIT 200`,
      [status ?? null],
    );
    return result.rows.map((row) => ({
      sellerId: row.id,
      slug: row.slug,
      name: row.name,
      status: row.status,
      suspendedReason: row.suspended_reason,
      createdAt: row.created_at.toISOString(),
      approvedOffers: Number(row.offers),
      orders: Number(row.orders),
    }));
  }

  /** SUSPENDED hides the seller's offers from the catalog and blocks new offers/processing. */
  public async setSellerStatus(
    sellerId: string,
    status: 'SUSPENDED' | 'APPROVED',
    reason: string | null,
    actorId: string,
    correlationId: string,
  ): Promise<boolean> {
    const from = status === 'SUSPENDED' ? 'APPROVED' : 'SUSPENDED';
    const updated = await this.pool.query(
      `UPDATE sellers.sellers SET status = $2, suspended_reason = $3, row_version = row_version + 1
       WHERE id = $1 AND status = $4 AND NOT is_synthetic`,
      [sellerId, status, status === 'SUSPENDED' ? reason : null, from],
    );
    if (updated.rowCount !== 1) return false;
    await this.audit(actorId, 'seller.status_changed', 'seller', sellerId, correlationId, {
      status,
      reason,
    });
    return true;
  }

  public async removeProductPhoto(
    productId: string,
    actorId: string,
    correlationId: string,
  ): Promise<boolean> {
    const updated = await this.pool.query<{ previous: string }>(
      `WITH old AS (
         SELECT id, image_url FROM catalog.products
         WHERE id = $1 AND image_url LIKE '/media/%' FOR UPDATE)
       UPDATE catalog.products p SET image_url = '/assets/product-placeholder.svg'
       FROM old WHERE p.id = old.id
       RETURNING old.image_url AS previous`,
      [productId],
    );
    const previous = updated.rows[0]?.previous;
    if (previous === undefined) return false;
    await this.audit(actorId, 'product.photo_removed', 'product', productId, correlationId, {
      removedImageUrl: previous,
    });
    // A takedown must make the photo unavailable, not just unlinked.
    if (this.mediaDirectory !== null) await deleteMediaFiles(this.mediaDirectory, previous);
    return true;
  }

  public async dashboard() {
    const result = await this.pool.query<Record<string, string | null>>(
      `SELECT
        (SELECT count(*) FROM sellers.sellers WHERE status = 'PENDING_REVIEW' AND NOT is_synthetic) AS pending_sellers,
        (SELECT count(*) FROM catalog.product_submissions WHERE status = 'PENDING_REVIEW') AS pending_products,
        (SELECT count(*) FROM offers.offers WHERE status = 'PENDING_REVIEW') AS pending_offers,
        (SELECT count(*) FROM sellers.sellers WHERE status = 'APPROVED' AND NOT is_synthetic) AS active_sellers,
        (SELECT count(*) FROM identity.user_role_assignments a JOIN identity.roles r ON r.id = a.role_id
          WHERE r.code = 'CUSTOMER' AND a.revoked_at IS NULL) AS customers,
        (SELECT count(*) FROM commerce.orders WHERE payment_state = 'CASH_ON_DELIVERY'
          AND created_at > clock_timestamp() - interval '24 hours') AS orders_24h,
        (SELECT count(*) FROM commerce.orders WHERE payment_state = 'CASH_ON_DELIVERY'
          AND created_at > clock_timestamp() - interval '7 days') AS orders_7d,
        (SELECT count(*) FROM commerce.seller_orders so JOIN commerce.orders o ON o.id = so.order_id
          WHERE o.payment_state = 'CASH_ON_DELIVERY'
            AND so.status IN ('AWAITING_SELLER','ACCEPTED','PREPARING','SHIPPED','DELIVERY_REPORTED')) AS open_orders,
        (SELECT COALESCE(sum((so.snapshot->>'totalMinor')::bigint), 0)
          FROM commerce.seller_orders so JOIN commerce.orders o ON o.id = so.order_id
          WHERE o.payment_state = 'CASH_ON_DELIVERY' AND so.status = 'DELIVERED'
            AND so.closed_at > clock_timestamp() - interval '30 days') AS delivered_value_30d_minor,
        (SELECT count(*) FROM commerce.seller_orders so JOIN commerce.orders o ON o.id = so.order_id
          WHERE o.payment_state = 'CASH_ON_DELIVERY' AND so.status = 'DELIVERY_FAILED'
            AND so.closed_at > clock_timestamp() - interval '30 days') AS failed_deliveries_30d,
        (SELECT count(*) FROM commerce.seller_orders so JOIN commerce.orders o ON o.id = so.order_id
          WHERE o.payment_state = 'CASH_ON_DELIVERY' AND so.status = 'EXPIRED'
            AND so.closed_at > clock_timestamp() - interval '30 days') AS expired_orders_30d`,
    );
    const row = result.rows[0] ?? {};
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase()),
        Number(value ?? 0),
      ]),
    );
  }
}
