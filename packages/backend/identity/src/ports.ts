import type {
  CredentialVerificationResult,
  IdentityAuthorizationSnapshot,
  RefreshSessionRotationCommand,
  RefreshSessionRotationResult,
  RevokeOwnedSessionFamilyPersistenceResult,
  SessionFamilyRecord,
  SessionPersistenceContext,
  SessionRevocationCounts,
} from './domain.js';

export interface ClockPort {
  now(): Date;
}

export interface AccessCredentialVerifierPort {
  verify(rawCredential: string): Promise<CredentialVerificationResult>;
}

export interface IdentityAuthorizationRepositoryPort {
  loadAuthorizationSnapshot(
    userId: string,
    sessionId: string,
  ): Promise<IdentityAuthorizationSnapshot>;
}

export interface SessionSelfServicePort {
  listCurrentFamilies(context: SessionPersistenceContext): Promise<readonly SessionFamilyRecord[]>;

  /**
   * Implementations must perform the ownership check, revocation, and required
   * persistence side effects in one atomic operation. A family owned by another
   * user is indistinguishable from a missing family.
   */
  revokeOwnedFamilyAtomically(
    context: SessionPersistenceContext,
    targetFamilyId: string,
  ): Promise<RevokeOwnedSessionFamilyPersistenceResult>;

  /**
   * Implementations must exclude context.currentFamilyId and commit all
   * revocations and required persistence side effects atomically.
   */
  revokeOtherFamiliesAtomically(
    context: SessionPersistenceContext,
  ): Promise<SessionRevocationCounts>;
}

/**
 * Pre-access-token refresh persistence. Implementations must derive identity,
 * family, scope, assurance, device, and lifetime from authoritative locked
 * records; caller-supplied digests are never identity claims.
 */
export interface RefreshSessionRepositoryPort {
  /**
   * Uses one transaction and the global user -> family -> generation lock
   * order. Replay evidence and its audit/outbox records are idempotent.
   */
  rotateOrRecordReplayAtomically(
    command: RefreshSessionRotationCommand,
  ): Promise<RefreshSessionRotationResult>;
}
