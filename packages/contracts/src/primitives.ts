import { z } from 'zod';

export const UuidSchema = z.uuid();

export const CorrelationIdSchema = z.union([
  z.uuid(),
  z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'Invalid ULID correlation identifier'),
]);

export const IsoTimestampSchema = z.iso.datetime({ offset: true });

export const ServiceNameSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9-]*$/);

export const ActorTypeSchema = z.enum([
  'anonymous',
  'customer',
  'seller_user',
  'staff',
  'courier',
  'service',
]);

export const ScopeTypeSchema = z.enum(['GLOBAL', 'SELLER', 'WAREHOUSE', 'COURIER']);

export const AssuranceLevelSchema = z.enum(['PRIMARY', 'MFA']);

export const AuthorizationScopeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('GLOBAL') }).strict(),
  z.object({ type: z.literal('SELLER'), id: UuidSchema }).strict(),
  z.object({ type: z.literal('WAREHOUSE'), id: UuidSchema }).strict(),
  z.object({ type: z.literal('COURIER'), id: UuidSchema }).strict(),
]);

export const ActorContextSchema = z
  .object({
    actorType: ActorTypeSchema,
    actorId: UuidSchema.nullable(),
    sessionId: UuidSchema.nullable(),
    sessionFamilyId: UuidSchema.nullable(),
    effectiveRoles: z.array(z.string().regex(/^[A-Z][A-Z0-9_]{2,79}$/)).max(64),
    permissions: z
      .array(
        z
          .string()
          .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/)
          .max(120),
      )
      .max(256),
    assuranceLevel: AssuranceLevelSchema.nullable(),
    mfaCompletedAt: IsoTimestampSchema.nullable(),
    scope: AuthorizationScopeSchema.nullable(),
  })
  .strict()
  .superRefine((actor, context) => {
    const isHuman = ['customer', 'seller_user', 'staff', 'courier'].includes(actor.actorType);

    if ((actor.sessionId === null) !== (actor.sessionFamilyId === null)) {
      context.addIssue({
        code: 'custom',
        message: 'Session ID and family ID must be present together',
      });
    }
    if (actor.assuranceLevel === 'MFA' && actor.mfaCompletedAt === null) {
      context.addIssue({ code: 'custom', message: 'MFA assurance requires its completion time' });
    }
    if (actor.assuranceLevel !== 'MFA' && actor.mfaCompletedAt !== null) {
      context.addIssue({ code: 'custom', message: 'MFA completion requires MFA assurance' });
    }

    if (isHuman) {
      if (
        actor.actorId === null ||
        actor.sessionId === null ||
        actor.sessionFamilyId === null ||
        actor.assuranceLevel === null ||
        actor.scope === null ||
        actor.effectiveRoles.length === 0
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Human actors require identity, session, assurance, scope, and role context',
        });
      }
    }

    if (actor.actorType === 'anonymous') {
      if (
        actor.actorId !== null ||
        actor.sessionId !== null ||
        actor.sessionFamilyId !== null ||
        actor.effectiveRoles.length !== 0 ||
        actor.permissions.length !== 0 ||
        actor.assuranceLevel !== null ||
        actor.mfaCompletedAt !== null ||
        actor.scope !== null
      ) {
        context.addIssue({ code: 'custom', message: 'Anonymous actors cannot carry grants' });
      }
      return;
    }

    if (actor.actorType === 'service') {
      if (
        actor.actorId === null ||
        actor.sessionId !== null ||
        actor.sessionFamilyId !== null ||
        actor.assuranceLevel !== null ||
        actor.mfaCompletedAt !== null
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Service actors require attribution and cannot carry a human session',
        });
      }
      return;
    }

    if (actor.scope !== null) {
      const scopeMatchesActor =
        (actor.actorType === 'customer' && actor.scope.type === 'GLOBAL') ||
        (actor.actorType === 'seller_user' && actor.scope.type === 'SELLER') ||
        (actor.actorType === 'courier' && actor.scope.type === 'COURIER') ||
        (actor.actorType === 'staff' &&
          (actor.scope.type === 'GLOBAL' || actor.scope.type === 'WAREHOUSE'));
      if (!scopeMatchesActor) {
        context.addIssue({
          code: 'custom',
          message: 'Actor type and authorization scope conflict',
        });
      }
    }

    if (
      (actor.actorType === 'seller_user' || actor.actorType === 'staff') &&
      actor.assuranceLevel !== 'MFA'
    ) {
      context.addIssue({ code: 'custom', message: 'Privileged actors require MFA assurance' });
    }
  });

export type ActorContext = z.infer<typeof ActorContextSchema>;
