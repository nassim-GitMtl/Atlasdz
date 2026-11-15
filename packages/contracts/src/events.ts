import { z } from 'zod';

import {
  OfferActivatedV1PayloadSchema,
  OfferRejectedV1PayloadSchema,
  OfferCreatedV1PayloadSchema,
  OfferUpdatedV1PayloadSchema,
  ProductSubmissionChangedV1PayloadSchema,
} from './catalog.js';

import {
  ActorTypeSchema,
  CorrelationIdSchema,
  IsoTimestampSchema,
  ServiceNameSchema,
  UuidSchema,
} from './primitives.js';
import { SessionRevokedV1PayloadSchema, SuspiciousLoginV1PayloadSchema } from './identity.js';
import { OrderRoutingV1PayloadSchema } from './orders.js';
import { DeliveryRateChangedV1PayloadSchema } from './delivery.js';
import { SupportChangedV1PayloadSchema } from './support.js';

export const EventActorSchema = z
  .object({
    type: ActorTypeSchema,
    id: UuidSchema.nullable(),
  })
  .strict()
  .superRefine((actor, context) => {
    if ((actor.type === 'anonymous') !== (actor.id === null)) {
      context.addIssue({
        code: 'custom',
        message: 'Anonymous events cannot have an actor ID and attributed events require one',
      });
    }
  });

const EventEnvelopeBaseSchema = z
  .object({
    eventId: UuidSchema,
    eventType: z
      .string()
      .min(3)
      .max(160)
      .regex(/^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$/)
      .refine((value) => !/\.v[0-9]+$/.test(value), 'Version belongs in eventVersion'),
    eventVersion: z.number().int().min(1),
    occurredAt: IsoTimestampSchema,
    producer: ServiceNameSchema,
    aggregateType: z.string().min(1).max(100),
    aggregateId: UuidSchema,
    aggregateVersion: z.number().int().min(1),
    correlationId: CorrelationIdSchema,
    causationId: UuidSchema.nullable(),
    actor: EventActorSchema,
    data: z.record(z.string(), z.unknown()),
  })
  .strict();

const registeredPayloads: ReadonlyMap<string, z.ZodType> = new Map<string, z.ZodType>([
  ['identity.session_revoked:1', SessionRevokedV1PayloadSchema],
  ['identity.login_suspicious:1', SuspiciousLoginV1PayloadSchema],
  ['offer.created:1', OfferCreatedV1PayloadSchema],
  ['offer.activated:1', OfferActivatedV1PayloadSchema],
  ['offer.updated:1', OfferUpdatedV1PayloadSchema],
  ['offer.rejected:1', OfferRejectedV1PayloadSchema],
  ['product_submission.changed:1', ProductSubmissionChangedV1PayloadSchema],
  ['seller_order.routed:1', OrderRoutingV1PayloadSchema],
  ['seller_order.closed:1', OrderRoutingV1PayloadSchema],
  ['seller_order.progressed:1', OrderRoutingV1PayloadSchema],
  ['seller_delivery.changed:1', DeliveryRateChangedV1PayloadSchema],
  ['support.case_changed:1', SupportChangedV1PayloadSchema],
]);

export const EventEnvelopeSchema = EventEnvelopeBaseSchema.superRefine((event, context) => {
  const payloadSchema = registeredPayloads.get(`${event.eventType}:${event.eventVersion}`);
  if (payloadSchema === undefined) {
    context.addIssue({
      code: 'custom',
      path: ['eventVersion'],
      message: 'Event type and version are not registered',
    });
    return;
  }

  const payload = payloadSchema.safeParse(event.data);
  if (!payload.success) {
    for (const issue of payload.error.issues) {
      context.addIssue({
        code: 'custom',
        path: ['data', ...issue.path],
        message: issue.message,
      });
    }
  }
});

export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;
