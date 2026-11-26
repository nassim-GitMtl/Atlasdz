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
    /** Optional English text; English pages fall back to French. */
    en: z.string().trim().min(1).max(8000).optional(),
  })
  .strict();
const MoneyMinorSchema = z.number().int().min(0).max(2_000_000_000);
const QuantitySchema = z.number().int().min(0).max(1_000_000);

/** A seller's legal identity, shown to buyers (law 18-05 on electronic commerce). */
export const SellerLegalSchema = z
  .object({
    legalName: z.string().trim().min(2).max(160),
    registerKind: z.enum(['COMMERCE', 'ARTISAN', 'AUTO_ENTREPRENEUR']),
    registerNumber: z.string().trim().min(3).max(40),
    taxId: z.string().trim().regex(/^[0-9]{15,20}$/),
    address: z.string().trim().min(5).max(240),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9]{9,15}$/),
    email: z.email().max(254),
  })
  .strict();
export type SellerLegal = z.infer<typeof SellerLegalSchema>;

export const CatalogSellerSchema = z
  .object({
    id: UuidSchema,
    slug: CatalogSlugSchema,
    name: z.string().trim().min(1).max(160),
    description: CatalogLocalizedTextSchema,
    /** Set while the seller is on holiday: offers come back after this time. */
    holidayUntil: IsoTimestampSchema.nullish(),
    /** Legal identity; null until the seller has filled it in. */
    legal: SellerLegalSchema.nullish(),
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

/** A seller's promotional price for a dated window (at most 90 days). */
export const OfferPromotionSchema = z
  .object({
    priceMinor: MoneyMinorSchema.refine((value) => value > 0),
    startsAt: IsoTimestampSchema,
    endsAt: IsoTimestampSchema,
  })
  .strict()
  .refine(
    (p) =>
      Date.parse(p.endsAt) > Date.parse(p.startsAt) &&
      Date.parse(p.endsAt) - Date.parse(p.startsAt) <= 90 * 86_400_000,
    { message: 'A promotion ends after it starts and lasts at most 90 days' },
  );
export type OfferPromotion = z.infer<typeof OfferPromotionSchema>;

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
    /** Set only while a promotion runs: the seller's regular price and when the offer ends. */
    regularPriceMinor: MoneyMinorSchema.nullish(),
    promotionEndsAt: IsoTimestampSchema.nullish(),
  })
  .strict();

/** Product characteristics a seller may state; labels are translated by each app. */
export const PRODUCT_SPEC_KEYS = [
  'brand',
  'model',
  'material',
  'color',
  'size',
  'dimensions',
  'weight',
  'capacity',
  'power',
  'warranty',
  'origin',
] as const;
export type ProductSpecKey = (typeof PRODUCT_SPEC_KEYS)[number];
export const PRODUCT_SPEC_LABELS: Readonly<
  Record<ProductSpecKey, { readonly fr: string; readonly ar: string; readonly en: string }>
> = {
  brand: { fr: 'Marque', ar: 'العلامة التجارية', en: 'Brand' },
  model: { fr: 'Modèle', ar: 'الطراز', en: 'Model' },
  material: { fr: 'Matière', ar: 'المادة', en: 'Material' },
  color: { fr: 'Couleur', ar: 'اللون', en: 'Colour' },
  size: { fr: 'Taille', ar: 'المقاس', en: 'Size' },
  dimensions: { fr: 'Dimensions', ar: 'الأبعاد', en: 'Dimensions' },
  weight: { fr: 'Poids', ar: 'الوزن', en: 'Weight' },
  capacity: { fr: 'Capacité', ar: 'السعة', en: 'Capacity' },
  power: { fr: 'Puissance', ar: 'القدرة', en: 'Power' },
  warranty: { fr: 'Garantie', ar: 'الضمان', en: 'Warranty' },
  origin: { fr: 'Pays de fabrication', ar: 'بلد الصنع', en: 'Country of manufacture' },
};
export const ProductSpecSchema = z
  .object({
    key: z.enum(PRODUCT_SPEC_KEYS),
    // One line of plain text, as written by the seller.
    value: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[^\u0000-\u001f\u007f]+$/),
  })
  .strict();
export const ProductSpecsSchema = z
  .array(ProductSpecSchema)
  .max(PRODUCT_SPEC_KEYS.length)
  .refine((specs) => new Set(specs.map((spec) => spec.key)).size === specs.length, {
    message: 'Each characteristic may appear once.',
  });
export type ProductSpec = z.infer<typeof ProductSpecSchema>;

/** A seller photo served by the API: `/media/<uuid>.<ext>`. */
export const MediaUrlSchema = z
  .string()
  .regex(/^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$/);
