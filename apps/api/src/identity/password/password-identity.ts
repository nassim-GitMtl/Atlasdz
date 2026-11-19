import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type {
  AccessCredentialVerifierPort,
  CredentialVerificationResult,
  VerifiedAccessClaims,
} from '@atlas/identity';
import type { Pool, PoolClient } from 'pg';

import {
  DUMMY_PASSWORD_HASH,
  generateTotpSecret,
  hashPassword,
  openSecret,
  otpauthUri,
  base32Encode,
  sealSecret,
  verifyPassword,
  verifyTotp,
} from './credential-crypto.js';

export const SESSION_TOKEN_PREFIX = 'atlas-s1.';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const SESSION_LIFETIME = {
  customer: '7 days',
  seller_user: '12 hours',
  staff: '8 hours',
} as const;

type ActorType = keyof typeof SESSION_LIFETIME;
type Locale = 'fr' | 'ar' | 'en';
const asLocale = (value: string): Locale => (value === 'ar' || value === 'en' ? value : 'fr');

export interface IssuedSession {
  readonly accessToken: string;
  readonly expiresAt: string;
  readonly actorType: ActorType;
}

export type LoginResult =
  | ({ readonly status: 'AUTHENTICATED' } & IssuedSession)
  | { readonly status: 'MFA_REQUIRED' }
  | {
      readonly status: 'MFA_ENROLLMENT_REQUIRED';
      readonly secret: string;
      readonly otpauthUri: string;
    }
  | { readonly status: 'INVALID_CREDENTIALS' };

export type RegistrationResult =
  { readonly status: 'CREATED'; readonly userId: string } | { readonly status: 'CONFLICT' };

/** A buyer who orders without signing up: signed in now, sets a password from the email later. */
export type GuestRegistrationResult =
  | {
      readonly status: 'CREATED';
      readonly userId: string;
      readonly setPasswordToken: string;
      readonly session: IssuedSession;
    }
  | { readonly status: 'CONFLICT' };

export interface SellerApplication {
  readonly sellerId: string;
  readonly slug: string;
  readonly name: string;
  readonly descriptionFr: string;
  readonly descriptionAr: string;
  readonly email: string;
  readonly createdAt: string;
}

export interface AuditContext {
  readonly correlationId: string;
}

interface AssignmentRow {
  user_id: string;
  password_hash: string;
  failed_attempts: number;
  locked: boolean;
  user_status: string;
  actor_type: ActorType;
  scope_type: 'GLOBAL' | 'SELLER';
  scope_id: string | null;
  session_epoch: string;
}

const tokenHash = (token: string) => createHash('sha256').update(token).digest();

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function slugify(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return base.length >= 2 ? base : 'shop';
}

async function inTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query('BEGIN');
    const result = await work(client);
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

const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';

async function audit(
  client: PoolClient,
  input: {
    actorType: 'anonymous' | ActorType;
    actorId: string | null;
    action: string;
    outcome: 'SUCCEEDED' | 'DENIED';
    entityType: string;
    entityId: string | null;
    correlationId: string;
    after?: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO platform.audit_events
       (actor_type, actor_id, action, outcome, entity_type, entity_id, correlation_id, after_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      input.actorType,
      input.actorId,
      input.action,
      input.outcome,
      input.entityType,
      input.entityId,
      input.correlationId,
      input.after ?? null,
    ],
  );
}

/**
 * Production email/password identity. Sessions are written to the same authoritative
 * session tables the principal resolver already checks on every request.
 */
export class PasswordIdentityRepository {
  public constructor(
    private readonly pool: Pool,
    private readonly secretKey: Buffer | null,
    private readonly now: () => number = Date.now,
  ) {}

  private requireKey(): Buffer {
    if (this.secretKey === null) throw new Error('IDENTITY_SECRET_KEY is not configured');
    return this.secretKey;
  }

  private async createUser(
    client: PoolClient,
    email: string,
    passwordHash: string,
    locale: Locale,
  ): Promise<string> {
    const user = await client.query<{ id: string }>(
      "INSERT INTO identity.users (status, preferred_locale) VALUES ('ACTIVE', $1) RETURNING id",
      [locale],
    );
    const userId = user.rows[0]?.id;
    if (userId === undefined) throw new Error('User was not created');
    await client.query(
      'INSERT INTO identity.password_credentials (user_id, email, password_hash) VALUES ($1, $2, $3)',
      [userId, email, passwordHash],
    );
    return userId;
  }

  private async assignRole(
    client: PoolClient,
    userId: string,
    roleCode: 'CUSTOMER' | 'SELLER_OWNER' | 'MARKETPLACE_STAFF',
    scopeId: string | null,
    reason: string,
  ): Promise<void> {
    const assigned = await client.query(
      `INSERT INTO identity.user_role_assignments
         (user_id, role_id, actor_type, scope_type, scope_id, granted_reason)
       SELECT $1, r.id, r.actor_type, r.assignment_scope_type, $3, $4
       FROM identity.roles r WHERE r.code = $2 AND r.status = 'ACTIVE' AND r.is_system`,
      [userId, roleCode, scopeId, reason],
    );
    if (assigned.rowCount !== 1) throw new Error(`System role ${roleCode} is unavailable`);
  }

