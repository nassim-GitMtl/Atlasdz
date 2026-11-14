import type {
  ActorType,
  AssuranceLevel,
  AuthorizationScope,
  IdentityAuthorizationSnapshot,
  PermissionRecord,
  RolePermissionGrantRecord,
  RoleRecord,
  RotatedSessionBinding,
  ScopeType,
  SessionFamilyIdentityRecord,
  SessionFamilyRecord,
  SessionIdentityRecord,
  UserIdentityRecord,
  UserRoleAssignmentRecord,
  UserStatus,
} from '@atlas/identity';

import { IdentityDataIntegrityError } from './data-integrity-error.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ACTOR_TYPES = new Set<ActorType>(['customer', 'seller_user', 'staff', 'courier']);
const ASSURANCE_LEVELS = new Set<AssuranceLevel>(['PRIMARY', 'MFA']);
const SCOPE_TYPES = new Set<ScopeType>(['GLOBAL', 'SELLER', 'WAREHOUSE', 'COURIER']);
const USER_STATUSES = new Set<UserStatus>(['PENDING', 'ACTIVE', 'LOCKED', 'DISABLED']);
const RECORD_STATUSES = new Set(['ACTIVE', 'DEPRECATED'] as const);

type UnknownRecord = Readonly<Record<string, unknown>>;

const corrupt = (field: string): never => {
  throw new IdentityDataIntegrityError(`Invalid identity persistence field: ${field}`);
};

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_PATTERN.test(value);

export const requiredUuid = (record: UnknownRecord, field: string): string => {
  const value = record[field];
  return isUuid(value) ? value : corrupt(field);
};

const requiredString = (record: UnknownRecord, field: string): string => {
  const value = record[field];
  return typeof value === 'string' && value.length > 0 ? value : corrupt(field);
};

const nullableString = (record: UnknownRecord, field: string): string | null => {
  const value = record[field];
  return value === null
    ? null
    : typeof value === 'string' && value.length > 0
      ? value
      : corrupt(field);
};

const requiredInteger = (record: UnknownRecord, field: string): number => {
  const raw = record[field];
  const value = typeof raw === 'string' && raw.length > 0 ? Number(raw) : raw;
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
    ? value
    : corrupt(field);
};

const requiredDate = (record: UnknownRecord, field: string): Date => {
  const raw = record[field];
  const value =
    raw instanceof Date ? new Date(raw.getTime()) : new Date(requiredString(record, field));
  return Number.isFinite(value.getTime()) ? value : corrupt(field);
};

const nullableDate = (record: UnknownRecord, field: string): Date | null => {
  if (record[field] === null) {
    return null;
  }
  return requiredDate(record, field);
};

export const requiredRecord = (value: unknown, field: string): UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : corrupt(field);

const requiredRecordArray = (value: unknown, field: string): readonly UnknownRecord[] => {
  if (!Array.isArray(value)) {
    return corrupt(field);
  }
  return value.map((entry, index) => requiredRecord(entry, `${field}[${String(index)}]`));
};

const enumValue = <T extends string>(
  record: UnknownRecord,
  field: string,
  allowed: ReadonlySet<T>,
): T => {
  const value = record[field];
  return typeof value === 'string' && allowed.has(value as T) ? (value as T) : corrupt(field);
};

const parseScope = (record: UnknownRecord): AuthorizationScope => {
  const type = enumValue(record, 'scopeType', SCOPE_TYPES);
  const id = record['scopeId'];
  if (type === 'GLOBAL') {
    if (id !== null) {
      return corrupt('scopeId');
    }
    return Object.freeze({ type: 'GLOBAL' });
  }
  if (!isUuid(id)) {
    return corrupt('scopeId');
  }
  return Object.freeze({ type, id });
};

const parseUser = (value: unknown): UserIdentityRecord | null => {
  if (value === null) {
    return null;
  }
  const record = requiredRecord(value, 'user');
  return Object.freeze({
    id: requiredUuid(record, 'id'),
    status: enumValue(record, 'status', USER_STATUSES),
    sessionEpoch: requiredInteger(record, 'sessionEpoch'),
  });
};

const parseSession = (value: unknown): SessionIdentityRecord | null => {
  if (value === null) {
    return null;
  }
  const record = requiredRecord(value, 'session');
  return Object.freeze({
    id: requiredUuid(record, 'id'),
    userId: requiredUuid(record, 'userId'),
    familyId: requiredUuid(record, 'familyId'),
    sessionEpoch: requiredInteger(record, 'sessionEpoch'),
    actorType: enumValue(record, 'actorType', ACTOR_TYPES),
    scope: parseScope(record),
    assuranceLevel: enumValue(record, 'assuranceLevel', ASSURANCE_LEVELS),
    issuedAt: requiredDate(record, 'issuedAt'),
    expiresAt: requiredDate(record, 'expiresAt'),
    mfaCompletedAt: nullableDate(record, 'mfaCompletedAt'),
    rotatedAt: nullableDate(record, 'rotatedAt'),
    revokedAt: nullableDate(record, 'revokedAt'),
    reuseDetectedAt: nullableDate(record, 'reuseDetectedAt'),
  });
};

