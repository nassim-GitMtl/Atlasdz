import { z } from 'zod';
import { CatalogLocalizedTextSchema } from './catalog.js';
import { IsoTimestampSchema, UuidSchema } from './primitives.js';

export const DeliveryDestinationSchema = z
  .object({
    id: UuidSchema,
    datasetVersionId: UuidSchema,
    code: z.string().min(1).max(24),
    name: CatalogLocalizedTextSchema,
    dataClass: z.enum(['synthetic', 'reference']),
    kind: z.enum(['COMMUNE', 'WILAYA']).optional(),
    wilaya: z
      .object({
        id: UuidSchema,
        code: z.string().regex(/^[0-9]{2}$/),
        name: CatalogLocalizedTextSchema,
      })
      .strict()
      .optional(),
  })
  .strict();
export const CodCollectorSchema = z.enum(['SELLER', 'SELLER_COURIER']);
export const SetSellerDeliveryRateInputSchema = z
  .object({
    expectedVersion: z.number().int().min(0).max(2_147_483_646),
    enabled: z.boolean(),
    shippingFeeMinor: z.number().int().min(0).max(2_000_000_000),
    codCollector: CodCollectorSchema,
    useWilayaRate: z.boolean().optional(),
  })
  .strict();
export const SellerDeliveryRateSchema = z
  .object({
    id: UuidSchema,
    sellerId: UuidSchema,
    destination: DeliveryDestinationSchema,
    version: z.number().int().positive(),
    enabled: z.boolean(),
    shippingFeeMinor: z.number().int().min(0).max(2_000_000_000),
    codCollector: CodCollectorSchema,
    updatedAt: IsoTimestampSchema,
    useWilayaRate: z.boolean().optional(),
  })
  .strict();
export const DeliveryRateChangedV1PayloadSchema = z
  .object({
    sellerId: UuidSchema,
    destinationId: UuidSchema,
    rateId: UuidSchema,
    enabled: z.boolean(),
    dataClass: z.enum(['synthetic', 'reference']),
  })
  .strict();
export type DeliveryDestination = z.infer<typeof DeliveryDestinationSchema>;
export type SellerDeliveryRate = z.infer<typeof SellerDeliveryRateSchema>;
export type SetSellerDeliveryRateInput = z.infer<typeof SetSellerDeliveryRateInputSchema>;

/** Shoppers ask what each seller charges (or whether it delivers) to one commune. */
export const DeliveryFeesQuerySchema = z
  .object({
    destinationId: UuidSchema,
    sellerIds: z
      .string()
      .max(20 * 37)
      .transform((value) => [...new Set(value.split(',').filter(Boolean))])
      .pipe(z.array(UuidSchema).min(1).max(20)),
  })
  .strict();
export const DeliveryFeesSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            sellerId: UuidSchema,
            available: z.boolean(),
            shippingFeeMinor: z.number().int().min(0).max(2_000_000_000).nullable(),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();
export type DeliveryFees = z.infer<typeof DeliveryFeesSchema>;
