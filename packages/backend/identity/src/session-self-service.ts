import type {
  AuthorizationScope,
  RevokeOtherSessionFamiliesResult,
  RevokeSessionFamilyResult,
  SessionFamilyList,
  SessionFamilyRecord,
  SessionFamilySummary,
  SessionPersistenceContext,
  SessionRevocationCounts,
  SessionSelfServiceContext,
} from './domain.js';
import type { SessionSelfServicePort } from './ports.js';

const immutableScope = (scope: AuthorizationScope): AuthorizationScope =>
  scope.type === 'GLOBAL'
    ? Object.freeze({ type: 'GLOBAL' as const })
    : Object.freeze({ type: scope.type, id: scope.id });

const immutableCounts = (counts: SessionRevocationCounts): SessionRevocationCounts =>
  Object.freeze({
    revokedFamilyCount: counts.revokedFamilyCount,
    revokedSessionCount: counts.revokedSessionCount,
  });

const immutablePersistenceContext = (
  context: SessionSelfServiceContext,
): SessionPersistenceContext => {
  const { principal } = context;

  return Object.freeze({
    ownerUserId: principal.userId,
    actor: Object.freeze({
      type: principal.actorType,
      id: principal.userId,
      sessionId: principal.sessionId,
      effectiveRoleCodes: Object.freeze([...principal.roleCodes]),
      scope: immutableScope(principal.scope),
      assuranceLevel: principal.assuranceLevel,
    }),
    currentFamilyId: principal.sessionFamilyId,
    correlationId: context.correlation.correlationId,
  });
};

const immutableFamilySummary = (
  family: SessionFamilyRecord,
  currentFamilyId: string,
): SessionFamilySummary =>
  Object.freeze({
    familyId: family.familyId,
    deviceLabel: family.deviceLabel,
    actorType: family.actorType,
    scope: immutableScope(family.scope),
    assuranceLevel: family.assuranceLevel,
    createdAt: new Date(family.createdAt.getTime()),
    lastSeenAt: family.lastSeenAt === null ? null : new Date(family.lastSeenAt.getTime()),
    expiresAt: new Date(family.expiresAt.getTime()),
    isCurrent: family.familyId === currentFamilyId,
  });

export class SessionSelfService {
  public constructor(private readonly sessions: SessionSelfServicePort) {}

  public async listCurrentFamilies(context: SessionSelfServiceContext): Promise<SessionFamilyList> {
    const persistenceContext = immutablePersistenceContext(context);
    const families = await this.sessions.listCurrentFamilies(persistenceContext);

    return Object.freeze({
      families: Object.freeze(
        families.map((family) =>
          immutableFamilySummary(family, persistenceContext.currentFamilyId),
        ),
      ),
    });
  }

  public async revokeFamily(
    context: SessionSelfServiceContext,
    targetFamilyId: string,
  ): Promise<RevokeSessionFamilyResult> {
    const result = await this.sessions.revokeOwnedFamilyAtomically(
      immutablePersistenceContext(context),
      targetFamilyId,
    );
    if (!result.found) {
      return Object.freeze({ ok: false, code: 'SESSION_NOT_FOUND' as const });
    }

    return Object.freeze({ ok: true, counts: immutableCounts(result.counts) });
  }

  public async revokeOtherFamilies(
    context: SessionSelfServiceContext,
  ): Promise<RevokeOtherSessionFamiliesResult> {
    const counts = await this.sessions.revokeOtherFamiliesAtomically(
      immutablePersistenceContext(context),
    );

    return Object.freeze({ ok: true, counts: immutableCounts(counts) });
  }
}