  public async registerCustomer(
    input: { email: string; password: string; locale: Locale },
    context: AuditContext,
  ): Promise<RegistrationResult> {
    const passwordHash = await hashPassword(input.password);
    try {
      return await inTransaction(this.pool, async (client) => {
        const userId = await this.createUser(client, input.email, passwordHash, input.locale);
        await this.assignRole(
          client,
          userId,
          'CUSTOMER',
          null,
          'Self-service customer registration',
        );
        await audit(client, {
          actorType: 'anonymous',
          actorId: null,
          action: 'identity.customer_registered',
          outcome: 'SUCCEEDED',
          entityType: 'user',
          entityId: userId,
          correlationId: context.correlationId,
        });
        return { status: 'CREATED', userId } as const;
      });
    } catch (error) {
      if (isUniqueViolation(error)) return { status: 'CONFLICT' };
      throw error;
    }
  }

  /**
   * Guest checkout: creates a customer account with an unusable random password, signs it in
   * and returns a single-use set-password token valid 7 days (sent by email by the caller).
   */
  public async registerGuest(
    input: { email: string; locale: Locale },
    context: AuditContext,
  ): Promise<GuestRegistrationResult> {
    const unusable = await hashPassword(randomBytes(32).toString('base64url'));
    const token = randomBytes(32).toString('base64url');
    try {
      return await inTransaction(this.pool, async (client) => {
        const userId = await this.createUser(client, input.email, unusable, input.locale);
        await this.assignRole(client, userId, 'CUSTOMER', null, 'Guest checkout');
        await client.query(
          `INSERT INTO identity.password_reset_tokens (user_id, token_hash, expires_at)
           VALUES ($1, $2, clock_timestamp() + interval '7 days')`,
          [userId, tokenHash(token)],
        );
        const user = await client.query<{ session_epoch: string }>(
          'SELECT session_epoch FROM identity.users WHERE id = $1',
          [userId],
        );
        const session = await this.issueSession(
          client,
          {
            user_id: userId,
            password_hash: unusable,
            failed_attempts: 0,
            locked: false,
            user_status: 'ACTIVE',
            actor_type: 'customer',
            scope_type: 'GLOBAL',
            scope_id: null,
            session_epoch: user.rows[0]?.session_epoch ?? '0',
          },
          false,
        );
        await audit(client, {
          actorType: 'anonymous',
          actorId: null,
          action: 'identity.guest_registered',
          outcome: 'SUCCEEDED',
          entityType: 'user',
          entityId: userId,
          correlationId: context.correlationId,
        });
        return { status: 'CREATED', userId, setPasswordToken: token, session } as const;
      });
    } catch (error) {
      if (isUniqueViolation(error)) return { status: 'CONFLICT' };
      throw error;
    }
  }

  public async registerSeller(
    input: {
      email: string;
      password: string;
      locale: Locale;
      storeName: string;
      descriptionFr: string;
      descriptionAr: string;
    },
    context: AuditContext,
  ): Promise<RegistrationResult> {
    const passwordHash = await hashPassword(input.password);
    try {
      return await inTransaction(this.pool, async (client) => {
        const userId = await this.createUser(client, input.email, passwordHash, input.locale);
        const base = slugify(input.storeName);
        const taken = await client.query<{ slug: string }>(
          `SELECT slug FROM sellers.sellers WHERE slug = $1 OR slug LIKE $1 || '-%'`,
          [base],
        );
        const used = new Set(taken.rows.map((row) => row.slug));
        let slug = base;
        for (let suffix = 2; used.has(slug); suffix += 1) slug = `${base}-${suffix}`;
        const seller = await client.query<{ id: string }>(
          `INSERT INTO sellers.sellers (slug, name, description_fr, description_ar, status)
           VALUES ($1, $2, $3, $4, 'PENDING_REVIEW') RETURNING id`,
          [slug, input.storeName.trim(), input.descriptionFr.trim(), input.descriptionAr.trim()],
        );
        const sellerId = seller.rows[0]?.id;
        if (sellerId === undefined) throw new Error('Seller was not created');
        await this.assignRole(client, userId, 'SELLER_OWNER', sellerId, 'Seller self-registration');
        await audit(client, {
          actorType: 'anonymous',
          actorId: null,
          action: 'identity.seller_registered',
          outcome: 'SUCCEEDED',
          entityType: 'seller',
          entityId: sellerId,
          correlationId: context.correlationId,
          after: { slug, status: 'PENDING_REVIEW' },
        });
        return { status: 'CREATED', userId } as const;
      });
    } catch (error) {
      if (isUniqueViolation(error)) return { status: 'CONFLICT' };
      throw error;
    }
  }

