import { z } from 'zod';

import { IsoTimestampSchema, UuidSchema } from './primitives.js';

export const CatalogSlugSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const CatalogLocalizedTextSchema = z
  .object({
    fr: z.string().trim().min(1).max(8000),
    ar: z.string().trim().min(1).max(8000),
  })
  .strict();
const MoneyMinorSchema = z.number().int().min(0).max(2_000_000_000);
const QuantitySchema = z.number().int().min(0).max(1_000_000);

export const CatalogSellerSchema = z
  .object({
    id: UuidSchema,
    slug: CatalogSlugSchema,
    name: z.string().trim().min(1).max(160),
    description: CatalogLocalizedTextSchema,
  })
  .strict();

/**
 * A pre-order offer: the item is not in stock yet (often imported). The buyer sees the estimated
 * delivery window and accepts it before ordering; the stock is the number of pre-orders taken.
 */
export const PreorderSchema = z
  .object({
    minDays: z.number().int().min(1).max(180),
    maxDays: z.number().int().min(1).max(180),
    origin: z.string().trim().min(2).max(60).nullable(),
  })
  .strict()
  .refine((value) => value.maxDays >= value.minDays, 'maxDays must not be below minDays');
export type Preorder = z.infer<typeof PreorderSchema>;

export const CatalogOfferSchema = z
  .object({
    id: UuidSchema,
    seller: CatalogSellerSchema.pick({ id: true, slug: true, name: true }),
    priceMinor: MoneyMinorSchema.refine((value) => value > 0),
    currency: z.literal('DZD'),
    availableQuantity: QuantitySchema,
    handlingDays: z.number().int().min(0).max(30),
    deliveryFeeMinor: MoneyMinorSchema,
    preorder: PreorderSchema.nullish(),
  })
  .strict();

export const CatalogProductSchema = z
  .object({
    id: UuidSchema,
    slug: CatalogSlugSchema,
    title: CatalogLocalizedTextSchema,
    description: CatalogLocalizedTextSchema,
    category: z.object({ slug: CatalogSlugSchema, title: CatalogLocalizedTextSchema }).strict(),
    // Application-owned assets, or seller photos served by the API under /media.
    imageUrl: z
      .string()
      .regex(
        /^(?:\/assets\/[a-zA-Z0-9_-]+\.(?:png|jpg|jpeg|webp|avif)|\/assets\/product-placeholder\.svg|\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp))$/,
      ),
    offers: z.array(CatalogOfferSchema).min(1).max(50),
  })
  .strict();

export const CatalogProductListSchema = z
  .object({
    items: z.array(CatalogProductSchema).max(100),
    /** Matching products in the whole catalogue (not just this page). */
    total: z.number().int().min(0).optional(),
    page: z.number().int().min(1).optional(),
    pageSize: z.number().int().min(1).max(100).optional(),
  })
  .strict();
export const CatalogSortSchema = z.enum([
  'recommended',
  'price-asc',
  'price-desc',
  'fastest',
  'newest',
]);
export type CatalogSort = z.infer<typeof CatalogSortSchema>;
/** Categories that currently have products on sale, with how many. */
export const CatalogCategoryListSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            slug: CatalogSlugSchema,
            title: CatalogLocalizedTextSchema,
            productCount: z.number().int().min(1),
          })
          .strict(),
      )
      .max(500),
  })
  .strict();
export type CatalogCategoryList = z.infer<typeof CatalogCategoryListSchema>;
export const ListProductsInputSchema = z
  .object({
    query: z.string().trim().max(120).optional(),
    category: CatalogSlugSchema.optional(),
    seller: CatalogSlugSchema.optional(),
    limit: z.number().int().min(1).max(100).optional(),
    page: z.number().int().min(1).max(1000).optional(),
    sort: CatalogSortSchema.optional(),
    /** Only products with at least one offer in stock. */
    available: z.boolean().optional(),
  })
  .strict();

export const CreateOfferInputSchema = z
  .object({
    productId: UuidSchema,
    priceMinor: MoneyMinorSchema.refine((value) => value > 0),
    availableQuantity: QuantitySchema,
    handlingDays: z.number().int().min(0).max(30),
    deliveryFeeMinor: MoneyMinorSchema,
    /** Null or absent: in stock. */
    preorder: PreorderSchema.nullish(),
  })
  .strict();

export const SellerOfferSchema = CreateOfferInputSchema.extend({
  id: UuidSchema,
  sellerId: UuidSchema,
  currency: z.literal('DZD'),
  status: z.enum(['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED']),
  rowVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  /** Why staff refused the offer; set only while status is REJECTED. */
  rejectionReason: z.string().max(300).nullish(),
}).strict();
/** Staff refusal of a pending offer; the reason is shown to the seller. */
export const RejectOfferInputSchema = z
  .object({ reason: z.string().trim().min(5).max(300) })
  .strict();
