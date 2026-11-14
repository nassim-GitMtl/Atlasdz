import { z } from 'zod';

import { AssuranceLevelSchema, IsoTimestampSchema, UuidSchema } from './primitives.js';

export const SessionSummarySchema = z
  .object({
    id: UuidSchema,
    deviceLabel: z.string().min(1).max(120).nullable(),
    assuranceLevel: AssuranceLevelSchema,
    issuedAt: IsoTimestampSchema,
    lastSeenAt: IsoTimestampSchema.nullable(),
    expiresAt: IsoTimestampSchema,
    current: z.boolean(),
  })
  .strict();

export const SessionListSchema = z
  .object({
    sessions: z.array(SessionSummarySchema).max(100),
  })
  .strict();

export const RevocationResultSchema = z
  .object({
    revokedCount: z.number().int().min(0),
  })
  .strict();

export const SessionRevokedV1PayloadSchema = z
  .object({
    userId: UuidSchema,
    sessionId: UuidSchema,
    revocationReason: z.string().min(1).max(120),
  })
  .strict();

export const SuspiciousLoginReasonCodeSchema = z.enum(['REFRESH_TOKEN_REUSE_DETECTED']);

export const SuspiciousLoginV1PayloadSchema = z
  .object({
    userId: UuidSchema,
    reasonCodes: z.array(SuspiciousLoginReasonCodeSchema).min(1).max(16),
    sessionId: UuidSchema,
    occurredAt: IsoTimestampSchema,
  })
  .strict();

export type SessionSummary = z.infer<typeof SessionSummarySchema>;
export type SessionList = z.infer<typeof SessionListSchema>;
export type RevocationResult = z.infer<typeof RevocationResultSchema>;
export type SessionRevokedV1Payload = z.infer<typeof SessionRevokedV1PayloadSchema>;
export type SuspiciousLoginReasonCode = z.infer<typeof SuspiciousLoginReasonCodeSchema>;
export type SuspiciousLoginV1Payload = z.infer<typeof SuspiciousLoginV1PayloadSchema>;
