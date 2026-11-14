import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';

export const COD_RISK = Symbol('atlas.cod-risk');

// SQL twin of toE164 for numbers stored in quote snapshots (0XXXXXXXXX, 00…, +…).
const NORMALIZED_PHONE = `(SELECT CASE
    WHEN p ~ '^0[5-7][0-9]{8}$' THEN '+213' || substr(p, 2)
    WHEN p ~ '^00' THEN '+' || substr(p, 3)
    ELSE p END
  FROM (SELECT q.snapshot->'deliveryContact'->>'phone' AS p) phone)`;
const OPEN = `('AWAITING_SELLER','ACCEPTED','PREPARING','SHIPPED','DELIVERY_REPORTED')`;

export interface CodLimits {
  /** Open live seller orders allowed for an account younger than `newAccountDays`. */
  readonly newAccountOpenOrders: number;
  readonly newAccountDays: number;
  readonly openOrders: number;
  readonly openOrdersPerPhone: number;
  /** Failed deliveries within 90 days that block cash on delivery. */
  readonly failedDeliveriesBlock: number;
}
export const DEFAULT_COD_LIMITS: CodLimits = {
  newAccountOpenOrders: 1,
  newAccountDays: 7,
  openOrders: 3,
  openOrdersPerPhone: 3,
  failedDeliveriesBlock: 2,
};

export type CodDecision = 'ALLOWED' | 'LIMIT_REACHED' | 'BLOCKED' | 'PHONE_NOT_VERIFIED';

/** Normalizes Algerian/international numbers to E.164 (+213…); null when not plausible. */
export function toE164(raw: string): string | null {
  const digits = raw.replace(/[\s.-]/g, '');
  let e164: string;
  if (/^0[5-7][0-9]{8}$/.test(digits)) e164 = `+213${digits.slice(1)}`;
  else if (/^00[1-9][0-9]{7,14}$/.test(digits)) e164 = `+${digits.slice(2)}`;
  else if (/^\+[1-9][0-9]{7,14}$/.test(digits)) e164 = digits;
  else return null;
  return e164;
}

const hash = (value: string) => createHash('sha256').update(value).digest();

export interface SmsSender {
  send(phoneE164: string, message: string): Promise<void>;
}

/**
 * Generic HTTP SMS gateway: POST {to, message} JSON with a bearer token. Most Algerian
 * aggregators and international providers can be fronted this way.
 */
export class HttpSmsSender implements SmsSender {
  public constructor(
    private readonly url: string,
    private readonly token: string | null,
  ) {}
  public async send(to: string, message: string): Promise<void> {
    const response = await fetch(this.url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      headers: {
        'content-type': 'application/json',
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify({ to, message }),
    });
    if (!response.ok) throw new Error(`SMS gateway returned ${response.status}`);
  }
}

export class CodRiskService {
  public constructor(
    private readonly pool: Pool,
    private readonly sms: SmsSender | null,
    private readonly limits: CodLimits = DEFAULT_COD_LIMITS,
  ) {}

  public get phoneVerificationRequired(): boolean {
    return this.sms !== null;
  }

