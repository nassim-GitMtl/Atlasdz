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
