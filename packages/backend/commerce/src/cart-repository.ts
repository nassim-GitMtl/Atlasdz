import {
  CustomerCartSchema,
  SetCartItemInputSchema,
  UuidSchema,
  type CustomerCart,
  type SetCartItemInput,
} from '@atlas/contracts';
import type { Pool, PoolClient } from 'pg';

export class CartWriteError extends Error {
  constructor(readonly code: 'CART_CONFLICT' | 'CART_OFFER_UNAVAILABLE' | 'CART_LIMIT_REACHED') {
    super(code);
    this.name = 'CartWriteError';
  }
}

// The same publication criteria as anonymous discovery. A saved reference never grants
// access to an unpublished seller/product. The snapshot is current at this SQL statement.
const PUBLIC = `o.status = 'APPROVED' AND s.status = 'APPROVED'
  AND p.status = 'ACTIVE' AND p.moderation_status = 'APPROVED'
  AND c.status = 'ACTIVE' AND c.moderation_status = 'APPROVED'
  AND c.restriction_class = 'STANDARD'`;
const JOINS = `JOIN sellers.sellers s ON s.id = o.seller_id
  JOIN catalog.products p ON p.id = o.product_id
  JOIN catalog.categories c ON c.id = p.category_id`;

export async function readCartSnapshot(
  connection: Pool | PoolClient,
  customerId: string,
): Promise<CustomerCart> {
  const result = await connection.query<{ cart: unknown }>(
    `
    SELECT jsonb_build_object('version', cart.row_version, 'currency', 'DZD',
      'items', COALESCE(lines.items, '[]'::jsonb),
      'availableSubtotalMinor', COALESCE(lines.subtotal, 0)) AS cart
    FROM commerce.carts cart
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
        'offerId', ci.offer_id, 'quantity', ci.quantity,
        'state', CASE WHEN NOT (${PUBLIC}) THEN 'UNAVAILABLE'
          WHEN ci.quantity > o.available_quantity THEN 'INSUFFICIENT_STOCK' ELSE 'AVAILABLE' END,
        'product', CASE WHEN ${PUBLIC} THEN jsonb_build_object(
          'id', p.id, 'slug', p.slug, 'title', jsonb_build_object('fr', p.title_fr, 'ar', p.title_ar),
          'imageUrl', p.image_url) ELSE NULL END,
        'offer', CASE WHEN ${PUBLIC} THEN jsonb_build_object(
          'id', o.id, 'seller', jsonb_build_object('id', s.id, 'slug', s.slug, 'name', s.name),
          'priceMinor', o.price_minor, 'currency', o.currency, 'availableQuantity', o.available_quantity,
          'handlingDays', o.handling_days, 'deliveryFeeMinor', o.delivery_fee_minor) ELSE NULL END,
        'lineSubtotalMinor', CASE WHEN ${PUBLIC} THEN ci.quantity::bigint * o.price_minor ELSE NULL END
      ) ORDER BY ci.created_at, ci.offer_id) AS items,
      SUM(CASE WHEN (${PUBLIC}) AND ci.quantity <= o.available_quantity
        THEN ci.quantity::bigint * o.price_minor ELSE 0 END) AS subtotal
      FROM commerce.cart_items ci JOIN offers.offers o ON o.id = ci.offer_id ${JOINS}
      WHERE ci.customer_id = cart.customer_id
    ) lines ON true WHERE cart.customer_id = $1`,
    [customerId],
  );
  return CustomerCartSchema.parse(
    result.rows[0]?.cart ?? {
      version: 0,
      currency: 'DZD',
      items: [],
      availableSubtotalMinor: 0,
    },
  );
}

export class PostgresCartRepository {
  constructor(private readonly pool: Pool) {}

  async getCart(customerId: string): Promise<CustomerCart> {
    return readCartSnapshot(this.pool, UuidSchema.parse(customerId));
  }

  async setItem(
    customerId: string,
    offerId: string,
    input: SetCartItemInput,
  ): Promise<CustomerCart> {
    UuidSchema.parse(customerId);
    UuidSchema.parse(offerId);
    const { quantity, expectedVersion } = SetCartItemInputSchema.parse(input);
    const client = await this.pool.connect();
    let broken = false;
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO commerce.carts (customer_id) VALUES ($1) ON CONFLICT DO NOTHING',
        [customerId],
      );
      const cart = await client.query<{ row_version: number }>(
        'SELECT row_version FROM commerce.carts WHERE customer_id = $1 FOR UPDATE',
        [customerId],
      );
      if (cart.rows[0]?.row_version !== expectedVersion) throw new CartWriteError('CART_CONFLICT');
      if (quantity === 0) {
        // Removing a hidden/stockless offer must remain possible.
        await client.query(
          'DELETE FROM commerce.cart_items WHERE customer_id = $1 AND offer_id = $2',
          [customerId, offerId],
        );
      } else {
        const offer = await client.query(
          `SELECT o.id FROM offers.offers o ${JOINS}
          WHERE o.id = $1 AND ${PUBLIC} AND o.available_quantity >= $2`,
          [offerId, quantity],
        );
        if (offer.rows.length !== 1) throw new CartWriteError('CART_OFFER_UNAVAILABLE');
        const size = await client.query<{ count: number; exists: boolean }>(
          `SELECT count(*)::integer AS count, COALESCE(bool_or(offer_id = $2), false) AS exists
           FROM commerce.cart_items WHERE customer_id = $1`,
          [customerId, offerId],
        );
        if ((size.rows[0]?.count ?? 0) >= 50 && !size.rows[0]?.exists)
          throw new CartWriteError('CART_LIMIT_REACHED');
        await client.query(
          `INSERT INTO commerce.cart_items (customer_id, offer_id, quantity)
          VALUES ($1, $2, $3) ON CONFLICT (customer_id, offer_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
          [customerId, offerId, quantity],
        );
      }
      await client.query(
        `UPDATE commerce.carts SET row_version = row_version + 1,
        updated_at = clock_timestamp() WHERE customer_id = $1`,
        [customerId],
      );
      const result = await readCartSnapshot(client, customerId);
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
}
