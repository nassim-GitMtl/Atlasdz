import type { AddSellerOrderNoteInput, SellerOrderNote } from '@atlas/contracts';
import type { Pool } from 'pg';

/** Notes one seller order may hold. */
export const NOTES_PER_ORDER = 100;

export class OrderNoteError extends Error {
  public constructor(public readonly code: 'NOT_FOUND' | 'LIMIT_REACHED') {
    super(code);
  }
}

const NOTE_JSON = `jsonb_build_object('id', n.id, 'kind', n.kind, 'body', n.body,
  'author', c.email,
  'createdAt', to_char(n.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))`;

/** The seller team's private notes on its own orders (author shown by email). */
export class PostgresOrderNoteRepository {
  public constructor(private readonly pool: Pool) {}

  /** Oldest first; null when the order does not belong to the seller. */
  public async list(sellerId: string, sellerOrderId: string): Promise<SellerOrderNote[] | null> {
    const owned = await this.pool.query(
      'SELECT 1 FROM commerce.seller_orders WHERE id = $1 AND seller_id = $2',
      [sellerOrderId, sellerId],
    );
    if (owned.rowCount !== 1) return null;
    const result = await this.pool.query<{ note: SellerOrderNote }>(
      `SELECT ${NOTE_JSON} AS note FROM commerce.seller_order_notes n
       LEFT JOIN identity.password_credentials c ON c.user_id = n.author_id
       WHERE n.seller_order_id = $1 ORDER BY n.created_at, n.id`,
      [sellerOrderId],
    );
    return result.rows.map((row) => row.note);
  }

  public async add(
    sellerId: string,
    sellerOrderId: string,
    authorId: string,
    input: AddSellerOrderNoteInput,
    correlationId: string,
  ): Promise<SellerOrderNote> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const owned = await client.query(
        'SELECT 1 FROM commerce.seller_orders WHERE id = $1 AND seller_id = $2 FOR UPDATE',
        [sellerOrderId, sellerId],
      );
      if (owned.rowCount !== 1) throw new OrderNoteError('NOT_FOUND');
      const count = await client.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM commerce.seller_order_notes WHERE seller_order_id = $1',
        [sellerOrderId],
      );
      if ((count.rows[0]?.n ?? 0) >= NOTES_PER_ORDER) throw new OrderNoteError('LIMIT_REACHED');
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO commerce.seller_order_notes (seller_order_id, author_id, kind, body)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [sellerOrderId, authorId, input.kind, input.body ?? null],
      );
      const id = inserted.rows[0]?.id;
      // The note text may hold personal data: the audit trail records only its kind.
      await client.query(
        `INSERT INTO platform.audit_events
           (actor_type, actor_id, scope_snapshot, action, outcome, entity_type, entity_id,
            correlation_id, after_data)
         VALUES ('seller_user', $1, $2, 'seller_order.note_added', 'SUCCEEDED', 'seller_order', $3, $4, $5)`,
        [
          authorId,
          JSON.stringify({ type: 'SELLER', id: sellerId }),
          sellerOrderId,
          correlationId,
          JSON.stringify({ kind: input.kind }),
        ],
      );
      const note = await client.query<{ note: SellerOrderNote }>(
        `SELECT ${NOTE_JSON} AS note FROM commerce.seller_order_notes n
         LEFT JOIN identity.password_credentials c ON c.user_id = n.author_id WHERE n.id = $1`,
        [id],
      );
      await client.query('COMMIT');
      const saved = note.rows[0]?.note;
      if (!saved) throw new Error('Saved note missing');
      return saved;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