  /** Operator-only bootstrap (CLI); there is no public staff registration. */
  public async createStaff(email: string, password: string): Promise<RegistrationResult> {
    const passwordHash = await hashPassword(password);
    try {
      return await inTransaction(this.pool, async (client) => {
        const userId = await this.createUser(client, email, passwordHash, 'fr');
        await this.assignRole(client, userId, 'MARKETPLACE_STAFF', null, 'Operator-created staff');
        await audit(client, {
          actorType: 'anonymous',
          actorId: null,
          action: 'identity.staff_created',
          outcome: 'SUCCEEDED',
          entityType: 'user',
          entityId: userId,
          correlationId: randomUUID(),
        });
        return { status: 'CREATED', userId } as const;
      });
    } catch (error) {
      if (isUniqueViolation(error)) return { status: 'CONFLICT' };
      throw error;
    }
  }

  public async login(
    input: { email: string; password: string; totpCode?: string | undefined },
    context: AuditContext,
  ): Promise<LoginResult> {
    const found = await this.pool.query<AssignmentRow>(
      `SELECT c.user_id, c.password_hash, c.failed_attempts,
         (c.locked_until IS NOT NULL AND c.locked_until > clock_timestamp()) AS locked,
         u.status AS user_status, u.session_epoch,
         a.actor_type, a.scope_type, a.scope_id
       FROM identity.password_credentials c
       JOIN identity.users u ON u.id = c.user_id
       LEFT JOIN LATERAL (
         SELECT a.actor_type, a.scope_type, a.scope_id
         FROM identity.user_role_assignments a
         JOIN identity.roles r ON r.id = a.role_id
         WHERE a.user_id = c.user_id AND a.revoked_at IS NULL AND r.is_system
           AND r.status = 'ACTIVE' AND a.valid_from <= clock_timestamp()
           AND (a.valid_until IS NULL OR a.valid_until > clock_timestamp())
         ORDER BY a.valid_from LIMIT 1
       ) a ON true
       WHERE c.email = $1`,
      [input.email],
    );
    const row = found.rows[0];
    if (row === undefined) {
      await verifyPassword(input.password, DUMMY_PASSWORD_HASH);
      return { status: 'INVALID_CREDENTIALS' };
    }
    const passwordOk = await verifyPassword(input.password, row.password_hash);
    if (row.locked || row.user_status !== 'ACTIVE' || row.actor_type === null || !passwordOk) {
      if (!passwordOk && !row.locked) await this.recordFailure(row.user_id, context);
      return { status: 'INVALID_CREDENTIALS' };
    }

    const needsMfa = row.actor_type === 'seller_user' || row.actor_type === 'staff';
    let mfaStep: number | null = null;
    if (needsMfa) {
      const key = this.requireKey();
      const factor = await this.pool.query<{
        secret_ciphertext: Buffer;
        confirmed_at: Date | null;
        last_used_step: string | null;
      }>(
        'SELECT secret_ciphertext, confirmed_at, last_used_step FROM identity.totp_factors WHERE user_id = $1',
        [row.user_id],
      );
      let current = factor.rows[0];
      if (current === undefined) {
        const sealed = sealSecret(key, generateTotpSecret());
        await this.pool.query(
          `INSERT INTO identity.totp_factors (user_id, secret_ciphertext) VALUES ($1, $2)
           ON CONFLICT (user_id) DO NOTHING`,
          [row.user_id, sealed],
        );
        const reread = await this.pool.query<{
          secret_ciphertext: Buffer;
          confirmed_at: Date | null;
          last_used_step: string | null;
        }>(
          'SELECT secret_ciphertext, confirmed_at, last_used_step FROM identity.totp_factors WHERE user_id = $1',
          [row.user_id],
        );
        current = reread.rows[0];
        if (current === undefined) throw new Error('TOTP factor was not stored');
      }
      const secret = openSecret(key, current.secret_ciphertext);
      if (input.totpCode === undefined || input.totpCode === '') {
        if (current.confirmed_at !== null) return { status: 'MFA_REQUIRED' };
        return {
          status: 'MFA_ENROLLMENT_REQUIRED',
          secret: base32Encode(secret),
          otpauthUri: otpauthUri(secret, input.email),
        };
      }
      const lastStep = current.last_used_step === null ? null : Number(current.last_used_step);
      mfaStep = verifyTotp(secret, input.totpCode, this.now(), lastStep);
      if (mfaStep === null) {
        await this.recordFailure(row.user_id, context);
        return { status: 'INVALID_CREDENTIALS' };
      }
    }

    const session = await inTransaction(this.pool, async (client) => {
      if (mfaStep !== null) {
        // Compare-and-set on the step prevents a concurrent replay of the same code.
        const used = await client.query(
          `UPDATE identity.totp_factors
           SET last_used_step = $2, confirmed_at = COALESCE(confirmed_at, clock_timestamp())
           WHERE user_id = $1 AND (last_used_step IS NULL OR last_used_step < $2)`,
          [row.user_id, mfaStep],
        );
        if (used.rowCount !== 1) return null;
      }
      await client.query(
        `UPDATE identity.password_credentials
         SET failed_attempts = 0, locked_until = NULL, updated_at = clock_timestamp()
         WHERE user_id = $1`,
        [row.user_id],
      );
      const issued = await this.issueSession(client, row, mfaStep !== null);
      await audit(client, {
        actorType: row.actor_type,
        actorId: row.user_id,
        action: 'identity.login',
        outcome: 'SUCCEEDED',
        entityType: 'user',
        entityId: row.user_id,
        correlationId: context.correlationId,
      });
      return issued;
    });
    if (session === null) return { status: 'INVALID_CREDENTIALS' };
    return { status: 'AUTHENTICATED', ...session };
  }

