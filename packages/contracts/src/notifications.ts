import { z } from 'zod';
import { IsoTimestampSchema, UuidSchema } from './primitives.js';
import { SellerOrderStatusSchema } from './orders.js';

export const NotificationReadInputSchema = z
  .object({
    sellerOrderId: UuidSchema,
    version: z.number().int().min(1).max(2147483647),
  })
  .strict();
export const NotificationCursorSchema = NotificationReadInputSchema.extend({
  occurredAt: IsoTimestampSchema,
});
export const NotificationQuerySchema = z
  .object({
    cursor: z
      .string()
      .min(1)
      .max(512)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
  })
  .strict();
export const OrderNotificationSchema = NotificationCursorSchema.extend({
  orderId: UuidSchema,
  sellerName: z.string().min(1).max(200),
  status: SellerOrderStatusSchema,
  attribution: z.enum(['SELLER', 'CUSTOMER', 'SYSTEM']),
  readAt: IsoTimestampSchema.nullable(),
});
export const NotificationPageSchema = z
  .object({
    items: OrderNotificationSchema.array().max(30),
    unreadCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    nextCursor: z.string().min(1).max(512).nullable(),
  })
  .strict();
export const NotificationReadResultSchema = z.object({ readAt: IsoTimestampSchema }).strict();
export type NotificationReadInput = z.infer<typeof NotificationReadInputSchema>;
export type OrderNotification = z.infer<typeof OrderNotificationSchema>;
export type NotificationPage = z.infer<typeof NotificationPageSchema>;
