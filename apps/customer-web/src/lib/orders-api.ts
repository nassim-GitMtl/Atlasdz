import {
  CheckoutQuoteSchema,
  CustomerOrderSchema,
  SellerOrderSchema,
  DeliveryDestinationSchema,
  NotificationPageSchema,
  NotificationReadResultSchema,
  type NotificationReadInput,
  type DeliveryContact,
  SupportDetailSchema,
  SupportListSchema,
  type CreateSupportCaseInput,
  type SupportActionInput,
} from '@atlas/contracts';
import { z } from 'zod';
import { customerApiOrigin } from './customer-security';

export type OrderFailure =
  | 'preorder'
  | 'auth'
  | 'changed'
  | 'expired'
  | 'missing'
  | 'conflict'
  | 'disabled'
  | 'unavailable'
  | 'coverage'
  | 'invalid'
  | 'unverified'
  | 'phoneRequired'
  | 'codLimit'
  | 'codBlocked'
  | 'terms';
export class OrderApiError extends Error {
  constructor(readonly code: OrderFailure) {
    super(code);
  }
}
async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  token: string,
  body?: unknown,
  key?: string,
): Promise<T> {
  try {
    const response = await fetch(new URL(path, customerApiOrigin(process.env)), {
      method: body === undefined ? 'GET' : 'POST',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(key ? { 'idempotency-key': key } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status === 403) {
      const denied = z
        .object({ code: z.string() })
        .safeParse(await response.json().catch(() => null));
      throw new OrderApiError(
        !denied.success
          ? 'auth'
          : denied.data.code === 'EMAIL_NOT_VERIFIED'
            ? 'unverified'
            : denied.data.code === 'PHONE_NOT_VERIFIED'
              ? 'phoneRequired'
              : denied.data.code === 'COD_BLOCKED'
                ? 'codBlocked'
                : 'auth',
      );
    }
    if (response.status === 401) throw new OrderApiError('auth');
    if (!response.ok) {
      const error = z.object({ code: z.string() }).safeParse(await response.json());
      const codes: Record<string, OrderFailure> = {
        QUOTE_CHANGED: 'changed',
        QUOTE_EXPIRED: 'expired',
        ORDER_NOT_FOUND: 'missing',
        ORDER_STATE_CONFLICT: 'conflict',
        CHECKOUT_DISABLED: 'disabled',
        DELIVERY_UNAVAILABLE: 'coverage',
        VALIDATION_FAILED: 'invalid',
        SUPPORT_CONFLICT: 'conflict',
        RESOURCE_NOT_FOUND: 'missing',
        COD_LIMIT_REACHED: 'codLimit',
        PREORDER_ACCEPTANCE_REQUIRED: 'preorder',
      };
      throw new OrderApiError(
        error.success ? (codes[error.data.code] ?? 'unavailable') : 'unavailable',
      );
    }
    return schema.parse(await response.json());
  } catch (error) {
    if (error instanceof OrderApiError) throw error;
    throw new OrderApiError('unavailable');
  }
}
export const listDestinations = (token: string) =>
  request(
    '/api/v1/delivery/destinations',
    z.object({ items: DeliveryDestinationSchema.array().max(2000) }).strict(),
    token,
  );
export const createQuote = (
  token: string,
  expectedCartVersion: number,
  destinationId: string,
  deliveryContact: DeliveryContact,
  acceptPreorder = false,
) =>
  request('/api/v1/checkout/quotes', CheckoutQuoteSchema, token, {
    expectedCartVersion,
    destinationId,
    deliveryContact,
    ...(acceptPreorder ? { acceptPreorder: true } : {}),
  });
export const getQuote = (token: string, id: string) =>
  request(`/api/v1/checkout/quotes/${encodeURIComponent(id)}`, CheckoutQuoteSchema, token);
export const placeOrder = (token: string, id: string) =>
  request(
    `/api/v1/checkout/quotes/${encodeURIComponent(id)}/place`,
    CustomerOrderSchema,
    token,
    {},
    id,
  );
export const listOrders = (token: string, limit?: number) =>
  request(
    limit === undefined ? '/api/v1/orders' : `/api/v1/orders?limit=${limit}`,
    z.object({ items: CustomerOrderSchema.array().max(50) }).strict(),
    token,
  );
export const listNotifications = (token: string, cursor?: string) =>
  request(
    `/api/v1/notifications${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    NotificationPageSchema,
    token,
  );
export const readNotification = (token: string, input: NotificationReadInput) =>
  request('/api/v1/notifications/read', NotificationReadResultSchema, token, input);
export const getOrder = (token: string, id: string) =>
  request(`/api/v1/orders/${encodeURIComponent(id)}`, CustomerOrderSchema, token);
export const listSupport = (token: string, cursor?: string) =>
  request(
    `/api/v1/support${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    SupportListSchema,
    token,
  );
export const getSupport = (token: string, id: string, before?: string) =>
  request(
    `/api/v1/support/${encodeURIComponent(id)}${before ? `?beforeVersion=${encodeURIComponent(before)}` : ''}`,
    SupportDetailSchema,
    token,
  );
export const getOrderSupport = (token: string, id: string) =>
  request(
    `/api/v1/support/order/${encodeURIComponent(id)}`,
    z.object({ detail: SupportDetailSchema.nullable() }).strict(),
    token,
  ).then((result) => result.detail);
export const createSupport = (token: string, input: CreateSupportCaseInput) =>
  request('/api/v1/support', SupportDetailSchema, token, input);
export const actSupport = (token: string, id: string, input: SupportActionInput) =>
  request(`/api/v1/support/${encodeURIComponent(id)}`, SupportDetailSchema, token, input);
export const cancelOrder = (token: string, id: string, expectedVersion: number) =>
  request(
    `/api/v1/orders/seller-orders/${encodeURIComponent(id)}/cancel`,
    SellerOrderSchema,
    token,
    { expectedVersion },
  );
export const confirmDelivery = (token: string, id: string, expectedVersion: number) =>
  request(
    `/api/v1/orders/seller-orders/${encodeURIComponent(id)}/confirm-delivery`,
    SellerOrderSchema,
    token,
    { expectedVersion },
  );
