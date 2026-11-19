import type { Pool, PoolClient } from 'pg';

import { deleteMediaFiles, removeGalleryPhoto } from '../media/media.js';

export const ADMIN_SERVICE = Symbol('atlas.admin');
export const ACCOUNT_ADMIN = Symbol('atlas.admin.accounts');

export interface CategoryRow {
  readonly id: string;
  readonly slug: string;
  readonly title: { fr: string; ar: string; en?: string };
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
      title_en: string | null;
      status: 'ACTIVE' | 'INACTIVE';
      restriction_class: CategoryRow['restrictionClass'];
      products: string;
    }>(
      `SELECT c.id, c.slug, c.title_fr, c.title_ar, c.title_en, c.status, c.restriction_class,
         (SELECT count(*) FROM catalog.products p WHERE p.category_id = c.id) AS products
       FROM catalog.categories c WHERE NOT c.is_synthetic ORDER BY c.slug LIMIT 200`,
    );
    return result.rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: { fr: row.title_fr, ar: row.title_ar, ...(row.title_en ? { en: row.title_en } : {}) },
      status: row.status,
      restrictionClass: row.restriction_class,
      products: Number(row.products),
    }));
  }

  public async createCategory(
    input: { slug: string; titleFr: string; titleAr: string; titleEn: string | null },
    actorId: string,
    correlationId: string,
  ): Promise<'CREATED' | 'CONFLICT' | 'INVALID'> {
    if (!SLUG.test(input.slug) || input.slug.length > 100) return 'INVALID';
    const created = await this.pool.query<{ id: string }>(
      `INSERT INTO catalog.categories (slug, title_fr, title_ar, title_en, status, moderation_status, restriction_class)
       VALUES ($1, $2, $3, $4, 'ACTIVE', 'APPROVED', 'STANDARD')
       ON CONFLICT (slug) DO NOTHING RETURNING id`,
      [input.slug, input.titleFr, input.titleAr, input.titleEn],
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
      titleEn: string | null;
      status: 'ACTIVE' | 'INACTIVE';
      restrictionClass: CategoryRow['restrictionClass'];
    },
    actorId: string,
    correlationId: string,
  ): Promise<boolean> {
    const updated = await this.pool.query(
      `UPDATE catalog.categories SET title_fr = $2, title_ar = $3, title_en = $6, status = $4, restriction_class = $5
       WHERE id = $1 AND NOT is_synthetic`,
      [id, input.titleFr, input.titleAr, input.status, input.restrictionClass, input.titleEn],
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
      closed_at: Date | null;
      offers: string;
      orders: string;
    }>(
      `SELECT s.id, s.slug, s.name, s.status, s.suspended_reason, s.created_at, s.closed_at,
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
      closedAt: row.closed_at?.toISOString() ?? null,
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
       WHERE id = $1 AND status = $4 AND NOT is_synthetic AND closed_at IS NULL`,
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

  /** Takes down one of a product's extra photos (files deleted for good). */
  public async removeGalleryPhoto(
    productId: string,
    mediaId: string,
    actorId: string,
    correlationId: string,
  ): Promise<boolean> {
    const removed = await removeGalleryPhoto(this.pool, this.mediaDirectory, {
      productId,
      mediaId,
      sellerId: null,
      actor: { type: 'staff', id: actorId },
      correlationId,
    });
    return removed !== null;
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
            AND so.closed_at > clock_timestamp() - interval '30 days') AS expired_orders_30d,
        (SELECT count(*) FROM platform.outbox_events WHERE delivery_state = 'FAILED'
          OR (delivery_state = 'PENDING' AND occurred_at < clock_timestamp() - interval '30 minutes'))
          AS stuck_notifications,
        (SELECT count(*) FROM commerce.checkout_quotes q
          WHERE q.snapshot->>'paymentArrangement' = 'CASH_ON_DELIVERY'
            AND q.created_at > clock_timestamp() - interval '30 days') AS funnel_checkouts_30d,
        (SELECT count(*) FROM commerce.seller_orders so JOIN commerce.orders o ON o.id = so.order_id
          WHERE o.payment_state = 'CASH_ON_DELIVERY'
            AND so.created_at > clock_timestamp() - interval '30 days') AS funnel_seller_orders_30d,
        (SELECT count(*) FROM commerce.seller_order_history h
          JOIN commerce.seller_orders so ON so.id = h.seller_order_id JOIN commerce.orders o ON o.id = so.order_id
          WHERE o.payment_state = 'CASH_ON_DELIVERY' AND h.status = 'ACCEPTED'
            AND h.occurred_at > clock_timestamp() - interval '30 days') AS funnel_accepted_30d,
        (SELECT count(*) FROM commerce.seller_orders so JOIN commerce.orders o ON o.id = so.order_id
          WHERE o.payment_state = 'CASH_ON_DELIVERY' AND so.status = 'DELIVERED'
            AND so.closed_at > clock_timestamp() - interval '30 days') AS funnel_delivered_30d,
        (SELECT COALESCE(round(percentile_cont(0.5) WITHIN GROUP (
            ORDER BY extract(epoch FROM h.occurred_at - so.created_at) / 60)), 0)
          FROM commerce.seller_order_history h
          JOIN commerce.seller_orders so ON so.id = h.seller_order_id JOIN commerce.orders o ON o.id = so.order_id
          WHERE o.payment_state = 'CASH_ON_DELIVERY' AND h.status = 'ACCEPTED'
            AND h.occurred_at > clock_timestamp() - interval '30 days')
          AS median_acceptance_minutes_30d`,
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

/** Seller orders that still need the seller or the customer: an account cannot close then. */
const OPEN_ORDER_STATUSES = `('AWAITING_SELLER','ACCEPTED','PREPARING','SHIPPED','DELIVERY_REPORTED')`;

/** Full staff access to accounts, and removal of anything shown on the marketplace. */
export class AccountAdminService {
  public constructor(private readonly pool: Pool) {}

  private async audit(
    db: Pool | PoolClient,
    actorId: string,
    action: string,
    entityType: string,
    entityId: string,
    correlationId: string,
    after: Record<string, unknown>,
  ): Promise<void> {
    await db.query(
      `INSERT INTO platform.audit_events
         (actor_type, actor_id, scope_snapshot, action, outcome, entity_type, entity_id,
          correlation_id, after_data)
       VALUES ('staff', $1, '{"type":"GLOBAL"}', $2, 'SUCCEEDED', $3, $4, $5, $6)`,
      [actorId, action, entityType, entityId, correlationId, JSON.stringify(after)],
    );
  }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** Everything about one seller account: users, offers, orders, reviews, coverage. */
  public async sellerDetail(sellerId: string) {
    const seller = await this.pool.query<{
      id: string; slug: string; name: string; status: string; suspended_reason: string | null;
      description_fr: string; description_ar: string; created_at: Date; closed_at: Date | null;
    }>(
      `SELECT id, slug, name, status, suspended_reason, description_fr, description_ar, created_at,
         closed_at FROM sellers.sellers WHERE id = $1`,
      [sellerId],
    );
    const row = seller.rows[0];
    if (!row) return null;
    const [users, offers, orders, counts, reviews, coverage] = await Promise.all([
      this.pool.query<{ id: string; email: string; phone: string | null; status: string; created_at: Date }>(
        `SELECT u.id, c.email, c.phone_e164 AS phone, u.status, u.created_at
         FROM identity.user_role_assignments a
         JOIN identity.users u ON u.id = a.user_id
         JOIN identity.password_credentials c ON c.user_id = u.id
         WHERE a.scope_type = 'SELLER' AND a.scope_id = $1
         ORDER BY a.valid_from`,
        [sellerId],
      ),
      this.pool.query<{
        id: string; title_fr: string; title_ar: string; product_id: string; price_minor: number;
        available_quantity: number; status: string; promo_price_minor: number | null; promo_ends_at: Date | null;
      }>(
        `SELECT o.id, p.title_fr, p.title_ar, p.id AS product_id, o.price_minor,
           o.available_quantity, o.status, o.promo_price_minor, o.promo_ends_at
         FROM offers.offers o JOIN catalog.products p ON p.id = o.product_id
         WHERE o.seller_id = $1 ORDER BY o.created_at DESC LIMIT 200`,
        [sellerId],
      ),
      this.pool.query<{ id: string; status: string; total: string; created_at: Date; recipient: string | null }>(
        `SELECT so.id, so.status, (so.snapshot->>'totalMinor') AS total, so.created_at,
           cq.snapshot->'deliveryContact'->>'recipientName' AS recipient
         FROM commerce.seller_orders so
         JOIN commerce.orders co ON co.id = so.order_id
         LEFT JOIN commerce.checkout_quotes cq ON cq.id = co.quote_id
         WHERE so.seller_id = $1
         ORDER BY so.created_at DESC LIMIT 50`,
        [sellerId],
      ),
      this.pool.query<{ status: string; count: string }>(
        `SELECT status, count(*) FROM commerce.seller_orders WHERE seller_id = $1 GROUP BY status`,
        [sellerId],
      ),
      this.pool.query<{ id: string; rating: number; body: string | null; status: string; created_at: Date; title_fr: string }>(
        `SELECT r.id, r.rating, r.body, r.status, r.created_at, p.title_fr
         FROM commerce.product_reviews r JOIN catalog.products p ON p.id = r.product_id
         WHERE r.seller_id = $1 ORDER BY r.created_at DESC LIMIT 50`,
        [sellerId],
      ),
      this.pool.query<{ count: string }>(
        `SELECT (SELECT count(*) FROM sellers.delivery_rates WHERE seller_id = $1 AND enabled)
           + (SELECT count(*) FROM sellers.wilaya_delivery_rates WHERE seller_id = $1 AND enabled) AS count`,
        [sellerId],
      ).catch(() => ({ rows: [{ count: '0' }] })),
    ]);
    return {
      seller: {
        sellerId: row.id,
        slug: row.slug,
        name: row.name,
        status: row.status,
        suspendedReason: row.suspended_reason,
        description: { fr: row.description_fr, ar: row.description_ar },
        createdAt: row.created_at.toISOString(),
        closedAt: row.closed_at?.toISOString() ?? null,
      },
      users: users.rows.map((u) => ({
        userId: u.id,
        email: u.email,
        phone: u.phone,
        status: u.status,
        createdAt: u.created_at.toISOString(),
      })),
      offers: offers.rows.map((o) => ({
        offerId: o.id,
        productId: o.product_id,
        title: { fr: o.title_fr, ar: o.title_ar },
        priceMinor: o.price_minor,
        availableQuantity: o.available_quantity,
        status: o.status,
        promotion:
          o.promo_price_minor === null
            ? null
            : { priceMinor: o.promo_price_minor, endsAt: o.promo_ends_at?.toISOString() ?? null },
      })),
      orders: orders.rows.map((o) => ({
        sellerOrderId: o.id,
        status: o.status,
        totalMinor: Number(o.total ?? 0),
        createdAt: o.created_at.toISOString(),
        recipient: o.recipient,
      })),
      orderCounts: Object.fromEntries(counts.rows.map((c) => [c.status, Number(c.count)])),
      reviews: reviews.rows.map((r) => ({
        reviewId: r.id,
        rating: r.rating,
        body: r.body,
        status: r.status,
        product: r.title_fr,
        createdAt: r.created_at.toISOString(),
      })),
      activeDeliveryRates: Number(coverage.rows[0]?.count ?? 0),
    };
  }

  /** Staff take an offer off sale (SUSPENDED) or put a suspended one back on sale. */
  public async setOfferStatus(
    offerId: string,
    status: 'SUSPENDED' | 'APPROVED',
    actorId: string,
    correlationId: string,
  ): Promise<boolean> {
    return this.transaction(async (db) => {
      const updated = await db.query(
        `UPDATE offers.offers o SET status = $2, row_version = o.row_version + 1
         FROM sellers.sellers s
         WHERE o.id = $1 AND s.id = o.seller_id AND s.closed_at IS NULL
           AND o.status = ANY($3::text[])`,
        [offerId, status, status === 'SUSPENDED' ? ['APPROVED', 'PENDING_REVIEW'] : ['SUSPENDED']],
      );
      if (updated.rowCount !== 1) return false;
      if (status === 'SUSPENDED')
        await db.query('DELETE FROM commerce.cart_items WHERE offer_id = $1', [offerId]);
      await this.audit(db, actorId, 'offer.status_changed', 'offer', offerId, correlationId, { status });
      return true;
    });
  }

  /**
   * Deletes an offer. One that was ever ordered or reserved is kept for the order records but
   * taken off sale for good (ARCHIVED).
   */
  public async removeOffer(
    offerId: string,
    actorId: string,
    correlationId: string,
  ): Promise<'DELETED' | 'ARCHIVED' | null> {
    return this.transaction(async (db) => {
      const found = await db.query('SELECT id FROM offers.offers WHERE id = $1 FOR UPDATE', [offerId]);
      if (found.rowCount !== 1) return null;
      await db.query('DELETE FROM commerce.cart_items WHERE offer_id = $1', [offerId]);
      await db.query('SAVEPOINT remove_offer');
      let outcome: 'DELETED' | 'ARCHIVED' = 'DELETED';
      try {
        await db.query('DELETE FROM offers.offers WHERE id = $1', [offerId]);
      } catch (error) {
        if ((error as { code?: string }).code !== '23503') throw error;
        await db.query('ROLLBACK TO SAVEPOINT remove_offer');
        await db.query(
          `UPDATE offers.offers SET status = 'SUSPENDED', row_version = row_version + 1 WHERE id = $1`,
          [offerId],
        );
        outcome = 'ARCHIVED';
      }
      await this.audit(db, actorId, 'offer.removed', 'offer', offerId, correlationId, { outcome });
      return outcome;
    });
  }

  /** Takes a product off the marketplace with all its offers (orders keep their copy). */
  public async removeProduct(productId: string, actorId: string, correlationId: string): Promise<boolean> {
    return this.transaction(async (db) => {
      const updated = await db.query(
        `UPDATE catalog.products SET status = 'INACTIVE' WHERE id = $1 AND status = 'ACTIVE'`,
        [productId],
      );
      if (updated.rowCount !== 1) return false;
      await db.query(
        `DELETE FROM commerce.cart_items WHERE offer_id IN (SELECT id FROM offers.offers WHERE product_id = $1)`,
        [productId],
      );
      await db.query(
        `UPDATE offers.offers SET status = 'SUSPENDED', row_version = row_version + 1
         WHERE product_id = $1 AND status IN ('APPROVED', 'PENDING_REVIEW')`,
        [productId],
      );
      await this.audit(db, actorId, 'product.removed', 'product', productId, correlationId, {});
      return true;
    });
  }

  /** Deletes a customer review and the seller's reply. */
  public async deleteReview(reviewId: string, actorId: string, correlationId: string): Promise<boolean> {
    return this.transaction(async (db) => {
      const deleted = await db.query('DELETE FROM commerce.product_reviews WHERE id = $1', [reviewId]);
      if (deleted.rowCount !== 1) return false;
      await this.audit(db, actorId, 'review.deleted', 'review', reviewId, correlationId, {});
      return true;
    });
  }

  /** Pseudonymizes and disables a login (email, phone, authenticator, sessions, cart). */
  private async erase(db: PoolClient, userId: string): Promise<void> {
    await db.query(
      `UPDATE identity.password_credentials
       SET email = 'deleted-' || user_id::text || '@deleted.invalid',
           phone_e164 = NULL, phone_verified_at = NULL, email_verified_at = NULL,
           updated_at = clock_timestamp()
       WHERE user_id = $1`,
      [userId],
    );
    await db.query('DELETE FROM identity.totp_factors WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM identity.phone_verification_codes WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM commerce.cart_items WHERE customer_id = $1', [userId]);
    await db.query('DELETE FROM commerce.stock_alerts WHERE customer_id = $1', [userId]);
    await db.query(
      `UPDATE identity.users
       SET status = 'DISABLED', disabled_at = clock_timestamp(), pseudonymized_at = clock_timestamp(),
           session_epoch = session_epoch + 1, row_version = row_version + 1, updated_at = clock_timestamp()
       WHERE id = $1`,
      [userId],
    );
  }

  /**
   * Deletes a seller account: its logins are erased and disabled, every offer leaves the
   * marketplace for good. Refused while orders are still open (they must finish first).
   */
  public async closeSeller(
    sellerId: string,
    actorId: string,
    correlationId: string,
  ): Promise<'CLOSED' | 'OPEN_ORDERS' | null> {
    return this.transaction(async (db) => {
      const found = await db.query(
        'SELECT id FROM sellers.sellers WHERE id = $1 AND closed_at IS NULL FOR UPDATE',
        [sellerId],
      );
      if (found.rowCount !== 1) return null;
      const open = await db.query<{ count: string }>(
        `SELECT count(*) FROM commerce.seller_orders WHERE seller_id = $1 AND status IN ${OPEN_ORDER_STATUSES}`,
        [sellerId],
      );
      if (Number(open.rows[0]?.count ?? 0) > 0) return 'OPEN_ORDERS';
      await db.query(
        `DELETE FROM commerce.cart_items WHERE offer_id IN (SELECT id FROM offers.offers WHERE seller_id = $1)`,
        [sellerId],
      );
      await db.query(
        `UPDATE offers.offers SET status = 'SUSPENDED', row_version = row_version + 1
         WHERE seller_id = $1 AND status <> 'SUSPENDED'`,
        [sellerId],
      );
      const users = await db.query<{ user_id: string }>(
        `UPDATE identity.user_role_assignments SET revoked_at = clock_timestamp(), revoked_by = $2,
           revoke_reason = 'Compte vendeur supprimé par Atlas DZ'
         WHERE scope_type = 'SELLER' AND scope_id = $1 AND revoked_at IS NULL RETURNING user_id`,
        [sellerId, actorId],
      );
      for (const { user_id } of users.rows) await this.erase(db, user_id);
      await db.query(
        `UPDATE sellers.sellers SET status = 'SUSPENDED', suspended_reason = 'Compte supprimé',
           closed_at = clock_timestamp(), row_version = row_version + 1 WHERE id = $1`,
        [sellerId],
      );
      await this.audit(db, actorId, 'seller.closed', 'seller', sellerId, correlationId, {
        users: users.rowCount,
      });
      return 'CLOSED';
    });
  }

  /** Customers by email (partial match), newest first. */
  public async findCustomers(email: string) {
    const result = await this.pool.query<{
      id: string; email: string; status: string; created_at: Date; orders: string; open: string;
    }>(
      `SELECT u.id, c.email, u.status, u.created_at,
         (SELECT count(*) FROM commerce.orders o WHERE o.customer_id = u.id) AS orders,
         (SELECT count(*) FROM commerce.seller_orders so JOIN commerce.orders o ON o.id = so.order_id
            WHERE o.customer_id = u.id AND so.status IN ${OPEN_ORDER_STATUSES}) AS open
       FROM identity.users u
       JOIN identity.password_credentials c ON c.user_id = u.id
       WHERE c.email ILIKE $1 AND u.pseudonymized_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM identity.user_role_assignments a
                         JOIN identity.roles r ON r.id = a.role_id
                         WHERE a.user_id = u.id AND a.revoked_at IS NULL
                           AND r.actor_type IN ('staff', 'seller_user'))
       ORDER BY u.created_at DESC LIMIT 50`,
      [`%${email.replace(/[\\%_]/g, (c) => `\\${c}`)}%`],
    );
    return result.rows.map((r) => ({
      userId: r.id,
      email: r.email,
      status: r.status,
      createdAt: r.created_at.toISOString(),
      orders: Number(r.orders),
      openOrders: Number(r.open),
    }));
  }

  /**
   * Recent audit events, newest first, for staff accountability. Staff and seller actors are
   * shown by their login email; customers only by id. `before` pages on (occurredAt, id).
   */
  public async auditLog(filters: {
    readonly area?: string | undefined;
    readonly actorType?: string | undefined;
    readonly entityId?: string | undefined;
    readonly before?: { readonly at: string; readonly id: string } | undefined;
  }) {
    const result = await this.pool.query<{
      id: string; occurred_at: Date; actor_type: string; actor_id: string | null;
      actor_email: string | null; action: string; outcome: string; entity_type: string;
      entity_id: string | null; reason: string | null; details: unknown;
    }>(
      `SELECT e.event_id AS id, e.occurred_at, e.actor_type, e.actor_id,
         CASE WHEN e.actor_type IN ('staff', 'seller_user') THEN c.email END AS actor_email,
         e.action, e.outcome, e.entity_type, e.entity_id, e.reason,
         COALESCE(e.after_data, e.before_data) AS details
       FROM platform.audit_events e
       LEFT JOIN identity.password_credentials c ON c.user_id = e.actor_id
       WHERE ($1::text IS NULL OR e.action LIKE $1 || '.%')
         AND ($2::text IS NULL OR e.actor_type = $2)
         AND ($3::uuid IS NULL OR e.entity_id = $3 OR e.actor_id = $3)
         AND ($4::timestamptz IS NULL OR (e.occurred_at, e.event_id) < ($4::timestamptz, $5::uuid))
       ORDER BY e.occurred_at DESC, e.event_id DESC LIMIT 51`,
      [
        filters.area ?? null,
        filters.actorType ?? null,
        filters.entityId ?? null,
        filters.before?.at ?? null,
        filters.before?.id ?? null,
      ],
    );
    const rows = result.rows.slice(0, 50);
    const last = rows.at(-1);
    return {
      items: rows.map((row) => ({
        id: row.id,
        occurredAt: row.occurred_at.toISOString(),
        actorType: row.actor_type,
        actorId: row.actor_id,
        actorEmail: row.actor_email,
        action: row.action,
        outcome: row.outcome,
        entityType: row.entity_type,
        entityId: row.entity_id,
        reason: row.reason,
        // A short, readable summary of what changed (never more than 400 characters).
        details: row.details === null ? null : JSON.stringify(row.details).slice(0, 400),
      })),
      next:
        result.rows.length > 50 && last
          ? { at: last.occurred_at.toISOString(), id: last.id }
          : null,
    };
  }

  /** Deletes a customer account as the customer could (orders stay as commercial records). */
  public async closeCustomer(
    userId: string,
    actorId: string,
    correlationId: string,
  ): Promise<'CLOSED' | 'OPEN_ORDERS' | null> {
    return this.transaction(async (db) => {
      const found = await db.query(
        `SELECT id FROM identity.users WHERE id = $1 AND pseudonymized_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM identity.user_role_assignments a
             JOIN identity.roles r ON r.id = a.role_id
             WHERE a.user_id = $1 AND a.revoked_at IS NULL AND r.actor_type IN ('staff', 'seller_user'))
         FOR UPDATE`,
        [userId],
      );
      if (found.rowCount !== 1) return null;
      const open = await db.query<{ count: string }>(
        `SELECT count(*) FROM commerce.seller_orders so JOIN commerce.orders o ON o.id = so.order_id
         WHERE o.customer_id = $1 AND so.status IN ${OPEN_ORDER_STATUSES}`,
        [userId],
      );
      if (Number(open.rows[0]?.count ?? 0) > 0) return 'OPEN_ORDERS';
      await db.query('DELETE FROM commerce.product_reviews WHERE customer_id = $1', [userId]);
      await this.erase(db, userId);
      await this.audit(db, actorId, 'identity.account_deleted', 'user', userId, correlationId, {
        by: 'staff',
      });
      return 'CLOSED';
    });
  }
}
