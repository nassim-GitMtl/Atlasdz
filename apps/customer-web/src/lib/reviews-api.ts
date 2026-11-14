import {
  OrderReviewsSchema,
  OwnReviewSchema,
  type OrderReviews,
  type OwnReview,
  type WriteReviewInput,
} from '@atlas/contracts';
import { z } from 'zod';
import { customerApiOrigin } from './customer-security';

export type ReviewFailure = 'auth' | 'conflict' | 'notAllowed' | 'invalid' | 'unavailable';

export class ReviewApiError extends Error {
  constructor(readonly code: ReviewFailure) {
    super(code);
  }
}

async function call<T>(
  path: string,
  schema: z.ZodType<T>,
  token: string,
  method: 'GET' | 'PUT',
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(new URL(path, customerApiOrigin(process.env)), {
      method,
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
    throw new ReviewApiError('unavailable');
  }
  if (response.status === 401 || response.status === 403) throw new ReviewApiError('auth');
  if (!response.ok) {
    const error = z.object({ code: z.string() }).safeParse(await response.json().catch(() => null));
    const code = error.success ? error.data.code : '';
    throw new ReviewApiError(
      code === 'REVIEW_NOT_ALLOWED'
        ? 'notAllowed'
        : code === 'REVIEW_CONFLICT'
          ? 'conflict'
          : code === 'VALIDATION_FAILED'
            ? 'invalid'
            : 'unavailable',
    );
  }
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) throw new ReviewApiError('unavailable');
  return parsed.data;
}

/** The buyer's items of one seller order, with their own reviews. */
export const getOrderReviews = (token: string, sellerOrderId: string): Promise<OrderReviews> =>
  call(
    `/api/v1/reviews/order/${encodeURIComponent(sellerOrderId)}`,
    OrderReviewsSchema,
    token,
    'GET',
  );

/** Creates (expectedVersion 0) or edits the buyer's review of a delivered item. */
export const writeReview = (
  token: string,
  sellerOrderId: string,
  productId: string,
  input: WriteReviewInput,
): Promise<OwnReview> =>
  call(
    `/api/v1/reviews/order/${encodeURIComponent(sellerOrderId)}/${encodeURIComponent(productId)}`,
    OwnReviewSchema,
    token,
    'PUT',
    input,
  );