export type RejectOfferInput = z.infer<typeof RejectOfferInputSchema>;
export const OfferRejectedV1PayloadSchema = z
  .object({ offerId: UuidSchema, sellerId: UuidSchema, reason: z.string().min(5).max(300) })
  .strict();
export const UpdateOfferInputSchema = CreateOfferInputSchema.omit({
  productId: true,
  deliveryFeeMinor: true,
})
  .extend({
    expectedVersion: z.number().int().min(1).max(2_147_483_646),
  })
  .strict();
export const OfferUpdatedV1PayloadSchema = z
  .object({
    offerId: UuidSchema,
    sellerId: UuidSchema,
    priceMinor: MoneyMinorSchema.refine((value) => value > 0),
    availableQuantity: QuantitySchema,
    handlingDays: z.number().int().min(0).max(30),
  })
  .strict();
export type UpdateOfferInput = z.infer<typeof UpdateOfferInputSchema>;

export const OfferCreatedV1PayloadSchema = z
  .object({
    offerId: UuidSchema,
    sellerId: UuidSchema,
    productId: UuidSchema,
    variantId: UuidSchema,
    fulfillmentMethod: z.literal('SELLER_FULFILLED'),
  })
  .strict();

export const OfferActivatedV1PayloadSchema = z
  .object({
    offerId: UuidSchema,
    sellerId: UuidSchema,
    variantId: UuidSchema,
    price: z.object({ amountMinor: MoneyMinorSchema, currency: z.literal('DZD') }).strict(),
    fulfillmentMethod: z.literal('SELLER_FULFILLED'),
    activatedAt: IsoTimestampSchema,
  })
  .strict();

export type CatalogProduct = z.infer<typeof CatalogProductSchema>;
export type CatalogProductList = z.infer<typeof CatalogProductListSchema>;
export type CatalogSeller = z.infer<typeof CatalogSellerSchema>;
export type ListProductsInput = z.infer<typeof ListProductsInputSchema>;
export type CreateOfferInput = z.infer<typeof CreateOfferInputSchema>;
export type SellerOffer = z.infer<typeof SellerOfferSchema>;

export const CatalogEntrySchema = CatalogProductSchema.omit({ offers: true });
export const CatalogCategorySchema = z
  .object({
    id: UuidSchema,
    slug: CatalogSlugSchema,
    title: CatalogLocalizedTextSchema,
  })
  .strict();
export const SubmitProductInputSchema = z
  .object({
    requestId: UuidSchema,
    revisionOfSubmissionId: UuidSchema.optional(),
    categoryId: UuidSchema,
    title: z
      .object({ fr: z.string().trim().min(1).max(500), ar: z.string().trim().min(1).max(500) })
      .strict(),
    description: CatalogLocalizedTextSchema,
  })
  .strict();
export const ReviewProductInputSchema = z.discriminatedUnion('decision', [
  z
    .object({
      decision: z.literal('APPROVED'),
      expectedVersion: z.number().int().positive().max(2_147_483_646),
    })
    .strict(),
  z
    .object({
      decision: z.literal('REJECTED'),
      expectedVersion: z.number().int().positive().max(2_147_483_646),
      reason: z.string().trim().min(1).max(1000),
    })
    .strict(),
]);
export const ProductSubmissionSchema = z
  .object({
    id: UuidSchema,
    sellerId: UuidSchema,
    category: CatalogCategorySchema,
    title: SubmitProductInputSchema.shape.title,
    description: CatalogLocalizedTextSchema,
    status: z.enum(['PENDING_REVIEW', 'APPROVED', 'REJECTED']),
    rowVersion: z.number().int().positive(),
    productId: UuidSchema.nullable(),
    reviewReason: z.string().max(1000).nullable(),
    revisionOfSubmissionId: UuidSchema.nullable(),
    canRevise: z.boolean(),
    previous: z
      .object({
        title: SubmitProductInputSchema.shape.title,
        description: CatalogLocalizedTextSchema,
      })
      .strict()
      .nullable(),
  })
  .strict();
export const ProductSubmissionChangedV1PayloadSchema = ProductSubmissionSchema.pick({
  id: true,
  sellerId: true,
  status: true,
  productId: true,
});
export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;
export type SubmitProductInput = z.infer<typeof SubmitProductInputSchema>;
export type ReviewProductInput = z.infer<typeof ReviewProductInputSchema>;
export type ProductSubmission = z.infer<typeof ProductSubmissionSchema>;
