import { z } from 'zod';

import { CorrelationIdSchema, IsoTimestampSchema, ServiceNameSchema } from './primitives.js';

export const DependencyHealthSchema = z.enum(['up', 'down']);

export const HealthResponseSchema = z
  .object({
    status: z.enum(['ok', 'not_ready']),
    service: ServiceNameSchema,
    timestamp: IsoTimestampSchema,
    correlationId: CorrelationIdSchema,
    dependencies: z.record(z.string(), DependencyHealthSchema).optional(),
  })
  .strict();

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