const parseSessionFamily = (value: unknown): SessionFamilyIdentityRecord | null => {
  if (value === null) {
    return null;
  }
  const record = requiredRecord(value, 'sessionFamily');
  return Object.freeze({
    id: requiredUuid(record, 'id'),
    userId: requiredUuid(record, 'userId'),
    sessionEpoch: requiredInteger(record, 'sessionEpoch'),
    actorType: enumValue(record, 'actorType', ACTOR_TYPES),
    scope: parseScope(record),
    createdAt: requiredDate(record, 'createdAt'),
    expiresAt: requiredDate(record, 'expiresAt'),
    revokedAt: nullableDate(record, 'revokedAt'),
    reuseDetectedAt: nullableDate(record, 'reuseDetectedAt'),
  });
};

const parseAssignment = (record: UnknownRecord): UserRoleAssignmentRecord =>
  Object.freeze({
    id: requiredUuid(record, 'id'),
    userId: requiredUuid(record, 'userId'),
    roleId: requiredUuid(record, 'roleId'),
    actorType: enumValue(record, 'actorType', ACTOR_TYPES),
    scope: parseScope(record),
    validFrom: requiredDate(record, 'validFrom'),
    validUntil: nullableDate(record, 'validUntil'),
    revokedAt: nullableDate(record, 'revokedAt'),
  });

const parseRole = (record: UnknownRecord): RoleRecord =>
  Object.freeze({
    id: requiredUuid(record, 'id'),
    code: requiredString(record, 'code'),
    actorType: enumValue(record, 'actorType', ACTOR_TYPES),
    assignmentScopeType: enumValue(record, 'assignmentScopeType', SCOPE_TYPES),
    status: enumValue(record, 'status', RECORD_STATUSES),
  });

const parseRolePermission = (record: UnknownRecord): RolePermissionGrantRecord =>
  Object.freeze({
    id: requiredUuid(record, 'id'),
    roleId: requiredUuid(record, 'roleId'),
    permissionId: requiredUuid(record, 'permissionId'),
    grantedAt: requiredDate(record, 'grantedAt'),
    validUntil: nullableDate(record, 'validUntil'),
    revokedAt: nullableDate(record, 'revokedAt'),
  });

const parsePermission = (record: UnknownRecord): PermissionRecord =>
  Object.freeze({
    id: requiredUuid(record, 'id'),
    code: requiredString(record, 'code'),
    status: enumValue(record, 'status', RECORD_STATUSES),
  });

export const parseAuthorizationSnapshotRow = (value: unknown): IdentityAuthorizationSnapshot => {
  const record = requiredRecord(value, 'authorizationSnapshot');
  return Object.freeze({
    user: parseUser(record['user']),
    session: parseSession(record['session']),
    sessionFamily: parseSessionFamily(record['sessionFamily']),
    assignments: Object.freeze(
      requiredRecordArray(record['assignments'], 'assignments').map(parseAssignment),
    ),
    roles: Object.freeze(requiredRecordArray(record['roles'], 'roles').map(parseRole)),
    rolePermissionGrants: Object.freeze(
      requiredRecordArray(record['rolePermissionGrants'], 'rolePermissionGrants').map(
        parseRolePermission,
      ),
    ),
    permissions: Object.freeze(
      requiredRecordArray(record['permissions'], 'permissions').map(parsePermission),
    ),
  });
};

export const emptyAuthorizationSnapshot = (): IdentityAuthorizationSnapshot =>
  Object.freeze({
    user: null,
    session: null,
    sessionFamily: null,
    assignments: Object.freeze([]),
    roles: Object.freeze([]),
    rolePermissionGrants: Object.freeze([]),
    permissions: Object.freeze([]),
  });

export const parseSessionFamilyRow = (value: unknown): SessionFamilyRecord => {
  const record = requiredRecord(value, 'sessionFamily');
  return Object.freeze({
    familyId: requiredUuid(record, 'familyId'),
    deviceLabel: nullableString(record, 'deviceLabel'),
    actorType: enumValue(record, 'actorType', ACTOR_TYPES),
    scope: parseScope(record),
    assuranceLevel: enumValue(record, 'assuranceLevel', ASSURANCE_LEVELS),
    createdAt: requiredDate(record, 'createdAt'),
    lastSeenAt: nullableDate(record, 'lastSeenAt'),
    expiresAt: requiredDate(record, 'expiresAt'),
  });
};

export const parseRotatedSessionBindingRow = (value: unknown): RotatedSessionBinding => {
  const record = requiredRecord(value, 'rotatedSessionBinding');
  return Object.freeze({
    sessionId: requiredUuid(record, 'sessionId'),
    familyId: requiredUuid(record, 'familyId'),
    userId: requiredUuid(record, 'userId'),
    sessionEpoch: requiredInteger(record, 'sessionEpoch'),
    actorType: enumValue(record, 'actorType', ACTOR_TYPES),
    scope: parseScope(record),
    assuranceLevel: enumValue(record, 'assuranceLevel', ASSURANCE_LEVELS),
    mfaCompletedAt: nullableDate(record, 'mfaCompletedAt'),
    issuedAt: requiredDate(record, 'issuedAt'),
    expiresAt: requiredDate(record, 'expiresAt'),
  });
};
