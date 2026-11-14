import { z } from 'zod';
import { CatalogOfferSchema, CatalogProductSchema } from './catalog.js';
import { UuidSchema } from './primitives.js';

export const SetCartItemInputSchema = z
  .object({
    quantity: z.number().int().min(0).max(99),
    expectedVersion: z.number().int().min(0).max(2_147_483_646),
  })
  .strict();
export const CartLineSchema = z
  .object({
    offerId: UuidSchema,
    quantity: z.number().int().min(1).max(99),
    state: z.enum(['AVAILABLE', 'INSUFFICIENT_STOCK', 'UNAVAILABLE']),
    product: CatalogProductSchema.pick({
      id: true,
      slug: true,
      title: true,
      imageUrl: true,
    }).nullable(),
    offer: CatalogOfferSchema.nullable(),
    lineSubtotalMinor: z.number().int().min(0).max(198_000_000_000).nullable(),
  })
  .strict();
export const CustomerCartSchema = z
  .object({
    version: z.number().int().min(0).max(2_147_483_647),
    items: z.array(CartLineSchema).max(50),
    currency: z.literal('DZD'),
    // Excludes unavailable lines and shipping; never presented as a checkout quote.
    availableSubtotalMinor: z.number().int().min(0).max(9_900_000_000_000),
  })
  .strict();
export type SetCartItemInput = z.infer<typeof SetCartItemInputSchema>;
export type CartLine = z.infer<typeof CartLineSchema>;
export type CustomerCart = z.infer<typeof CustomerCartSchema>;