  private async recordFailure(userId: string, context: AuditContext): Promise<void> {
    await inTransaction(this.pool, async (client) => {
      await client.query(
        `UPDATE identity.password_credentials
         SET failed_attempts = CASE WHEN failed_attempts + 1 >= $2 THEN 0 ELSE failed_attempts + 1 END,
             locked_until = CASE WHEN failed_attempts + 1 >= $2
               THEN clock_timestamp() + make_interval(mins => $3) ELSE locked_until END,
             updated_at = clock_timestamp()
         WHERE user_id = $1`,
        [userId, MAX_FAILED_ATTEMPTS, LOCKOUT_MINUTES],
      );
      await audit(client, {
        actorType: 'anonymous',
        actorId: null,
        action: 'identity.login',
        outcome: 'DENIED',
        entityType: 'user',
        entityId: userId,
        correlationId: context.correlationId,
      });
    });
  }

  private async issueSession(
    client: PoolClient,
    row: AssignmentRow,
    mfa: boolean,
  ): Promise<IssuedSession> {
    const clock = await client.query<{ issued_at: Date; expires_at: Date }>(
      `SELECT now AS issued_at, now + $1::interval AS expires_at
       FROM (SELECT date_trunc('milliseconds', clock_timestamp()) AS now) t`,
      [SESSION_LIFETIME[row.actor_type]],
    );
    const time = clock.rows[0];
    if (time === undefined) throw new Error('Session clock unavailable');
    const accessToken = `${SESSION_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
    const familyId = randomUUID();
    await client.query(
      `INSERT INTO identity.session_families
         (id, user_id, issued_session_epoch, actor_type, scope_type, scope_id, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        familyId,
        row.user_id,
        row.session_epoch,
        row.actor_type,
        row.scope_type,
        row.scope_id,
        time.issued_at,
        time.expires_at,
      ],
    );
    await client.query(
      `INSERT INTO identity.sessions
         (id, user_id, family_id, token_hash, assurance_level, issued_at, expires_at,
          mfa_completed_at, issued_session_epoch, actor_type, scope_type, scope_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        randomUUID(),
        row.user_id,
        familyId,
        tokenHash(accessToken),
        mfa ? 'MFA' : 'PRIMARY',
        time.issued_at,
        time.expires_at,
        mfa ? time.issued_at : null,
        row.session_epoch,
        row.actor_type,
        row.scope_type,
        row.scope_id,
      ],
    );
    return { accessToken, expiresAt: time.expires_at.toISOString(), actorType: row.actor_type };
  }

  public readonly credentialVerifier: AccessCredentialVerifierPort = {
    verify: async (rawCredential: string): Promise<CredentialVerificationResult> => {
      const rejected = { ok: false, code: 'CREDENTIAL_REJECTED' } as const;
      if (!rawCredential.startsWith(SESSION_TOKEN_PREFIX)) return rejected;
      const secret = rawCredential.slice(SESSION_TOKEN_PREFIX.length);
      if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) return rejected;
      try {
        const result = await this.pool.query<{
          id: string;
          user_id: string;
          family_id: string;
          issued_session_epoch: string;
          actor_type: ActorType;
          scope_type: 'GLOBAL' | 'SELLER';
          scope_id: string | null;
          assurance_level: 'PRIMARY' | 'MFA';
          issued_at: Date;
          expires_at: Date;
        }>(
          `SELECT s.id, s.user_id, s.family_id, s.issued_session_epoch, s.actor_type,
             s.scope_type, s.scope_id, s.assurance_level, s.issued_at, s.expires_at
           FROM identity.sessions s
           JOIN identity.password_credentials c ON c.user_id = s.user_id
           WHERE s.token_hash = $1 AND s.device_hash IS NULL
             AND s.revoked_at IS NULL AND s.rotated_at IS NULL
             AND s.expires_at > clock_timestamp()`,
          [tokenHash(rawCredential)],
        );
        const row = result.rows[0];
        if (result.rows.length !== 1 || row === undefined) return rejected;
        const epoch = Number(row.issued_session_epoch);
        if (!Number.isSafeInteger(epoch) || epoch < 1) return rejected;
        // The principal resolver re-validates user status, epoch, family, assignments and MFA.
        const claims: VerifiedAccessClaims = {
          tokenId: `session:${row.id}`,
          userId: row.user_id,
          sessionId: row.id,
          sessionFamilyId: row.family_id,
          sessionEpoch: epoch,
          actorType: row.actor_type,
          scope:
            row.scope_type === 'SELLER' && row.scope_id !== null
              ? { type: 'SELLER', id: row.scope_id }
              : { type: 'GLOBAL' },
          assuranceLevel: row.assurance_level,
          issuedAt: row.issued_at,
          expiresAt: row.expires_at,
        };
        return { ok: true, claims };
      } catch {
        return rejected;
      }
    },
  };

  public async listPendingSellers(): Promise<readonly SellerApplication[]> {
    const result = await this.pool.query<{
      id: string;
      slug: string;
      name: string;
      description_fr: string;
      description_ar: string;
      email: string;
      created_at: Date;
    }>(
      `SELECT s.id, s.slug, s.name, s.description_fr, s.description_ar, s.created_at,
         COALESCE(c.email, '') AS email
       FROM sellers.sellers s
       LEFT JOIN LATERAL (
         SELECT pc.email FROM identity.user_role_assignments a
         JOIN identity.password_credentials pc ON pc.user_id = a.user_id
         WHERE a.scope_type = 'SELLER' AND a.scope_id = s.id AND a.revoked_at IS NULL
         ORDER BY a.valid_from LIMIT 1
       ) c ON true
       WHERE s.status = 'PENDING_REVIEW' AND NOT s.is_synthetic
       ORDER BY s.created_at, s.id LIMIT 100`,
    );
    return result.rows.map((row) => ({
      sellerId: row.id,
      slug: row.slug,
      name: row.name,
      descriptionFr: row.description_fr,
      descriptionAr: row.description_ar,
      email: row.email,
      createdAt: row.created_at.toISOString(),
    }));
  }

  public async reviewSeller(
    input: {
      sellerId: string;
      decision: 'APPROVE' | 'REJECT';
      reason: string | null;
      staffUserId: string;
    },
    context: AuditContext,
  ): Promise<'UPDATED' | 'CONFLICT'> {
    return inTransaction(this.pool, async (client) => {
      const status = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      const updated = await client.query<{ row_version: number }>(
        `UPDATE sellers.sellers
         SET status = $2, review_reason = $3, reviewed_by = $4, reviewed_at = clock_timestamp(),
             row_version = row_version + 1
         WHERE id = $1 AND status = 'PENDING_REVIEW' AND NOT is_synthetic
         RETURNING row_version`,
        [input.sellerId, status, input.reason, input.staffUserId],
      );
      if (updated.rowCount !== 1) return 'CONFLICT';
      await audit(client, {
        actorType: 'staff',
        actorId: input.staffUserId,
        action: 'seller.reviewed',
        outcome: 'SUCCEEDED',
        entityType: 'seller',
        entityId: input.sellerId,
        correlationId: context.correlationId,
        after: { status, reason: input.reason },
      });
      return 'UPDATED';
    });
  }

  public async sellerStatus(sellerId: string): Promise<string | null> {
    const result = await this.pool.query<{ status: string }>(
      'SELECT status FROM sellers.sellers WHERE id = $1',
      [sellerId],
    );
    return result.rows[0]?.status ?? null;
  }

  /** Owner email/locale/name for seller notifications (approval, new orders). */
  public async sellerContacts(
    sellerIds: readonly string[],
  ): Promise<readonly { sellerId: string; email: string; locale: Locale; name: string }[]> {
    if (sellerIds.length === 0) return [];
    const result = await this.pool.query<{
      seller_id: string;
      email: string;
      locale: string;
      name: string;
    }>(
      `SELECT DISTINCT ON (s.id) s.id AS seller_id, c.email, u.preferred_locale AS locale, s.name
       FROM sellers.sellers s
       JOIN identity.user_role_assignments a
         ON a.scope_type = 'SELLER' AND a.scope_id = s.id AND a.revoked_at IS NULL
       JOIN identity.password_credentials c ON c.user_id = a.user_id
       JOIN identity.users u ON u.id = a.user_id AND u.status = 'ACTIVE'
       WHERE s.id = ANY($1::uuid[])
       ORDER BY s.id, a.valid_from`,
      [sellerIds],
    );
    return result.rows.map((row) => ({
      sellerId: row.seller_id,
      email: row.email,
      locale: asLocale(row.locale),
      name: row.name,
    }));
  }

  /**
   * Creates a 30-minute single-use reset token. Returns null for unknown or inactive accounts;
   * callers must respond identically either way.
   */
  public async requestPasswordReset(
    email: string,
    context: AuditContext,
  ): Promise<{ token: string; locale: Locale; actorType: ActorType } | null> {
    const found = await this.pool.query<{ user_id: string; locale: string; actor_type: ActorType }>(
      `SELECT c.user_id, u.preferred_locale AS locale, a.actor_type
       FROM identity.password_credentials c
       JOIN identity.users u ON u.id = c.user_id AND u.status = 'ACTIVE'
       JOIN LATERAL (
         SELECT a.actor_type FROM identity.user_role_assignments a
         WHERE a.user_id = c.user_id AND a.revoked_at IS NULL ORDER BY a.valid_from LIMIT 1
       ) a ON true
       WHERE c.email = $1`,
      [email],
    );
    const row = found.rows[0];
    if (row === undefined) return null;
    const token = randomBytes(32).toString('base64url');
    let stored = true;
    await inTransaction(this.pool, async (client) => {
      // At most 5 outstanding requests per hour per account.
      const recent = await client.query<{ count: string }>(
        `SELECT count(*) FROM identity.password_reset_tokens
         WHERE user_id = $1 AND created_at > clock_timestamp() - interval '1 hour'`,
        [row.user_id],
      );
      if (Number(recent.rows[0]?.count ?? 0) >= 5) throw new ResetThrottled();
      await client.query(
        `INSERT INTO identity.password_reset_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, clock_timestamp() + interval '30 minutes')`,
        [row.user_id, tokenHash(token)],
      );
      await audit(client, {
        actorType: 'anonymous',
        actorId: null,
        action: 'identity.password_reset_requested',
        outcome: 'SUCCEEDED',
        entityType: 'user',
        entityId: row.user_id,
        correlationId: context.correlationId,
      });
    }).catch((error: unknown) => {
      if (!(error instanceof ResetThrottled)) throw error;
      stored = false;
    });
    if (!stored) return null;
    return { token, locale: asLocale(row.locale), actorType: row.actor_type };
  }

  /** Consumes a reset token, sets the new password and revokes every existing session. */
  public async resetPassword(
    token: string,
    newPassword: string,
    context: AuditContext,
  ): Promise<'RESET' | 'INVALID'> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return 'INVALID';
    const passwordHash = await hashPassword(newPassword);
    return inTransaction(this.pool, async (client) => {
      const used = await client.query<{ user_id: string }>(
        `UPDATE identity.password_reset_tokens SET used_at = clock_timestamp()
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > clock_timestamp()
         RETURNING user_id`,
        [tokenHash(token)],
      );
      const userId = used.rows[0]?.user_id;
      if (userId === undefined) return 'INVALID';
      await client.query(
        // Opening the emailed link proves the inbox: the address counts as confirmed.
        `UPDATE identity.password_credentials
         SET password_hash = $2, failed_attempts = 0, locked_until = NULL,
             email_verified_at = COALESCE(email_verified_at, clock_timestamp()),
             password_changed_at = clock_timestamp(), updated_at = clock_timestamp()
         WHERE user_id = $1`,
        [userId, passwordHash],
      );
      // Invalidate other outstanding tokens and every session (epoch bump).
      await client.query(
        `UPDATE identity.password_reset_tokens SET used_at = clock_timestamp()
         WHERE user_id = $1 AND used_at IS NULL`,
        [userId],
      );
      await client.query(
        `UPDATE identity.users SET session_epoch = session_epoch + 1,
           row_version = row_version + 1, updated_at = clock_timestamp()
         WHERE id = $1`,
        [userId],
      );
      await audit(client, {
        actorType: 'anonymous',
        actorId: null,
        action: 'identity.password_reset',
        outcome: 'SUCCEEDED',
        entityType: 'user',
        entityId: userId,
        correlationId: context.correlationId,
      });
      return 'RESET';
    });
  }

  public async emailForUser(userId: string): Promise<{ email: string; locale: Locale } | null> {
    const result = await this.pool.query<{ email: string; locale: string }>(
      `SELECT c.email, u.preferred_locale AS locale FROM identity.password_credentials c
       JOIN identity.users u ON u.id = c.user_id WHERE c.user_id = $1`,
      [userId],
    );
    const row = result.rows[0];
    return row ? { email: row.email, locale: asLocale(row.locale) } : null;
  }

  /** Customer contact for a seller order (used for order status emails). */
  public async customerForSellerOrder(
    sellerOrderId: string,
  ): Promise<{ email: string; locale: Locale; orderId: string; sellerName: string } | null> {
    const result = await this.pool.query<{
      email: string;
      locale: string;
      order_id: string;
      seller_name: string;
    }>(
      `SELECT c.email, u.preferred_locale AS locale, o.id AS order_id,
         so.snapshot->>'sellerName' AS seller_name
       FROM commerce.seller_orders so
       JOIN commerce.orders o ON o.id = so.order_id
       JOIN identity.password_credentials c ON c.user_id = o.customer_id
       JOIN identity.users u ON u.id = o.customer_id AND u.status = 'ACTIVE'
       WHERE so.id = $1`,
      [sellerOrderId],
    );
    const row = result.rows[0];
    return row
      ? {
          email: row.email,
          locale: asLocale(row.locale),
          orderId: row.order_id,
          sellerName: row.seller_name,
        }
      : null;
  }

  public async isEmailVerified(userId: string): Promise<boolean> {
    const result = await this.pool.query<{ verified: boolean }>(
      `SELECT email_verified_at IS NOT NULL AS verified
       FROM identity.password_credentials WHERE user_id = $1`,
      [userId],
    );
    return result.rows[0]?.verified === true;
  }

  /** Issues a 24-hour verification token unless the email is already verified (max 5/hour). */
  public async createEmailVerification(
    userId: string,
  ): Promise<{ token: string; email: string; locale: Locale } | null> {
    const contact = await this.pool.query<{ email: string; locale: string; verified: boolean }>(
      `SELECT c.email, u.preferred_locale AS locale, c.email_verified_at IS NOT NULL AS verified
       FROM identity.password_credentials c JOIN identity.users u ON u.id = c.user_id
       WHERE c.user_id = $1 AND u.status = 'ACTIVE'`,
      [userId],
    );
    const row = contact.rows[0];
    if (row === undefined || row.verified) return null;
    const recent = await this.pool.query<{ count: string }>(
      `SELECT count(*) FROM identity.email_verification_tokens
       WHERE user_id = $1 AND created_at > clock_timestamp() - interval '1 hour'`,
      [userId],
    );
    if (Number(recent.rows[0]?.count ?? 0) >= 5) return null;
    const token = randomBytes(32).toString('base64url');
    await this.pool.query(
      `INSERT INTO identity.email_verification_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, clock_timestamp() + interval '24 hours')`,
      [userId, tokenHash(token)],
    );
    return { token, email: row.email, locale: asLocale(row.locale) };
  }

  public async userIdForEmail(email: string): Promise<string | null> {
    const result = await this.pool.query<{ user_id: string }>(
      'SELECT user_id FROM identity.password_credentials WHERE email = $1',
      [email],
    );
    return result.rows[0]?.user_id ?? null;
  }

  public async verifyEmail(token: string, context: AuditContext): Promise<'VERIFIED' | 'INVALID'> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return 'INVALID';
    return inTransaction(this.pool, async (client) => {
      const used = await client.query<{ user_id: string }>(
        `UPDATE identity.email_verification_tokens SET used_at = clock_timestamp()
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > clock_timestamp()
         RETURNING user_id`,
        [tokenHash(token)],
      );
      const userId = used.rows[0]?.user_id;
      if (userId === undefined) return 'INVALID';
      await client.query(
        `UPDATE identity.password_credentials
         SET email_verified_at = COALESCE(email_verified_at, clock_timestamp()),
             updated_at = clock_timestamp()
         WHERE user_id = $1`,
        [userId],
      );
      await audit(client, {
        actorType: 'anonymous',
        actorId: null,
        action: 'identity.email_verified',
        outcome: 'SUCCEEDED',
        entityType: 'user',
        entityId: userId,
        correlationId: context.correlationId,
      });
      return 'VERIFIED';
    });
  }

  /** Right of access (law 18-07): everything held about a customer, as JSON. */
  public async exportCustomerData(userId: string): Promise<Record<string, unknown> | null> {
    const profile = await this.pool.query<{
      email: string;
      email_verified_at: Date | null;
      phone_e164: string | null;
      locale: string;
      created_at: Date;
    }>(
      `SELECT c.email, c.email_verified_at, c.phone_e164, u.preferred_locale AS locale, u.created_at
       FROM identity.password_credentials c JOIN identity.users u ON u.id = c.user_id
       WHERE c.user_id = $1`,
      [userId],
    );
    const row = profile.rows[0];
    if (row === undefined) return null;
    const orders = await this.pool.query<{ id: string; created_at: Date; quote: unknown }>(
      `SELECT o.id, o.created_at, q.snapshot AS quote FROM commerce.orders o
       JOIN commerce.checkout_quotes q ON q.id = o.quote_id
       WHERE o.customer_id = $1 ORDER BY o.created_at`,
      [userId],
    );
    const cart = await this.pool.query<{ offer_id: string; quantity: number }>(
      'SELECT offer_id, quantity FROM commerce.cart_items WHERE customer_id = $1',
      [userId],
    );
    const reviews = await this.pool.query<{
      seller_order_id: string;
      product_id: string;
      rating: number;
      body: string | null;
      status: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT seller_order_id, product_id, rating, body, status, created_at, updated_at
       FROM commerce.product_reviews WHERE customer_id = $1 ORDER BY created_at`,
      [userId],
    );
    const sessions = await this.pool.query<{
      issued_at: Date;
      expires_at: Date;
      revoked_at: Date | null;
    }>(
      `SELECT issued_at, expires_at, revoked_at FROM identity.sessions
       WHERE user_id = $1 ORDER BY issued_at DESC LIMIT 100`,
      [userId],
    );
    return {
      exportedAt: new Date().toISOString(),
      account: {
        email: row.email,
        emailVerifiedAt: row.email_verified_at?.toISOString() ?? null,
        phone: row.phone_e164,
        preferredLocale: row.locale,
        createdAt: row.created_at.toISOString(),
      },
      orders: orders.rows.map((order) => ({
        id: order.id,
        createdAt: order.created_at.toISOString(),
        quote: order.quote,
      })),
      cart: cart.rows,
      reviews: reviews.rows.map((review) => ({
        sellerOrderId: review.seller_order_id,
        productId: review.product_id,
        rating: review.rating,
        body: review.body,
        status: review.status,
        createdAt: review.created_at.toISOString(),
        updatedAt: review.updated_at.toISOString(),
      })),
      recentSessions: sessions.rows.map((session) => ({
        issuedAt: session.issued_at.toISOString(),
        expiresAt: session.expires_at.toISOString(),
        revokedAt: session.revoked_at?.toISOString() ?? null,
      })),
    };
  }

  /**
   * Right to erasure: pseudonymizes the customer account. Order records are retained as
   * commercial records; the login identity, phone, cart and sessions are removed.
   */
  public async deleteCustomer(
    userId: string,
    currentPassword: string,
    context: AuditContext,
  ): Promise<'DELETED' | 'INVALID_PASSWORD' | 'OPEN_ORDERS'> {
    const credential = await this.pool.query<{ password_hash: string }>(
      'SELECT password_hash FROM identity.password_credentials WHERE user_id = $1',
      [userId],
    );
    const hash = credential.rows[0]?.password_hash;
    if (hash === undefined || !(await verifyPassword(currentPassword, hash))) {
      return 'INVALID_PASSWORD';
    }
    const unusable = await hashPassword(randomBytes(32).toString('base64url'));
    return inTransaction(this.pool, async (client) => {
      await client.query('SELECT id FROM identity.users WHERE id = $1 FOR UPDATE', [userId]);
      const open = await client.query<{ count: string }>(
        `SELECT count(*) FROM commerce.seller_orders so JOIN commerce.orders o ON o.id = so.order_id
         WHERE o.customer_id = $1
           AND so.status IN ('AWAITING_SELLER','ACCEPTED','PREPARING','SHIPPED','DELIVERY_REPORTED')`,
        [userId],
      );
      if (Number(open.rows[0]?.count ?? 0) > 0) return 'OPEN_ORDERS';
      await client.query(
        `UPDATE identity.password_credentials
         SET email = 'deleted-' || user_id::text || '@deleted.invalid', password_hash = $2,
             phone_e164 = NULL, phone_verified_at = NULL, email_verified_at = NULL,
             updated_at = clock_timestamp()
         WHERE user_id = $1`,
        [userId, unusable],
      );
      await client.query('DELETE FROM identity.totp_factors WHERE user_id = $1', [userId]);
      // Confirmation codes carry the phone numbers the customer entered.
      await client.query('DELETE FROM identity.phone_verification_codes WHERE user_id = $1', [
        userId,
      ]);
      await client.query('DELETE FROM commerce.cart_items WHERE customer_id = $1', [userId]);
      await client.query('DELETE FROM commerce.stock_alerts WHERE customer_id = $1', [userId]);
      // Reviews are the customer's own words: they leave with the account.
      await client.query('DELETE FROM commerce.product_reviews WHERE customer_id = $1', [userId]);
      await client.query(
        `UPDATE identity.users
         SET status = 'DISABLED', disabled_at = clock_timestamp(),
             pseudonymized_at = clock_timestamp(), session_epoch = session_epoch + 1,
             row_version = row_version + 1, updated_at = clock_timestamp()
         WHERE id = $1`,
        [userId],
      );
      await audit(client, {
        actorType: 'customer',
        actorId: userId,
        action: 'identity.account_deleted',
        outcome: 'SUCCEEDED',
        entityType: 'user',
        entityId: userId,
        correlationId: context.correlationId,
      });
      return 'DELETED';
    });
  }
}

class ResetThrottled extends Error {}

/** Routes each credential to the verifier that owns its token namespace. */
export function composeCredentialVerifiers(
  ...verifiers: readonly AccessCredentialVerifierPort[]
): AccessCredentialVerifierPort {
  return {
    async verify(rawCredential) {
      for (const verifier of verifiers) {
        const result = await verifier.verify(rawCredential);
        if (result.ok) return result;
      }
      return { ok: false, code: 'CREDENTIAL_REJECTED' };
    },
  };
}
