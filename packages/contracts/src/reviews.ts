import { z } from 'zod';

import { CatalogLocalizedTextSchema, CatalogProductSchema, CatalogSlugSchema } from './catalog.js';
import { IsoTimestampSchema, UuidSchema } from './primitives.js';

/** Text written by people: trimmed, no control or invisible formatting characters. */
const writtenText = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine(
      (value) =>
        [...value].length >= min &&
        !/[\p{Cf}\p{Zl}\p{Zp}]/u.test(value) &&
        [...value].every(
          (character) => character === '\n' || character === '\t' || !/\p{Cc}/u.test(character),
        ),
      'Unsupported text or control characters',
    );
const VersionSchema = z.number().int().min(1).max(2_147_483_647);
const CountSchema = z.number().int().min(0);

export const ReviewRatingSchema = z.number().int().min(1).max(5);
export const ReviewStatusSchema = z.enum(['PUBLISHED', 'HIDDEN']);
export const ReviewBodySchema = writtenText(2, 1000);
export const ReviewReasonSchema = writtenText(3, 500);
export const REVIEW_PAGE_SIZE = 20;

export const ReviewCursorSchema = z
  .object({ createdAt: IsoTimestampSchema, id: UuidSchema })
  .strict();
export type ReviewCursor = z.infer<typeof ReviewCursorSchema>;
export const ReviewListQuerySchema = z
  .object({
    cursor: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .max(512)
      .optional(),
  })
  .strict();
export const StaffReviewListQuerySchema = ReviewListQuerySchema.extend({
  status: ReviewStatusSchema.optional(),
}).strict();

/** Published reviews only: what shoppers see. */
export const ReviewSummarySchema = z
  .object({
    count: CountSchema,
    average: z.number().min(1).max(5).nullable(),
    /** Number of reviews with 1, 2, 3, 4 and 5 stars. */
    stars: z.tuple([CountSchema, CountSchema, CountSchema, CountSchema, CountSchema]),
  })
  .strict();
export type ReviewSummary = z.infer<typeof ReviewSummarySchema>;

/** Reviewers stay anonymous: shoppers see "verified buyer", never a name or an email. */
export const PublicReviewSchema = z
  .object({
    id: UuidSchema,
    rating: ReviewRatingSchema,
    body: z.string().nullable(),
    productTitle: CatalogLocalizedTextSchema,
    sellerName: z.string().min(1).max(160),
    reply: z.string().nullable(),
    repliedAt: IsoTimestampSchema.nullable(),
    createdAt: IsoTimestampSchema,
    updatedAt: IsoTimestampSchema,
  })
  .strict();
export type PublicReview = z.infer<typeof PublicReviewSchema>;
export const ReviewPageSchema = z
  .object({
    summary: ReviewSummarySchema,
    items: z.array(PublicReviewSchema).max(REVIEW_PAGE_SIZE),
    nextCursor: z.string().nullable(),
  })
  .strict();
export type ReviewPage = z.infer<typeof ReviewPageSchema>;

export const OwnReviewSchema = z
  .object({
    id: UuidSchema,
    rating: ReviewRatingSchema,
    body: z.string().nullable(),
    status: ReviewStatusSchema,
    reply: z.string().nullable(),
    repliedAt: IsoTimestampSchema.nullable(),
    version: VersionSchema,
    createdAt: IsoTimestampSchema,
    updatedAt: IsoTimestampSchema,
  })
  .strict();
export type OwnReview = z.infer<typeof OwnReviewSchema>;
export const OrderReviewItemSchema = z
  .object({
    productId: UuidSchema,
    /** Null when the product is no longer listed. */
    slug: CatalogSlugSchema.nullable(),
    title: CatalogLocalizedTextSchema,
    imageUrl: CatalogProductSchema.shape.imageUrl,
    review: OwnReviewSchema.nullable(),
  })
  .strict();
export const OrderReviewsSchema = z
  .object({
    sellerOrderId: UuidSchema,
    /** Items can be reviewed once the seller reported the delivery or the buyer confirmed it. */
    canReview: z.boolean(),
    items: z.array(OrderReviewItemSchema).max(50),
  })
  .strict();
export type OrderReviews = z.infer<typeof OrderReviewsSchema>;
export const WriteReviewInputSchema = z
  .object({
    rating: ReviewRatingSchema,
    body: ReviewBodySchema.nullable(),
    /** 0 to create the review, otherwise the version being edited. */
    expectedVersion: z.number().int().min(0).max(2_147_483_647),
  })
  .strict();
export type WriteReviewInput = z.infer<typeof WriteReviewInputSchema>;
export const DeleteReviewQuerySchema = z
  .object({ version: z.coerce.number().int().min(1).max(2_147_483_647) })
  .strict();

export const SellerReviewSchema = PublicReviewSchema.extend({
  productId: UuidSchema,
  sellerOrderId: UuidSchema,
  status: ReviewStatusSchema,
  version: VersionSchema,
}).strict();
export type SellerReview = z.infer<typeof SellerReviewSchema>;
export const SellerReviewPageSchema = z
  .object({
    summary: ReviewSummarySchema,
    items: z.array(SellerReviewSchema).max(REVIEW_PAGE_SIZE),
    nextCursor: z.string().nullable(),
  })
  .strict();
export type SellerReviewPage = z.infer<typeof SellerReviewPageSchema>;
export const ReviewReplyInputSchema = z
  .object({ body: ReviewBodySchema, expectedVersion: VersionSchema })
  .strict();

export const StaffReviewSchema = SellerReviewSchema.extend({
  moderationReason: z.string().nullable(),
}).strict();
export type StaffReview = z.infer<typeof StaffReviewSchema>;
export const StaffReviewPageSchema = z
  .object({
    items: z.array(StaffReviewSchema).max(REVIEW_PAGE_SIZE),
    nextCursor: z.string().nullable(),
  })
  .strict();
export const ReviewModerationInputSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('HIDE'),
      reason: ReviewReasonSchema,
      expectedVersion: VersionSchema,
    })
    .strict(),
  z.object({ action: z.literal('PUBLISH'), expectedVersion: VersionSchema }).strict(),
]);
export type ReviewModerationInput = z.infer<typeof ReviewModerationInputSchema>;
