import {
  SellerReviewPageSchema,
  SellerReviewSchema,
  CatalogProductListSchema,
  CatalogCategorySchema,
  CatalogEntrySchema,
  ProductSubmissionSchema,
  type SubmitProductInput,
  type ReviewProductInput,
  SellerOfferSchema,
  SellerOrderSchema,
  DeliveryDestinationSchema,
  SellerDeliveryRateSchema,
  SessionListSchema,
  NotificationPageSchema,
  NotificationReadResultSchema,
  type NotificationReadInput,
  type SetSellerDeliveryRateInput,
  type CreateOfferInput,
  type UpdateOfferInput,
  SupportDetailSchema,
  SupportListSchema,
  type SupportActionInput,
  type ProcessSellerOrderInput,
  type SellerRejectionReason,
} from '@atlas/contracts';
import { z } from 'zod';
import { apiOrigin } from './security.ts';

export type ApiFailure = 'invalid' | 'unauthorized' | 'forbidden' | 'conflict' | 'unavailable';
export class SellerApiError extends Error {
  readonly code: ApiFailure;
  constructor(code: ApiFailure) {
    super(code);
    this.name = 'SellerApiError';
    this.code = code;
  }
}
const OfferListSchema = z.object({ items: z.array(SellerOfferSchema).max(1000) }).strict();
const SessionSchema = z
  .object({ accessToken: z.string().min(1).max(8192), expiresAt: z.iso.datetime() })
  .strict();

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  token?: string,
  body?: unknown,
  method?: 'DELETE',
): Promise<T> {
  try {
    const response = await fetch(new URL(path, apiOrigin(process.env)), {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      headers: {
        accept: 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      const codes: Record<number, ApiFailure> = {
        400: 'invalid',
        401: 'unauthorized',
        403: 'forbidden',
        409: 'conflict',
        422: 'invalid',
      };
      throw new SellerApiError(codes[response.status] ?? 'unavailable');
    }
    const result = schema.safeParse(response.status === 204 ? undefined : await response.json());
    if (!result.success) throw new SellerApiError('unavailable');
    return result.data;
  } catch (error) {
    if (error instanceof SellerApiError) throw error;
    throw new SellerApiError('unavailable');
  }
}

export const listProducts = () => request('/api/v1/catalog/products', CatalogProductListSchema);
const ProductSubmissionsSchema = z
  .object({ items: ProductSubmissionSchema.array().max(100) })
  .strict();
const OfferProductsSchema = z.object({ items: CatalogEntrySchema.array().max(100) }).strict();
export const listOfferProducts = (token: string) =>
  request('/api/v1/seller/products/catalog', OfferProductsSchema, token);
export const listReviewProducts = (token: string) =>
  request('/api/v1/admin/products/catalog', OfferProductsSchema, token);
export const listProductCategories = (token: string) =>
  request(
    '/api/v1/seller/products/categories',
    z.object({ items: CatalogCategorySchema.array().max(100) }).strict(),
    token,
  );
export const listProductSubmissions = (token: string, staff = false) =>
  request(`/api/v1/${staff ? 'admin' : 'seller'}/products`, ProductSubmissionsSchema, token);
export const getProductSubmission = (token: string, id: string) =>
  request(`/api/v1/seller/products/${encodeURIComponent(id)}`, ProductSubmissionSchema, token);
export const submitProduct = (token: string, input: SubmitProductInput) =>
  request('/api/v1/seller/products', ProductSubmissionSchema, token, input);
export const reviewProduct = (token: string, id: string, input: ReviewProductInput) =>
  request(
    `/api/v1/admin/products/${encodeURIComponent(id)}/review`,
    ProductSubmissionSchema,
    token,
    input,
  );
export const listNotifications = (token: string, cursor?: string) =>
  request(
    `/api/v1/notifications${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    NotificationPageSchema,
    token,
  );
export const readNotification = (token: string, input: NotificationReadInput) =>
  request('/api/v1/notifications/read', NotificationReadResultSchema, token, input);
export const listDeliveryDestinations = (token: string) =>
  request(
    '/api/v1/delivery/destinations',
    z.object({ items: DeliveryDestinationSchema.array().max(2000) }).strict(),
    token,
  );
export const listDeliveryRates = (token: string) =>
  request(
    '/api/v1/seller/delivery',
    z.object({ items: SellerDeliveryRateSchema.array().max(2000) }).strict(),
    token,
  );
export const setDeliveryRate = (token: string, id: string, input: SetSellerDeliveryRateInput) =>
  request(
    `/api/v1/seller/delivery/${encodeURIComponent(id)}`,
    SellerDeliveryRateSchema,
    token,
    input,
  );
export const listOffers = (token: string) =>
  request('/api/v1/seller/offers', OfferListSchema, token);
export const listPendingOffers = (token: string) =>
  request('/api/v1/admin/offers?status=PENDING_REVIEW', OfferListSchema, token);
export const createOffer = (token: string, input: CreateOfferInput) =>
  request('/api/v1/seller/offers', SellerOfferSchema, token, input);
export const getOffer = (token: string, id: string) =>
  request(`/api/v1/seller/offers/${encodeURIComponent(id)}`, SellerOfferSchema, token);
export const updateOffer = (token: string, id: string, input: UpdateOfferInput) =>
  request(`/api/v1/seller/offers/${encodeURIComponent(id)}`, SellerOfferSchema, token, input);
export const approveOffer = (token: string, id: string) =>
  request(`/api/v1/admin/offers/${encodeURIComponent(id)}/approve`, SellerOfferSchema, token, {});
export const rejectOffer = (token: string, id: string, reason: string) =>
  request(`/api/v1/admin/offers/${encodeURIComponent(id)}/reject`, SellerOfferSchema, token, {
    reason,
  });
export const createLocalSession = (account: 'seller' | 'admin') =>
  request('/api/v1/local/session', SessionSchema, undefined, { account });
export async function revokeSellerSession(token: string): Promise<void> {
  const sessions = await request('/api/v1/auth/sessions', SessionListSchema, token);
  const current = sessions.sessions.filter((session) => session.current);
  // A successful list must identify one current family. Never guess or silently report logout.
  if (current.length !== 1 || !current[0]) throw new SellerApiError('unavailable');
  await request(
    `/api/v1/auth/sessions/${encodeURIComponent(current[0].id)}`,
    z.undefined(),
    token,
    undefined,
    'DELETE',
  );
}
export const listSellerOrders = (token: string) =>
  request(
    '/api/v1/seller/orders',
    z.object({ items: SellerOrderSchema.array().max(100) }).strict(),
    token,
  );
export const getSellerOrder = (token: string, id: string) =>
  request(`/api/v1/seller/orders/${encodeURIComponent(id)}`, SellerOrderSchema, token);
export const listSupport = (token: string, staff: boolean, cursor?: string) =>
  request(
    `/api/v1/${staff ? 'admin/' : ''}support${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    SupportListSchema,
    token,
  );
export const getSupport = (token: string, id: string, staff: boolean, before?: string) =>
  request(
    `/api/v1/${staff ? 'admin/' : ''}support/${encodeURIComponent(id)}${before ? `?beforeVersion=${encodeURIComponent(before)}` : ''}`,
    SupportDetailSchema,
    token,
  );
export const getOrderSupport = (token: string, id: string) =>
  request(
    `/api/v1/support/order/${encodeURIComponent(id)}`,
    z.object({ detail: SupportDetailSchema.nullable() }).strict(),
    token,
  ).then((result) => result.detail);
export const actSupport = (token: string, id: string, staff: boolean, input: SupportActionInput) =>
  request(
    `/api/v1/${staff ? 'admin/' : ''}support/${encodeURIComponent(id)}`,
    SupportDetailSchema,
    token,
    input,
  );
export const rejectSellerOrder = (
  token: string,
  id: string,
  expectedVersion: number,
  reasonCode: SellerRejectionReason,
) =>
  request(`/api/v1/seller/orders/${encodeURIComponent(id)}/reject`, SellerOrderSchema, token, {
    expectedVersion,
    reasonCode,
  });
export const processSellerOrder = (token: string, id: string, command: ProcessSellerOrderInput) =>
  request(
    `/api/v1/seller/orders/${encodeURIComponent(id)}/transition`,
    SellerOrderSchema,
    token,
    command,
  );

export const listSellerReviews = (token: string, cursor?: string) =>
  request(
    `/api/v1/seller/reviews${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    SellerReviewPageSchema,
    token,
  );
export const replyToReview = (token: string, id: string, body: string, expectedVersion: number) =>
  request(`/api/v1/seller/reviews/${encodeURIComponent(id)}/reply`, SellerReviewSchema, token, {
    body,
    expectedVersion,
  });
