import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { SYNTHETIC_CATALOG_IDS } from '@atlas/catalog';
import type {
  AccessCredentialVerifierPort,
  CredentialVerificationResult,
  VerifiedAccessClaims,
} from '@atlas/identity';
import type { Pool, PoolClient, QueryResultRow } from 'pg';

const namespace = 'atlas-local-catalog-v1.';
const marker = 'LOCAL/TEST synthetic MFA fixture; no real authentication or MFA';
const markerDigest = createHash('sha256').update(marker).digest();
const fixtureReason = 'LOCAL/TEST synthetic catalog identity fixture';
const fixtureId = (suffix: string): string => `70000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
const sellerId = SYNTHETIC_CATALOG_IDS.sellers[0];
const adminUserId = SYNTHETIC_CATALOG_IDS.adminUserId;
const sellerUserId = fixtureId('1');
const customerUserId = fixtureId('2');
const foundationRoleId = '00000000-0000-4000-8000-000000000201';
const foundationAssignmentId = '00000000-0000-4000-8000-000000000301';
const accounts = {
  seller: {
    userId: sellerUserId,
    roleId: fixtureId('11'),
    assignmentId: fixtureId('21'),
    code: 'LOCAL_TEST_CATALOG_SELLER',
    actorType: 'seller_user',
    scopeType: 'SELLER',
    scopeId: sellerId,
    permissions: [
      { id: fixtureId('31'), code: 'offer.create' },
      { id: fixtureId('32'), code: 'offer.read' },
      { id: fixtureId('38'), code: 'order.read' },
      { id: fixtureId('39'), code: 'order.reject' },
      { id: fixtureId('40'), code: 'order.process' },
      { id: fixtureId('42'), code: 'delivery.read' },
      { id: fixtureId('43'), code: 'delivery.manage' },
      { id: fixtureId('44'), code: 'offer.update' },
      { id: fixtureId('46'), code: 'support.manage' },
      { id: fixtureId('48'), code: 'product.submit' },
      { id: fixtureId('50'), code: 'review.reply' },
      { id: fixtureId('53'), code: 'seller.team.manage' },
    ],
  },
  admin: {
    userId: adminUserId,
    roleId: fixtureId('12'),
    assignmentId: fixtureId('22'),
    code: 'LOCAL_TEST_CATALOG_ADMIN',
    actorType: 'staff',
    scopeType: 'GLOBAL',
    scopeId: null,
    permissions: [
      { id: fixtureId('33'), code: 'offer.approve' },
      { id: fixtureId('47'), code: 'support.escalations' },
      { id: fixtureId('49'), code: 'product.review' },
      { id: fixtureId('51'), code: 'review.moderate' },
    ],
  },
  customer: {
    userId: customerUserId,
    roleId: fixtureId('13'),
    assignmentId: fixtureId('23'),
    code: 'LOCAL_TEST_CART_CUSTOMER',
    actorType: 'customer',
    scopeType: 'GLOBAL',
    scopeId: null,
    permissions: [
      { id: fixtureId('34'), code: 'cart.manage' },
      { id: fixtureId('35'), code: 'order.create' },
      { id: fixtureId('36'), code: 'order.read' },
      { id: fixtureId('37'), code: 'order.cancel' },
      { id: fixtureId('41'), code: 'order.confirm_delivery' },
      { id: fixtureId('45'), code: 'support.manage' },
      { id: fixtureId('52'), code: 'review.write' },
    ],
  },
} as const;

type Account = (typeof accounts)[keyof typeof accounts];

/** Reject an occupied fixture ID/code rather than modifying someone else's identity. */
async function ensureRecord(
  client: PoolClient,
  select: string,
  selector: readonly unknown[],
  expected: Record<string, unknown>,
  insert: string,
  values: readonly unknown[],
): Promise<void> {
  const result = await client.query(select, [...selector]);
  if (result.rows.length === 0) {
    await client.query(insert, [...values]);
    return;
  }
  const row = result.rows[0] as Record<string, unknown>;
  if (
    result.rows.length !== 1 ||
    Object.entries(expected).some(([key, value]) => row[key] !== value)
  ) {
    throw new Error('Synthetic identity fixture conflicts with existing data');
  }
}

async function ensureFixture(client: PoolClient, account: Account): Promise<void> {
  // This lock only serializes the explicitly selected LOCAL/TEST fixture harness.
  await client.query("SELECT pg_advisory_xact_lock(hashtext('atlas-local-catalog-identity-v1'))");
  const foundation = await client.query(
    `SELECT u.id FROM identity.users u
     JOIN identity.user_role_assignments a ON a.user_id = u.id
     JOIN identity.roles r ON r.id = a.role_id
     WHERE u.id = $1 AND u.status = 'ACTIVE' AND u.disabled_at IS NULL
       AND u.pseudonymized_at IS NULL
       AND a.id = $2 AND a.actor_type = 'staff' AND a.scope_type = 'GLOBAL'
       AND a.scope_id IS NULL AND a.revoked_at IS NULL AND a.valid_until IS NULL
       AND a.valid_from <= clock_timestamp()
       AND a.granted_reason = 'Deterministic synthetic foundation seed'
       AND r.id = $3 AND r.code = 'LOCAL_TEST_OPERATOR' AND r.is_system = false
       AND r.actor_type = 'staff' AND r.assignment_scope_type = 'GLOBAL'
       AND r.status = 'ACTIVE'
       AND r.description = 'Synthetic local/test role; never a production authorization definition'
       AND NOT EXISTS (SELECT 1 FROM identity.role_permissions WHERE role_id = r.id)
     FOR SHARE OF u, a, r`,
    [adminUserId, foundationAssignmentId, foundationRoleId],
  );
  const seller = await client.query(
    `SELECT id FROM sellers.sellers
     WHERE id = $1 AND slug = 'maison-plus' AND is_synthetic AND status = 'APPROVED'
     FOR SHARE`,
    [sellerId],
  );
  if (foundation.rows.length !== 1 || seller.rows.length !== 1) {
    throw new Error('Verified synthetic foundation and catalog seeds are required');
  }

  if (account.userId !== adminUserId) {
    const user = await client.query(
      `SELECT u.id FROM identity.users u WHERE u.id = $1
       AND u.status = 'ACTIVE' AND u.disabled_at IS NULL AND u.pseudonymized_at IS NULL
       AND EXISTS (SELECT 1 FROM identity.user_role_assignments a
         JOIN identity.roles r ON r.id = a.role_id
         WHERE a.user_id = u.id AND a.id = $2 AND a.role_id = $3
           AND a.granted_reason = $4 AND r.code = $5 AND r.description = $4)
       FOR SHARE OF u`,
      [account.userId, account.assignmentId, account.roleId, fixtureReason, account.code],
    );
    if (user.rows.length === 0) {
      // An occupied user ID without fixture provenance raises a unique violation;
      // no ON CONFLICT update can activate or grant access to an unrelated user.
      await client.query(
        "INSERT INTO identity.users (id, status, preferred_locale) VALUES ($1, 'ACTIVE', 'fr')",
        [account.userId],
      );
    }
  }

  await ensureRecord(
    client,
    `SELECT id, code, actor_type, assignment_scope_type, status, is_system, description
     FROM identity.roles WHERE id = $1 OR code = $2 FOR UPDATE`,
    [account.roleId, account.code],
    {
      id: account.roleId,
      code: account.code,
      actor_type: account.actorType,
      assignment_scope_type: account.scopeType,
      status: 'ACTIVE',
      is_system: false,
      description: fixtureReason,
    },
    `INSERT INTO identity.roles
       (id, code, actor_type, assignment_scope_type, status, is_system, description)
     VALUES ($1, $2, $3, $4, 'ACTIVE', false, $5)`,
    [account.roleId, account.code, account.actorType, account.scopeType, fixtureReason],
  );
  await ensureRecord(
    client,
    `SELECT id, user_id, role_id, actor_type, scope_type, scope_id,
       granted_reason, revoked_at, valid_until, (valid_from <= clock_timestamp()) AS active_time
     FROM identity.user_role_assignments
     WHERE id = $1 OR (user_id = $2 AND role_id = $3) FOR UPDATE`,
    [account.assignmentId, account.userId, account.roleId],
    {
      id: account.assignmentId,
      user_id: account.userId,
      role_id: account.roleId,
      actor_type: account.actorType,
      scope_type: account.scopeType,
      scope_id: account.scopeId,
      granted_reason: fixtureReason,
      revoked_at: null,
      valid_until: null,
      active_time: true,
    },
    `INSERT INTO identity.user_role_assignments
       (id, user_id, role_id, actor_type, scope_type, scope_id, granted_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      account.assignmentId,
      account.userId,
      account.roleId,
      account.actorType,
      account.scopeType,
      account.scopeId,
      fixtureReason,
    ],
  );
  const allowedAssignments = [account.assignmentId];
  if (account.userId === adminUserId) allowedAssignments.push(foundationAssignmentId);
  const unrelated = await client.query(
    `SELECT id FROM identity.user_role_assignments
     WHERE (user_id = $1 AND NOT (id = ANY($2::uuid[])))
       OR (role_id = $3 AND user_id <> $1)`,
    [account.userId, allowedAssignments, account.roleId],
  );
  if (unrelated.rows.length !== 0) throw new Error('Synthetic identity has unrelated assignments');

  for (const permission of account.permissions) {
    const found = await client.query<{ id: string }>(
      "SELECT id FROM identity.permissions WHERE code = $1 AND status = 'ACTIVE' FOR SHARE",
      [permission.code],
    );
    const permissionId = found.rows[0]?.id;
    if (found.rows.length !== 1 || permissionId === undefined) {
      throw new Error('Required catalog permission is unavailable');
    }
    await ensureRecord(
      client,
      `SELECT id, role_id, permission_id, revoked_at, valid_until,
         (granted_at <= clock_timestamp()) AS active_time
       FROM identity.role_permissions
       WHERE id = $1 OR (role_id = $2 AND permission_id = $3) FOR UPDATE`,
      [permission.id, account.roleId, permissionId],
      {
        id: permission.id,
        role_id: account.roleId,
        permission_id: permissionId,
        revoked_at: null,
        valid_until: null,
        active_time: true,
      },
      'INSERT INTO identity.role_permissions (id, role_id, permission_id) VALUES ($1, $2, $3)',
      [permission.id, account.roleId, permissionId],
    );
  }
  const extraGrants = await client.query(
    'SELECT id FROM identity.role_permissions WHERE role_id = $1 AND NOT (id = ANY($2::uuid[]))',
    [account.roleId, account.permissions.map((permission) => permission.id)],
  );
  if (extraGrants.rows.length !== 0) throw new Error('Synthetic identity has unrelated grants');
}

