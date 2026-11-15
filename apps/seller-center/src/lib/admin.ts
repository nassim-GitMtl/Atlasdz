import { z } from 'zod';
import { apiOrigin } from './security.ts';

export class AdminApiError extends Error {
  constructor(
    readonly code: 'unauthorized' | 'forbidden' | 'invalid' | 'conflict' | 'unavailable',
  ) {
    super(code);
  }
}

async function call<T>(path: string, schema: z.ZodType<T>, token: string, body?: unknown) {
  let response: Response;
  try {
    response = await fetch(new URL(path, apiOrigin(process.env)), {
      method: body === undefined ? 'GET' : 'POST',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new AdminApiError('unavailable');
  }
  if (!response.ok) {
    const map: Record<number, AdminApiError['code']> = {
      401: 'unauthorized',
      403: 'forbidden',
      404: 'invalid',
      409: 'conflict',
      422: 'invalid',
    };
    throw new AdminApiError(map[response.status] ?? 'unavailable');
  }
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) throw new AdminApiError('unavailable');
  return parsed.data;
}

export const getDashboard = (token: string) =>
  call('/api/v1/admin/dashboard', z.record(z.string(), z.number()), token);

const Category = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.object({ fr: z.string(), ar: z.string() }),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  restrictionClass: z.enum(['STANDARD', 'REVIEW_REQUIRED', 'PROHIBITED']),
  products: z.number(),
});
export type AdminCategory = z.infer<typeof Category>;
export const getCategories = (token: string) =>
  call('/api/v1/admin/categories', z.object({ items: Category.array() }), token);
export const createCategory = (
  token: string,
  input: { slug: string; titleFr: string; titleAr: string },
) => call('/api/v1/admin/categories', z.object({ status: z.string() }), token, input);
export const updateCategory = (
  token: string,
  id: string,
  input: { titleFr: string; titleAr: string; status: string; restrictionClass: string },
) =>
  call(
    `/api/v1/admin/categories/${encodeURIComponent(id)}`,
    z.object({ status: z.string() }),
    token,
    input,
  );

const Seller = z.object({
  sellerId: z.uuid(),
  slug: z.string(),
  name: z.string(),
  status: z.string(),
  suspendedReason: z.string().nullable(),
  createdAt: z.string(),
  approvedOffers: z.number(),
  orders: z.number(),
  closedAt: z.string().nullable().optional(),
});
export type AdminSeller = z.infer<typeof Seller>;
export const getSellers = (token: string) =>
  call('/api/v1/admin/sellers/all', z.object({ items: Seller.array() }), token);
export const setSellerStatus = (token: string, id: string, status: string, reason?: string) =>
  call(
    `/api/v1/admin/sellers/${encodeURIComponent(id)}/status`,
    z.object({ status: z.string() }),
    token,
    { status, ...(reason ? { reason } : {}) },
  );
export const removePhoto = (token: string, productId: string) =>
  call(
    `/api/v1/admin/products/${encodeURIComponent(productId)}/photo/remove`,
    z.object({ status: z.string() }),
    token,
    {},
  );

const Review = z.object({
  id: z.uuid(),
  rating: z.number().int().min(1).max(5),
  body: z.string().nullable(),
  productTitle: z.object({ fr: z.string(), ar: z.string() }),
  sellerName: z.string(),
  reply: z.string().nullable(),
  createdAt: z.string(),
  status: z.enum(['PUBLISHED', 'HIDDEN']),
  version: z.number().int().positive(),
  moderationReason: z.string().nullable(),
});
export type AdminReview = z.infer<typeof Review>;
export const getReviews = (token: string) =>
  call('/api/v1/admin/reviews', z.object({ items: Review.array() }), token);
export const moderateReview = (
  token: string,
  id: string,
  input:
    | { readonly action: 'HIDE'; readonly reason: string; readonly expectedVersion: number }
    | { readonly action: 'PUBLISH'; readonly expectedVersion: number },
) =>
  call(
    `/api/v1/admin/reviews/${encodeURIComponent(id)}`,
    z.object({ id: z.uuid(), status: z.enum(['PUBLISHED', 'HIDDEN']) }),
    token,
    input,
  );

const Localized = z.object({ fr: z.string(), ar: z.string() });
const SellerDetail = z.object({
  seller: z.object({
    sellerId: z.uuid(),
    slug: z.string(),
    name: z.string(),
    status: z.string(),
    suspendedReason: z.string().nullable(),
    description: Localized,
    createdAt: z.string(),
    closedAt: z.string().nullable(),
  }),
  users: z.array(
    z.object({ userId: z.uuid(), email: z.string(), phone: z.string().nullable(), status: z.string(), createdAt: z.string() }),
  ),
  offers: z.array(
    z.object({
      offerId: z.uuid(),
      productId: z.uuid(),
      title: Localized,
      priceMinor: z.number(),
      availableQuantity: z.number(),
      status: z.string(),
      promotion: z.object({ priceMinor: z.number(), endsAt: z.string().nullable() }).nullable(),
    }),
  ),
  orders: z.array(
    z.object({
      sellerOrderId: z.uuid(),
      status: z.string(),
      totalMinor: z.number(),
      createdAt: z.string(),
      recipient: z.string().nullable(),
    }),
  ),
  orderCounts: z.record(z.string(), z.number()),
  reviews: z.array(
    z.object({
      reviewId: z.uuid(),
      rating: z.number(),
      body: z.string().nullable(),
      status: z.string(),
      product: z.string(),
      createdAt: z.string(),
    }),
  ),
  activeDeliveryRates: z.number(),
});
export type AdminSellerDetail = z.infer<typeof SellerDetail>;
const Done = z.object({}).passthrough();
const path = (id: string) => encodeURIComponent(id);
export const getSellerDetail = (token: string, id: string) =>
  call(`/api/v1/admin/sellers/${path(id)}/detail`, SellerDetail, token);
export const closeSeller = (token: string, id: string) =>
  call(`/api/v1/admin/sellers/${path(id)}/close`, Done, token, {});
export const setOfferStatusAdmin = (token: string, id: string, status: 'SUSPENDED' | 'APPROVED') =>
  call(`/api/v1/admin/offers/${path(id)}/status`, Done, token, { status });
export const removeOfferAdmin = (token: string, id: string) =>
  call(`/api/v1/admin/offers/${path(id)}/remove`, z.object({ outcome: z.string() }), token, {});
export const removeProductAdmin = (token: string, id: string) =>
  call(`/api/v1/admin/products/${path(id)}/remove`, Done, token, {});
export const deleteReviewAdmin = (token: string, id: string) =>
  call(`/api/v1/admin/reviews/${path(id)}/delete`, Done, token, {});
const Customer = z.object({
  userId: z.uuid(),
  email: z.string(),
  status: z.string(),
  createdAt: z.string(),
  orders: z.number(),
  openOrders: z.number(),
});
export type AdminCustomer = z.infer<typeof Customer>;
export const findCustomers = (token: string, email: string) =>
  call(`/api/v1/admin/customers?email=${encodeURIComponent(email)}`, z.object({ items: Customer.array() }), token);
export const closeCustomer = (token: string, id: string) =>
  call(`/api/v1/admin/customers/${path(id)}/close`, Done, token, {});
