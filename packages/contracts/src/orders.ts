import { z } from 'zod';
import {
  CatalogLocalizedTextSchema,
  CatalogProductSchema,
  PreorderSchema,
  SellerLegalSchema,
} from './catalog.js';
import { IsoTimestampSchema, UuidSchema } from './primitives.js';
import { CodCollectorSchema, DeliveryDaysSchema, DeliveryDestinationSchema } from './delivery.js';

const TotalSchema = z.number().int().min(0).max(10_100_000_000_000);
const contactText = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .regex(/^[^\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+$/u);
// Format validation only: this does not verify a phone, address or geographic coverage.
export const DeliveryContactSchema = z
  .object({
    recipientName: contactText(2, 120),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9]{7,15}$/),
    addressLine: contactText(5, 240),
    city: contactText(2, 120),
    /** Optional single-line hint for the courier: landmark, floor, best time to call. */
    note: contactText(2, 200).optional(),
  })
  .strict();
export type DeliveryContact = z.infer<typeof DeliveryContactSchema>;
export const CreateCheckoutQuoteInputSchema = z
  .object({
    expectedCartVersion: z.number().int().min(1).max(2_147_483_646),
    destinationId: UuidSchema,
    deliveryContact: DeliveryContactSchema,
    /** Required when the cart holds pre-order items: the buyer accepts the estimated delay. */
    acceptPreorder: z.literal(true).optional(),
  })
  .strict();
export const CloseSellerOrderInputSchema = z
  .object({ expectedVersion: z.number().int().min(1).max(2_147_483_646) })
  .strict();
export const SellerRejectionReasonSchema = z.enum([
  'OUT_OF_STOCK',
  'DELIVERY_UNAVAILABLE',
  'UNABLE_TO_FULFILL',
]);
export const RejectSellerOrderInputSchema = CloseSellerOrderInputSchema.extend({
  reasonCode: SellerRejectionReasonSchema,
}).strict();
// LIVE orders use SELLER_ARRANGED; the repository enforces the method matching the order's data class.
export const TestShipmentSchema = z
  .object({
    method: z.enum(['SELLER_ARRANGED_TEST', 'SELLER_ARRANGED']),
    carrier: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/^[\p{L}\p{N} ._-]+$/u),
    trackingReference: z
      .string()
      .trim()
      .min(3)
      .max(80)
      .regex(/^[A-Za-z0-9_-]+$/),
  })
  .strict();
export const ProcessSellerOrderInputSchema = z.discriminatedUnion('action', [
  CloseSellerOrderInputSchema.extend({ action: z.literal('ACCEPT') }).strict(),
  CloseSellerOrderInputSchema.extend({ action: z.literal('PREPARE') }).strict(),
  CloseSellerOrderInputSchema.extend({
    action: z.literal('SHIP'),
    shipment: TestShipmentSchema,
  }).strict(),
  CloseSellerOrderInputSchema.extend({ action: z.literal('REPORT_DELIVERY') }).strict(),
  CloseSellerOrderInputSchema.extend({ action: z.literal('REPORT_DELIVERY_FAILED') }).strict(),
]);
export const OrderItemSnapshotSchema = z
  .object({
    offerId: UuidSchema,
    productId: UuidSchema,
    title: CatalogLocalizedTextSchema,
    imageUrl: CatalogProductSchema.shape.imageUrl,
    quantity: z.number().int().min(1).max(99),
    unitPriceMinor: z.number().int().min(1).max(2_000_000_000),
    offerVersion: z.number().int().positive(),
    handlingDays: z.number().int().min(0).max(30),
    preorder: PreorderSchema.nullish(),
  })
  .strict();