  /** Evaluated immediately before placing a live COD order. */
  public async evaluate(customerId: string, deliveryPhone: string | null): Promise<CodDecision> {
    const result = await this.pool.query<{
      open_orders: string;
      failed: string;
      age_days: string;
      phone_verified: boolean;
      email_verified: boolean;
      phone_open: string;
    }>(
      `SELECT
         (SELECT count(*) FROM commerce.seller_orders so JOIN commerce.orders o ON o.id = so.order_id
          WHERE o.customer_id = $1 AND o.payment_state = 'CASH_ON_DELIVERY'
            AND so.status IN ${OPEN}) AS open_orders,
         (SELECT count(*) FROM commerce.seller_orders so JOIN commerce.orders o ON o.id = so.order_id
          WHERE o.customer_id = $1 AND so.status = 'DELIVERY_FAILED'
            AND so.closed_at > clock_timestamp() - interval '90 days') AS failed,
         (SELECT extract(day FROM clock_timestamp() - u.created_at)::int
          FROM identity.users u WHERE u.id = $1) AS age_days,
         COALESCE((SELECT phone_verified_at IS NOT NULL FROM identity.password_credentials
          WHERE user_id = $1), false) AS phone_verified,
         COALESCE((SELECT email_verified_at IS NOT NULL FROM identity.password_credentials
          WHERE user_id = $1), false) AS email_verified,
         (SELECT count(*) FROM commerce.seller_orders so
          JOIN commerce.orders o ON o.id = so.order_id
          JOIN commerce.checkout_quotes q ON q.id = o.quote_id
          WHERE $2::text IS NOT NULL AND ${NORMALIZED_PHONE} = $2
            AND o.payment_state = 'CASH_ON_DELIVERY' AND so.status IN ${OPEN}) AS phone_open`,
      [customerId, deliveryPhone === null ? null : toE164(deliveryPhone)],
    );
    const row = result.rows[0];
    if (row === undefined) return 'BLOCKED';
    if (Number(row.failed) >= this.limits.failedDeliveriesBlock) return 'BLOCKED';
    if (this.sms !== null && !row.phone_verified) return 'PHONE_NOT_VERIFIED';
    // New accounts and unconfirmed emails (guest checkout) get the small limit.
    const allowed =
      Number(row.age_days) < this.limits.newAccountDays || !row.email_verified
        ? this.limits.newAccountOpenOrders
        : this.limits.openOrders;
    if (Number(row.open_orders) >= allowed) return 'LIMIT_REACHED';
    if (Number(row.phone_open) >= this.limits.openOrdersPerPhone) return 'LIMIT_REACHED';
    return 'ALLOWED';
  }

  /** Seller-facing signal shown on an order so the seller can decide to call first. */
  public async customerSignal(sellerId: string, sellerOrderId: string) {
    const result = await this.pool.query<{
      phone_verified: boolean;
      email_verified: boolean;
      phone_e164: string | null;
      delivery_phone: string | null;
      delivered: string;
      failed: string;
      cancelled: string;
      age_days: number;
    }>(
      `SELECT c.phone_verified_at IS NOT NULL AS phone_verified,
         COALESCE(c.email_verified_at IS NOT NULL, false) AS email_verified,
         c.phone_e164, q.snapshot->'deliveryContact'->>'phone' AS delivery_phone,
         (SELECT count(*) FROM commerce.seller_orders s2 JOIN commerce.orders o2 ON o2.id = s2.order_id
          WHERE o2.customer_id = o.customer_id AND s2.status = 'DELIVERED') AS delivered,
         (SELECT count(*) FROM commerce.seller_orders s2 JOIN commerce.orders o2 ON o2.id = s2.order_id
          WHERE o2.customer_id = o.customer_id AND s2.status = 'DELIVERY_FAILED') AS failed,
         (SELECT count(*) FROM commerce.seller_orders s2 JOIN commerce.orders o2 ON o2.id = s2.order_id
          WHERE o2.customer_id = o.customer_id AND s2.status = 'CANCELLED') AS cancelled,
         extract(day FROM clock_timestamp() - u.created_at)::int AS age_days
       FROM commerce.seller_orders so
       JOIN commerce.orders o ON o.id = so.order_id
       JOIN commerce.checkout_quotes q ON q.id = o.quote_id
       JOIN identity.users u ON u.id = o.customer_id
       LEFT JOIN identity.password_credentials c ON c.user_id = o.customer_id
       WHERE so.id = $1 AND so.seller_id = $2`,
      [sellerOrderId, sellerId],
    );
    const row = result.rows[0];
    if (row === undefined) return null;
    return {
      phoneVerified: row.phone_verified,
      emailVerified: row.email_verified,
      deliveryPhoneVerified:
        row.phone_verified &&
        row.delivery_phone !== null &&
        toE164(row.delivery_phone) === row.phone_e164,
      deliveredOrders: Number(row.delivered),
      failedDeliveries: Number(row.failed),
      cancelledOrders: Number(row.cancelled),
      accountAgeDays: Number(row.age_days),
    };
  }

