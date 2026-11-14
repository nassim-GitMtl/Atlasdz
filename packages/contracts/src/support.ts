import { z } from 'zod';
import { IsoTimestampSchema, UuidSchema } from './primitives.js';

export const SupportCategorySchema = z.enum(['RETURN_REQUEST', 'DELIVERY_ISSUE', 'OTHER']);
export const SupportStatusSchema = z.enum(['OPEN', 'WAITING_CUSTOMER', 'ESCALATED', 'RESOLVED']);
export const SupportCursorSchema = z
  .object({ createdAt: IsoTimestampSchema, id: UuidSchema })
  .strict();
export const SupportListQuerySchema = z
  .object({
    cursor: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .max(512)
      .optional(),
  })
  .strict();
export const SupportPageQuerySchema = z
  .object({ beforeVersion: z.coerce.number().int().min(1).max(2_147_483_647).optional() })
  .strict();
export type SupportCursor = z.infer<typeof SupportCursorSchema>;
export const SupportBodySchema = z
  .string()
  .trim()
  .min(5)
  .max(2000)
  .refine(
    (value) =>
      [...value].length >= 5 &&
      !/[\p{Cf}\p{Zl}\p{Zp}]/u.test(value) &&
      [...value].every(
        (character) => character === '\n' || character === '\t' || !/\p{Cc}/u.test(character),
      ),
    'Unsupported text or control characters',
  );
export const CreateSupportCaseInputSchema = z
  .object({ sellerOrderId: UuidSchema, category: SupportCategorySchema, body: SupportBodySchema })
  .strict();
export const SupportActionInputSchema = z
  .object({
    requestId: UuidSchema,
    expectedVersion: z.number().int().min(1).max(2_147_483_646),
    action: z.enum(['REPLY', 'ESCALATE', 'CONFIRM_RESOLUTION', 'STAFF_RESOLVE']),
    body: SupportBodySchema,
  })
  .strict();
export const SupportCaseSchema = z
  .object({
    id: UuidSchema,
    sellerOrderId: UuidSchema,
    orderId: UuidSchema,
    sellerName: z.string().max(160),
    category: SupportCategorySchema,
    status: SupportStatusSchema,
    version: z.number().int().positive(),
    createdAt: IsoTimestampSchema,
    updatedAt: IsoTimestampSchema,
  })
  .strict();
export const SupportMessageSchema = z
  .object({
    version: z.number().int().positive(),
    attribution: z.enum(['CUSTOMER', 'SELLER', 'STAFF']),
    action: z.enum(['OPEN', 'REPLY', 'ESCALATE', 'CONFIRM_RESOLUTION', 'STAFF_RESOLVE']),
    body: SupportBodySchema,
    createdAt: IsoTimestampSchema,
  })
  .strict();
export const SupportDetailSchema = z
  .object({
    case: SupportCaseSchema,
    messages: SupportMessageSchema.array().max(50),
    nextBeforeVersion: z.number().int().positive().nullable(),
  })
  .strict();
export const SupportListSchema = z
  .object({ items: SupportCaseSchema.array().max(50), nextCursor: z.string().max(512).nullable() })
  .strict();
export const SupportChangedV1PayloadSchema = z
  .object({
    caseId: UuidSchema,
    sellerOrderId: UuidSchema,
    status: SupportStatusSchema,
  })
  .strict();
export type SupportCase = z.infer<typeof SupportCaseSchema>;
export type SupportDetail = z.infer<typeof SupportDetailSchema>;
export type CreateSupportCaseInput = z.infer<typeof CreateSupportCaseInputSchema>;
export type SupportActionInput = z.infer<typeof SupportActionInputSchema>;