export const SellerOrderSnapshotSchema = z
  .object({
    sellerId: UuidSchema,
    sellerName: z.string().min(1).max(160),
    items: z.array(OrderItemSnapshotSchema).min(1).max(50),
    itemsSubtotalMinor: TotalSchema,
    shippingFeeMinor: z.number().int().min(0).max(2_000_000_000),
    totalMinor: TotalSchema,
    deliveryRate: z
      .object({
        id: UuidSchema,
        version: z.number().int().positive(),
        destination: DeliveryDestinationSchema,
        codCollector: CodCollectorSchema,
        /** The delivery time the seller stated for this destination when the order was quoted. */
        deliveryDays: DeliveryDaysSchema.nullish(),
      })
      .strict()
      .optional(),
    /** The seller's legal identity (law 18-05) when the order was quoted; null if incomplete. */
    sellerLegal: SellerLegalSchema.nullish(),
  })
  .strict();
export const CheckoutQuoteSchema = z
  .object({
    id: UuidSchema,
    /** The buyer accepted the pre-order delay (kept as proof with the quote). */
    preorderAccepted: z.boolean().optional(),
    cartVersion: z.number().int().min(1),
    createdAt: IsoTimestampSchema,
    expiresAt: IsoTimestampSchema,
    currency: z.literal('DZD'),
    totalMinor: TotalSchema,
    dataClass: z.enum(['synthetic', 'live']),
    paymentArrangement: z.enum(['TEST_ONLY_NO_PAYMENT', 'CASH_ON_DELIVERY']),
    delivery: z.enum(['LOCAL_TEST_NO_SHIPMENT', 'SELLER_DELIVERY']),
    destination: DeliveryDestinationSchema.optional(),
    // Historical placed orders remain readable; all new quotes require contact details.
    deliveryContact: DeliveryContactSchema.optional(),
    policy: z.discriminatedUnion('revision', [
      z
        .object({
          revision: z.literal('local-order-fixture-v1'),
          shippingRule: z.literal('SYNTHETIC_MAX_OFFER_FEE_PER_SELLER'),
          acceptanceWindowSeconds: z.number().int().min(1).max(86400),
        })
        .strict(),
      z
        .object({
          revision: z.literal('local-destination-cod-v2'),
          shippingRule: z.literal('ONE_SELLER_CHARGE_PER_ORDER_DESTINATION'),
          codModel: z.literal('SELLER_OR_COURIER_COLLECTS'),
          acceptanceWindowSeconds: z.number().int().min(1).max(86400),
        })
        .strict(),
      z
        .object({
          revision: z.literal('live-destination-cod-v1'),
          shippingRule: z.literal('ONE_SELLER_CHARGE_PER_ORDER_DESTINATION'),
          codModel: z.literal('SELLER_OR_COURIER_COLLECTS'),
          acceptanceWindowSeconds: z
            .number()
            .int()
            .min(60)
            .max(7 * 86400),
        })
        .strict(),
    ]),
    sellers: z.array(SellerOrderSnapshotSchema).min(1).max(50),
  })
  .strict()
  .superRefine((quote, context) => {
    const live = quote.dataClass === 'live';
    if (
      live !== (quote.paymentArrangement === 'CASH_ON_DELIVERY') ||
      live !== (quote.delivery === 'SELLER_DELIVERY') ||
      live !== (quote.policy.revision === 'live-destination-cod-v1')
    )
      context.addIssue({ code: 'custom', message: 'Quote data class and terms must agree' });
    const destinationBased = quote.policy.revision !== 'local-order-fixture-v1';
    if (
      destinationBased
        ? !quote.destination ||
          quote.sellers.some(
            (s) =>
              !s.deliveryRate ||
              JSON.stringify(s.deliveryRate.destination) !== JSON.stringify(quote.destination),
          )
        : quote.destination !== undefined || quote.sellers.some((s) => s.deliveryRate !== undefined)
    )
      context.addIssue({
        code: 'custom',
        message: 'Shipping policy and immutable destination/rates must match',
      });
  });