/** Extra photos a product may show after its cover photo. */
export const MAX_GALLERY_PHOTOS = 7;
export const GalleryPhotoSchema = z.object({ id: UuidSchema, url: MediaUrlSchema }).strict();
export type GalleryPhoto = z.infer<typeof GalleryPhotoSchema>;

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
    /** Extra photos after the cover, oldest first (product page only). */
    gallery: z.array(MediaUrlSchema).max(MAX_GALLERY_PHOTOS).optional(),
    /** Seller-stated characteristics, reviewed with the product (product page only). */
    specs: ProductSpecsSchema.optional(),
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
    /** Price range (minor units) of the product's lowest current offer price. */
    minPrice: MoneyMinorSchema.optional(),
    maxPrice: MoneyMinorSchema.optional(),
    /** Only these products (device favorites, recently viewed). */
    slugs: z.array(CatalogSlugSchema).min(1).max(60).optional(),
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
    /** Absent on update: unchanged. Null: no promotion. */
    promotion: OfferPromotionSchema.nullish(),
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
  /** Customers waiting for this product to be back in stock (a count only; seller lists). */
  waitingCustomers: z.number().int().min(0).optional(),
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
      .object({
        fr: z.string().trim().min(1).max(500),
        ar: z.string().trim().min(1).max(500),
        /** Optional; English pages fall back to French. */
        en: z.string().trim().min(1).max(500).optional(),
      })
      .strict(),
    description: CatalogLocalizedTextSchema,
    specs: ProductSpecsSchema.optional(),
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
    /** The product's cover photo and extra photos, once the product exists. */
    imageUrl: z.string().max(200).nullish(),
    gallery: z.array(GalleryPhotoSchema).max(MAX_GALLERY_PHOTOS).optional(),
    specs: ProductSpecsSchema.optional(),
    previous: z
      .object({
        title: SubmitProductInputSchema.shape.title,
        description: CatalogLocalizedTextSchema,
        specs: ProductSpecsSchema.optional(),
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

/** "Tell me when it is back" for a sold-out product (customers). */
export const StockAlertStatusSchema = z.object({ waiting: z.boolean() }).strict();
export const StockAlertListSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            slug: CatalogSlugSchema,
            title: CatalogLocalizedTextSchema,
            createdAt: IsoTimestampSchema,
          })
          .strict(),
      )
      .max(50),
  })
  .strict();
export type StockAlertList = z.infer<typeof StockAlertListSchema>;

/** Seller holiday mode: hide every offer until a time (null: reopen now). */
export const SellerHolidayInputSchema = z.object({ until: IsoTimestampSchema.nullable() }).strict();

/** Questions before buying (public, anonymous) and the sellers' answers. */
export const ProductQuestionSchema = z
  .object({
    id: UuidSchema,
    body: z.string(),
    createdAt: IsoTimestampSchema,
    answers: z
      .array(
        z
          .object({ sellerName: z.string(), body: z.string(), createdAt: IsoTimestampSchema })
          .strict(),
      )
      .max(50),
  })
  .strict();
export const ProductQuestionListSchema = z
  .object({ items: z.array(ProductQuestionSchema).max(50) })
  .strict();
export const AskQuestionInputSchema = z
  .object({ body: z.string().trim().min(5).max(500) })
  .strict();
export const AnswerQuestionInputSchema = z
  .object({ body: z.string().trim().min(2).max(1000) })
  .strict();
/** A question as the seller sees it (its product, and whether this seller answered). */
export const SellerQuestionSchema = z
  .object({
    id: UuidSchema,
    body: z.string(),
    createdAt: IsoTimestampSchema,
    product: z.object({ slug: CatalogSlugSchema, title: CatalogLocalizedTextSchema }).strict(),
    answer: z.string().nullable(),
  })
  .strict();
export const SellerQuestionListSchema = z
  .object({ items: z.array(SellerQuestionSchema).max(100) })
  .strict();
export type ProductQuestion = z.infer<typeof ProductQuestionSchema>;
export type ProductQuestionList = z.infer<typeof ProductQuestionListSchema>;
export type SellerQuestion = z.infer<typeof SellerQuestionSchema>;

/** A customer's report about a listing. */
export const REPORT_REASONS = ['COUNTERFEIT', 'PROHIBITED', 'MISLEADING', 'OFFENSIVE', 'OTHER'] as const;
export const ReportProductInputSchema = z
  .object({
    reason: z.enum(REPORT_REASONS),
    details: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
export const ResolveReportsInputSchema = z
  .object({ action: z.enum(['DISMISS', 'REMOVE_PRODUCT']) })
  .strict();
