import type { Pool } from 'pg';

/** Waiting alerts a customer may keep at once. */
export const MAX_STOCK_ALERTS = 50;

export type StockAlertErrorCode = 'PRODUCT_NOT_FOUND' | 'IN_STOCK' | 'LIMIT_REACHED';

export class StockAlertError extends Error {
  public constructor(public readonly code: StockAlertErrorCode) {
    super(code);
    this.name = 'StockAlertError';
  }
}

export interface StockAlertItem {
  readonly slug: string;
  readonly title: { readonly fr: string; readonly ar: string; readonly en?: string };
  readonly createdAt: string;
}

export interface DueStockAlert {
  readonly id: string;
  readonly customerId: string;
  readonly slug: string;
  readonly title: { readonly fr: string; readonly ar: string; readonly en?: string };
}

/** A product shoppers can see: active, approved, in a standard category, with a live offer. */
const PUBLIC_PRODUCT = `
  p.status = 'ACTIVE' AND p.moderation_status = 'APPROVED'
  AND EXISTS (SELECT 1 FROM catalog.categories c WHERE c.id = p.category_id
    AND c.status = 'ACTIVE' AND c.moderation_status = 'APPROVED' AND c.restriction_class = 'STANDARD')
  AND EXISTS (SELECT 1 FROM offers.offers o JOIN sellers.sellers s ON s.id = o.seller_id
    WHERE o.product_id = p.id AND o.status = 'APPROVED' AND s.status = 'APPROVED')`;
/** At least one live offer can be bought now (pre-orders included). */
const IN_STOCK = `EXISTS (SELECT 1 FROM offers.offers o JOIN sellers.sellers s ON s.id = o.seller_id
    WHERE o.product_id = p.id AND o.status = 'APPROVED' AND s.status = 'APPROVED'
      AND o.available_quantity > 0)`;
const TITLE = `jsonb_strip_nulls(jsonb_build_object('fr', p.title_fr, 'ar', p.title_ar, 'en', p.title_en))`;

export class PostgresStockAlertRepository {
  public constructor(private readonly pool: Pool) {}

  public async waiting(customerId: string, slug: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM commerce.stock_alerts a JOIN catalog.products p ON p.id = a.product_id
       WHERE a.customer_id = $1 AND p.slug = $2 AND a.notified_at IS NULL`,
      [customerId, slug],
    );
    return result.rowCount === 1;
  }

  /** Only for a public product that is sold out everywhere; repeating it changes nothing. */
  public async subscribe(customerId: string, slug: string): Promise<void> {
    const client = await this.pool.connect();
    let broken = false;
    try {
      await client.query('BEGIN');
      // One customer at a time: the limit check and the insert stay consistent.
      await client.query('SELECT id FROM identity.users WHERE id = $1 FOR UPDATE', [customerId]);
      const product = await client.query<{ id: string; in_stock: boolean }>(
        `SELECT p.id, ${IN_STOCK} AS in_stock FROM catalog.products p
         WHERE p.slug = $1 AND ${PUBLIC_PRODUCT}`,
        [slug],
      );
      const row = product.rows[0];
      if (row === undefined) throw new StockAlertError('PRODUCT_NOT_FOUND');
      if (row.in_stock) throw new StockAlertError('IN_STOCK');
      const count = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM commerce.stock_alerts
         WHERE customer_id = $1 AND notified_at IS NULL AND product_id <> $2`,
        [customerId, row.id],
      );
      if ((count.rows[0]?.n ?? 0) >= MAX_STOCK_ALERTS) throw new StockAlertError('LIMIT_REACHED');
      await client.query(
        `INSERT INTO commerce.stock_alerts (customer_id, product_id) VALUES ($1, $2)
         ON CONFLICT (customer_id, product_id) WHERE notified_at IS NULL DO NOTHING`,
        [customerId, row.id],
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

  public async unsubscribe(customerId: string, slug: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM commerce.stock_alerts a USING catalog.products p
       WHERE p.id = a.product_id AND a.customer_id = $1 AND p.slug = $2 AND a.notified_at IS NULL`,
      [customerId, slug],
    );
    return (result.rowCount ?? 0) > 0;
  }

  public async list(customerId: string): Promise<StockAlertItem[]> {
    const result = await this.pool.query<StockAlertItem>(
      `SELECT p.slug, ${TITLE} AS title,
         to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
       FROM commerce.stock_alerts a JOIN catalog.products p ON p.id = a.product_id
       WHERE a.customer_id = $1 AND a.notified_at IS NULL
       ORDER BY a.created_at DESC LIMIT ${MAX_STOCK_ALERTS}`,
      [customerId],
    );
    return result.rows;
  }

  /** Waiting alerts for the offer's product, when that product can be bought again. */
  public async dueForOffer(offerId: string): Promise<DueStockAlert[]> {
    const result = await this.pool.query<DueStockAlert>(
      `SELECT a.id, a.customer_id AS "customerId", p.slug, ${TITLE} AS title
       FROM commerce.stock_alerts a JOIN catalog.products p ON p.id = a.product_id
       WHERE a.product_id = (SELECT product_id FROM offers.offers WHERE id = $1)
         AND a.notified_at IS NULL AND ${PUBLIC_PRODUCT} AND ${IN_STOCK}
       ORDER BY a.created_at LIMIT 500`,
      [offerId],
    );
    return result.rows;
  }

  /** Marks one alert as sent (after its email); false when it was already handled. */
  public async markNotified(alertId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE commerce.stock_alerts SET notified_at = clock_timestamp()
       WHERE id = $1 AND notified_at IS NULL`,
      [alertId],
    );
    return result.rowCount === 1;
  }
}