interface CredentialRow extends QueryResultRow {
  id: string;
  user_id: string;
  family_id: string;
  issued_session_epoch: string;
  actor_type: 'seller_user' | 'staff' | 'customer';
  scope_type: 'SELLER' | 'GLOBAL';
  scope_id: string | null;
  issued_at: Date;
  expires_at: Date;
}

/**
 * Explicit synthetic LOCAL/TEST harness. Its MFA timestamps only exercise the
 * authorization machinery; they do not represent a real MFA ceremony.
 * Production bootstrap must continue to use its rejecting credential adapter.
 */
export function createLocalCatalogIdentity(
  pool: Pool,
  environment: string,
): {
  credentialVerifier: AccessCredentialVerifierPort;
  createSession(
    account: 'seller' | 'admin' | 'customer',
  ): Promise<{ accessToken: string; expiresAt: string }>;
} {
  if (environment !== 'local' && environment !== 'test') {
    throw new Error('Synthetic catalog identity is restricted to LOCAL and TEST environments');
  }
  return {
    credentialVerifier: {
      async verify(rawCredential: string): Promise<CredentialVerificationResult> {
        const rejected = { ok: false, code: 'CREDENTIAL_REJECTED' } as const;
        if (!rawCredential.startsWith(namespace)) return rejected;
        const secret = rawCredential.slice(namespace.length);
        if (
          !/^[A-Za-z0-9_-]{43}$/.test(secret) ||
          Buffer.from(secret, 'base64url').toString('base64url') !== secret
        ) {
          return rejected;
        }
        try {
          const result = await pool.query<CredentialRow>(
            `SELECT s.id, s.user_id, s.family_id, s.issued_session_epoch,
               s.actor_type, s.scope_type, s.scope_id, s.issued_at, s.expires_at
             FROM identity.sessions s
             JOIN identity.users u ON u.id = s.user_id
             JOIN identity.session_families f ON f.id = s.family_id AND f.user_id = s.user_id
             WHERE s.token_hash = $1 AND s.device_hash = $2 AND s.device_label = $3
               AND u.status = 'ACTIVE' AND u.session_epoch = s.issued_session_epoch
               AND s.revoked_at IS NULL AND s.rotated_at IS NULL AND s.reuse_detected_at IS NULL
               AND f.revoked_at IS NULL AND f.reuse_detected_at IS NULL
               AND s.assurance_level = 'MFA' AND s.mfa_completed_at IS NOT NULL
               AND s.issued_at <= clock_timestamp() AND s.expires_at > clock_timestamp()
               AND f.expires_at > clock_timestamp()
               AND ((s.user_id = $4 AND s.actor_type = 'seller_user'
                     AND s.scope_type = 'SELLER' AND s.scope_id = $5)
                 OR (s.user_id = $6 AND s.actor_type = 'staff'
                     AND s.scope_type = 'GLOBAL' AND s.scope_id IS NULL)
                 OR (s.user_id = $7 AND s.actor_type = 'customer'
                     AND s.scope_type = 'GLOBAL' AND s.scope_id IS NULL))`,
            [
              createHash('sha256').update(rawCredential).digest(),
              markerDigest,
              marker,
              sellerUserId,
              sellerId,
              adminUserId,
              customerUserId,
            ],
          );
          const row = result.rows[0];
          if (result.rows.length !== 1 || row === undefined) return rejected;
          const epoch = Number(row.issued_session_epoch);
          if (!Number.isSafeInteger(epoch) || epoch < 1) return rejected;
          // Assert the fixture binding again before handing database-derived claims
          // to the authoritative principal resolver (which checks live RBAC).
          const isSeller =
            row.user_id === sellerUserId &&
            row.actor_type === 'seller_user' &&
            row.scope_type === 'SELLER' &&
            row.scope_id === sellerId;
          const isAdmin =
            row.user_id === adminUserId &&
            row.actor_type === 'staff' &&
            row.scope_type === 'GLOBAL' &&
            row.scope_id === null;
          const isCustomer =
            row.user_id === customerUserId &&
            row.actor_type === 'customer' &&
            row.scope_type === 'GLOBAL' &&
            row.scope_id === null;
          if (!isSeller && !isAdmin && !isCustomer) return rejected;
          const claims: VerifiedAccessClaims = {
            tokenId: `local-synthetic:${row.id}`,
            userId: row.user_id,
            sessionId: row.id,
            sessionFamilyId: row.family_id,
            sessionEpoch: epoch,
            actorType: row.actor_type,
            scope: isSeller ? { type: 'SELLER', id: sellerId } : { type: 'GLOBAL' },
            assuranceLevel: 'MFA',
            issuedAt: row.issued_at,
            expiresAt: row.expires_at,
          };
          return { ok: true, claims };
        } catch {
          // Never expose query parameters, credential digests, or provider errors.
          return rejected;
        }
      },
    },
    async createSession(accountName) {
      if (accountName !== 'seller' && accountName !== 'admin' && accountName !== 'customer') {
        throw new Error('Unknown synthetic catalog account');
      }
      const client = await pool.connect();
      let broken = false;
      try {
        await client.query('BEGIN');
        const account = accounts[accountName];
        await ensureFixture(client, account);
        const user = await client.query<{ session_epoch: string }>(
          "SELECT session_epoch FROM identity.users WHERE id = $1 AND status = 'ACTIVE' FOR UPDATE",
          [account.userId],
        );
        const epoch = user.rows[0]?.session_epoch;
        if (epoch === undefined) throw new Error('Synthetic user is unavailable');
        const clock = await client.query<{ issued_at: Date; expires_at: Date }>(
          `SELECT now AS issued_at, now + interval '30 minutes' AS expires_at
           FROM (SELECT date_trunc('milliseconds', clock_timestamp()) AS now) t`,
        );
        const time = clock.rows[0];
        if (time === undefined) throw new Error('Synthetic session clock is unavailable');
        const accessToken = `${namespace}${randomBytes(32).toString('base64url')}`;
        const tokenHash = createHash('sha256').update(accessToken).digest();
        const familyId = randomUUID();
        const sessionId = randomUUID();
        await client.query(
          `INSERT INTO identity.session_families
             (id, user_id, issued_session_epoch, actor_type, scope_type, scope_id, created_at, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            familyId,
            account.userId,
            epoch,
            account.actorType,
            account.scopeType,
            account.scopeId,
            time.issued_at,
            time.expires_at,
          ],
        );
        await client.query(
          `INSERT INTO identity.sessions
             (id, user_id, family_id, token_hash, device_label, device_hash, assurance_level,
              issued_at, expires_at, mfa_completed_at, issued_session_epoch, actor_type, scope_type, scope_id)
           VALUES ($1, $2, $3, $4, $5, $6, 'MFA', $7, $8, $7, $9, $10, $11, $12)`,
          [
            sessionId,
            account.userId,
            familyId,
            tokenHash,
            marker,
            markerDigest,
            time.issued_at,
            time.expires_at,
            epoch,
            account.actorType,
            account.scopeType,
            account.scopeId,
          ],
        );
        await client.query('COMMIT');
        return { accessToken, expiresAt: time.expires_at.toISOString() };
      } catch {
        try {
          await client.query('ROLLBACK');
        } catch {
          broken = true;
        }
        throw new Error(
          'Synthetic catalog session could not be created; verify local fixture data',
        );
      } finally {
        client.release(broken);
      }
    },
  };
}