  /** Sends a 6-digit code (10 minutes, 5 attempts). Max 3 codes per hour per account. */
  public async startPhoneVerification(
    userId: string,
    rawPhone: string,
    locale: 'fr' | 'ar',
  ): Promise<'SENT' | 'INVALID_PHONE' | 'THROTTLED' | 'UNAVAILABLE'> {
    if (this.sms === null) return 'UNAVAILABLE';
    const phone = toE164(rawPhone);
    if (phone === null) return 'INVALID_PHONE';
    // Per account (3 per hour) and per number across accounts (5 per day): stops SMS bombing of
    // a third party's phone and bounds gateway costs.
    const recent = await this.pool.query<{ account_hour: string; phone_day: string }>(
      `SELECT count(*) FILTER (WHERE user_id = $1
                AND created_at > clock_timestamp() - interval '1 hour') AS account_hour,
              count(*) FILTER (WHERE phone_e164 = $2) AS phone_day
       FROM identity.phone_verification_codes
       WHERE (user_id = $1 OR phone_e164 = $2)
         AND created_at > clock_timestamp() - interval '24 hours'`,
      [userId, phone],
    );
    const counts = recent.rows[0];
    if (Number(counts?.account_hour ?? 0) >= 3 || Number(counts?.phone_day ?? 0) >= 5) {
      return 'THROTTLED';
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.pool.query(
      `INSERT INTO identity.phone_verification_codes (user_id, phone_e164, code_hash, expires_at)
       VALUES ($1, $2, $3, clock_timestamp() + interval '10 minutes')`,
      [userId, phone, hash(`${userId}:${phone}:${code}`)],
    );
    await this.sms.send(
      phone,
      locale === 'ar'
        ? `رمز تأكيد أطلس دي زد: ${code} (صالح 10 دقائق)`
        : `Atlas DZ : votre code de confirmation est ${code} (valable 10 min).`,
    );
    return 'SENT';
  }

  public async confirmPhone(
    userId: string,
    rawPhone: string,
    code: string,
  ): Promise<'VERIFIED' | 'INVALID'> {
    const phone = toE164(rawPhone);
    if (phone === null || !/^[0-9]{6}$/.test(code)) return 'INVALID';
    const client = await this.pool.connect();
    let broken = false;
    try {
      await client.query('BEGIN');
      const pending = await client.query<{ id: string; code_hash: Buffer; attempts: number }>(
        `SELECT id, code_hash, attempts FROM identity.phone_verification_codes
         WHERE user_id = $1 AND phone_e164 = $2 AND consumed_at IS NULL
           AND expires_at > clock_timestamp() AND attempts < 5
         ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [userId, phone],
      );
      const row = pending.rows[0];
      if (row === undefined) {
        await client.query('ROLLBACK');
        return 'INVALID';
      }
      const ok = timingSafeEqual(row.code_hash, hash(`${userId}:${phone}:${code}`));
      if (!ok) {
        await client.query(
          'UPDATE identity.phone_verification_codes SET attempts = attempts + 1 WHERE id = $1',
          [row.id],
        );
        await client.query('COMMIT');
        return 'INVALID';
      }
      await client.query(
        'UPDATE identity.phone_verification_codes SET consumed_at = clock_timestamp() WHERE id = $1',
        [row.id],
      );
      await client.query(
        `UPDATE identity.password_credentials
         SET phone_e164 = $2, phone_verified_at = clock_timestamp(), updated_at = clock_timestamp()
         WHERE user_id = $1`,
        [userId, phone],
      );
      await client.query('COMMIT');
      return 'VERIFIED';
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

  public async phoneStatus(userId: string) {
    const result = await this.pool.query<{ phone_e164: string | null; verified: boolean }>(
      `SELECT phone_e164, phone_verified_at IS NOT NULL AS verified
       FROM identity.password_credentials WHERE user_id = $1`,
      [userId],
    );
    const row = result.rows[0];
    return {
      required: this.phoneVerificationRequired,
      phone: row?.verified ? row.phone_e164 : null,
      verified: row?.verified === true,
    };
  }
}
