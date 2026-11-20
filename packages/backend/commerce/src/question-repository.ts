import type { Pool } from 'pg';

export type QuestionErrorCode = 'NOT_FOUND' | 'LIMIT_REACHED';
export class QuestionError extends Error {
  public constructor(public readonly code: QuestionErrorCode) {
    super(code);
    this.name = 'QuestionError';
  }
}

/** Questions a customer may ask per 24 hours (all products). */
export const QUESTIONS_PER_DAY = 10;

const ISO = (column: string) =>
  `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
const PUBLIC_PRODUCT = `p.status = 'ACTIVE' AND p.moderation_status = 'APPROVED'`;
const ANSWERS = `COALESCE((SELECT jsonb_agg(jsonb_build_object('sellerName', s.name, 'body', a.body,
    'createdAt', ${ISO('a.created_at')}) ORDER BY a.created_at)
  FROM catalog.product_answers a JOIN sellers.sellers s ON s.id = a.seller_id
  WHERE a.question_id = q.id AND s.status = 'APPROVED'), '[]'::jsonb)`;

export class PostgresQuestionRepository {
  public constructor(private readonly pool: Pool) {}

  /** Published questions of a public product, newest first, with the sellers' answers. */
  public async list(slug: string) {
    const result = await this.pool.query<{ question: unknown }>(
      `SELECT jsonb_build_object('id', q.id, 'body', q.body, 'createdAt', ${ISO('q.created_at')},
         'answers', ${ANSWERS}) AS question
       FROM catalog.product_questions q JOIN catalog.products p ON p.id = q.product_id
       WHERE p.slug = $1 AND ${PUBLIC_PRODUCT} AND q.status = 'PUBLISHED'
       ORDER BY q.created_at DESC LIMIT 30`,
      [slug],
    );
    return result.rows.map((row) => row.question);
  }

  public async ask(customerId: string, slug: string, body: string) {
    const client = await this.pool.connect();
    let broken = false;
    try {
      await client.query('BEGIN');
      // One customer at a time, so the daily limit cannot be raced.
      await client.query('SELECT id FROM identity.users WHERE id = $1 FOR UPDATE', [customerId]);
      const product = await client.query<{ id: string }>(
        `SELECT p.id FROM catalog.products p WHERE p.slug = $1 AND ${PUBLIC_PRODUCT}`,
        [slug],
      );
      const productId = product.rows[0]?.id;
      if (productId === undefined) throw new QuestionError('NOT_FOUND');
      const recent = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM catalog.product_questions
         WHERE customer_id = $1 AND created_at > clock_timestamp() - interval '24 hours'`,
        [customerId],
      );
      if ((recent.rows[0]?.n ?? 0) >= QUESTIONS_PER_DAY) throw new QuestionError('LIMIT_REACHED');
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO catalog.product_questions (product_id, customer_id, body)
         VALUES ($1, $2, $3) RETURNING id`,
        [productId, customerId, body],
      );
      await client.query('COMMIT');
      return { id: inserted.rows[0]?.id as string };
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

  /** Questions on products this seller offers; unanswered (by this seller) first. */
  public async sellerList(sellerId: string) {
    const result = await this.pool.query<{ question: unknown }>(
      `SELECT jsonb_build_object('id', q.id, 'body', q.body, 'createdAt', ${ISO('q.created_at')},
         'product', jsonb_build_object('slug', p.slug,
           'title', jsonb_strip_nulls(jsonb_build_object('fr', p.title_fr, 'ar', p.title_ar, 'en', p.title_en))),
         'answer', a.body) AS question
       FROM catalog.product_questions q
       JOIN catalog.products p ON p.id = q.product_id
       LEFT JOIN catalog.product_answers a ON a.question_id = q.id AND a.seller_id = $1
       WHERE q.status = 'PUBLISHED' AND EXISTS (
         SELECT 1 FROM offers.offers o WHERE o.product_id = q.product_id AND o.seller_id = $1
           AND o.status IN ('APPROVED', 'PENDING_REVIEW'))
       ORDER BY (a.id IS NULL) DESC, q.created_at DESC LIMIT 100`,
      [sellerId],
    );
    return result.rows.map((row) => row.question);
  }

  /** A seller offering the product answers (or corrects its answer). */
  public async answer(sellerId: string, userId: string, questionId: string, body: string) {
    const result = await this.pool.query(
      `INSERT INTO catalog.product_answers (question_id, seller_id, author_user_id, body)
       SELECT q.id, $2, $3, $4 FROM catalog.product_questions q
       WHERE q.id = $1 AND q.status = 'PUBLISHED' AND EXISTS (
         SELECT 1 FROM offers.offers o WHERE o.product_id = q.product_id AND o.seller_id = $2
           AND o.status IN ('APPROVED', 'PENDING_REVIEW'))
       ON CONFLICT (question_id, seller_id)
       DO UPDATE SET body = EXCLUDED.body, author_user_id = EXCLUDED.author_user_id,
         created_at = clock_timestamp()`,
      [questionId, sellerId, userId, body],
    );
    if (result.rowCount !== 1) throw new QuestionError('NOT_FOUND');
  }

  /** Latest questions for staff moderation (any status). */
  public async staffList() {
    const result = await this.pool.query<{ question: unknown }>(
      `SELECT jsonb_build_object('id', q.id, 'body', q.body, 'status', q.status,
         'createdAt', ${ISO('q.created_at')}, 'productSlug', p.slug, 'customerId', q.customer_id) AS question
       FROM catalog.product_questions q JOIN catalog.products p ON p.id = q.product_id
       ORDER BY q.created_at DESC LIMIT 50`,
    );
    return result.rows.map((row) => row.question);
  }

  /** Staff hide a question (it disappears with its answers); audited. */
  public async hide(questionId: string, staffUserId: string, correlationId: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query(
        `UPDATE catalog.product_questions SET status = 'HIDDEN' WHERE id = $1 AND status = 'PUBLISHED'`,
        [questionId],
      );
      if (updated.rowCount !== 1) {
        await client.query('ROLLBACK');
        return false;
      }
      await client.query(
        `INSERT INTO platform.audit_events
           (actor_type, actor_id, scope_snapshot, action, outcome, entity_type, entity_id, correlation_id)
         VALUES ('staff', $1, '{"type":"GLOBAL"}', 'product_question.hidden', 'SUCCEEDED',
           'product_question', $2, $3)`,
        [staffUserId, questionId, correlationId],
      );
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