export const SellerOrderStatusSchema = z.enum([
  'AWAITING_SELLER',
  'ACCEPTED',
  'PREPARING',
  'SHIPPED',
  'DELIVERY_REPORTED',
  'DELIVERED',
  'DELIVERY_FAILED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
]);
export const SellerOrderHistorySchema = z
  .object({
    version: z.number().int().positive(),
    status: SellerOrderStatusSchema,
    attribution: z.enum(['SELLER', 'CUSTOMER', 'SYSTEM']),
    occurredAt: IsoTimestampSchema,
    reason: z.string().min(1).max(80),
  })
  .strict();
export const SellerOrderSchema = z
  .object({
    id: UuidSchema,
    orderId: UuidSchema,
    status: SellerOrderStatusSchema,
    version: z.number().int().positive(),
    createdAt: IsoTimestampSchema,
    acceptanceDeadline: IsoTimestampSchema,
    snapshot: SellerOrderSnapshotSchema,
    deliveryContact: DeliveryContactSchema.nullish(),
    dataClass: z.enum(['synthetic', 'live']),
    paymentState: z.enum(['NOT_APPLICABLE_TEST', 'CASH_ON_DELIVERY']),
    delivery: z.enum(['LOCAL_TEST_NO_SHIPMENT', 'SELLER_DELIVERY']),
    shipment: TestShipmentSchema.nullable(),
    rejectionReason: z
      .enum(['OUT_OF_STOCK', 'DELIVERY_UNAVAILABLE', 'UNABLE_TO_FULFILL', 'LEGACY_TEST_REJECTION'])
      .nullable(),
    history: SellerOrderHistorySchema.array().max(20),
  })
  .strict();
export const CustomerOrderSchema = z
  .object({
    id: UuidSchema,
    quote: CheckoutQuoteSchema,
    sellerOrders: z.array(SellerOrderSchema).min(1).max(50),
    paymentState: z.enum(['NOT_APPLICABLE_TEST', 'CASH_ON_DELIVERY']),
  })
  .strict();
export const OrderRoutingV1PayloadSchema = z
  .object({
    orderId: UuidSchema,
    sellerOrderId: UuidSchema,
    sellerId: UuidSchema,
    status: SellerOrderStatusSchema,
    dataClass: z.enum(['synthetic', 'live']),
  })
  .strict();
export type CheckoutQuote = z.infer<typeof CheckoutQuoteSchema>;
export type CustomerOrder = z.infer<typeof CustomerOrderSchema>;
export type SellerOrder = z.infer<typeof SellerOrderSchema>;
export type SellerOrderSnapshot = z.infer<typeof SellerOrderSnapshotSchema>;
export type ProcessSellerOrderInput = z.infer<typeof ProcessSellerOrderInputSchema>;
export type SellerRejectionReason = z.infer<typeof SellerRejectionReasonSchema>;

/** Private notes of the seller's team on one order (never shown to the customer). */
export const SELLER_ORDER_NOTE_KINDS = ['NOTE', 'CALL_NO_ANSWER', 'CALL_CONFIRMED', 'CALL_CALLBACK'] as const;
export const AddSellerOrderNoteInputSchema = z
  .object({
    kind: z.enum(SELLER_ORDER_NOTE_KINDS),
    body: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .regex(/^[^\p{Cc}\p{Cf}]+$/u)
      .optional(),
  })
  .strict()
  .refine((value) => value.kind !== 'NOTE' || value.body !== undefined, 'A note needs a text');
export const SellerOrderNoteSchema = z
  .object({
    id: UuidSchema,
    kind: z.enum(SELLER_ORDER_NOTE_KINDS),
    body: z.string().nullable(),
    author: z.string().nullable(),
    createdAt: IsoTimestampSchema,
  })
  .strict();
export type SellerOrderNote = z.infer<typeof SellerOrderNoteSchema>;
export type AddSellerOrderNoteInput = z.infer<typeof AddSellerOrderNoteInputSchema>;
