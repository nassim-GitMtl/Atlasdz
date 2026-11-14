import { z } from 'zod';

import { CorrelationIdSchema } from './primitives.js';

export const ErrorCodeSchema = z
  .string()
  .min(3)
  .max(120)
  .regex(/^[A-Z][A-Z0-9_]*$/);

export const SafeErrorCodeSchema = z.enum([
  'MALFORMED_REQUEST',
  'AUTHENTICATION_REQUIRED',
  'REFRESH_TOKEN_INVALID',
  'REFRESH_TOKEN_REUSED',
  'SESSION_REVOKED',
  'FORBIDDEN',
  'STEP_UP_AUTH_REQUIRED',
  'RESOURCE_NOT_FOUND',
  'SESSION_NOT_FOUND',
  'OFFER_STATE_CONFLICT',
  'PRODUCT_STATE_CONFLICT',
  'SUPPORT_CONFLICT',
  'REVIEW_CONFLICT',
  'REVIEW_NOT_ALLOWED',
  'CART_CONFLICT',
  'CART_OFFER_UNAVAILABLE',
  'CART_LIMIT_REACHED',
  'CHECKOUT_DISABLED',
  'QUOTE_CHANGED',
  'QUOTE_EXPIRED',
  'ORDER_NOT_FOUND',
  'ORDER_STATE_CONFLICT',
  'DELIVERY_UNAVAILABLE',
  'DELIVERY_CONFLICT',
  'METHOD_NOT_ALLOWED',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'VALIDATION_FAILED',
  'RATE_LIMITED',
  'INVALID_CREDENTIALS',
  'ACCOUNT_CONFLICT',
  'EMAIL_NOT_VERIFIED',
  'PHONE_NOT_VERIFIED',
  'COD_LIMIT_REACHED',
  'COD_BLOCKED',
  'ACCOUNT_HAS_OPEN_ORDERS',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
  'UPSTREAM_TIMEOUT',
]);

export type SafeErrorCode = z.infer<typeof SafeErrorCodeSchema>;

export const SAFE_ERROR_DEFINITIONS: Readonly<
  Record<SafeErrorCode, { readonly status: number; readonly message: string }>
> = {
  MALFORMED_REQUEST: { status: 400, message: 'The request is malformed.' },
  AUTHENTICATION_REQUIRED: { status: 401, message: 'Authentication is required.' },
  REFRESH_TOKEN_INVALID: { status: 401, message: 'The refresh credential is invalid.' },
  REFRESH_TOKEN_REUSED: {
    status: 401,
    message: 'The refresh credential was already used. Sign in again.',
  },
  SESSION_REVOKED: { status: 401, message: 'The session is no longer valid.' },
  FORBIDDEN: { status: 403, message: 'The request is not permitted.' },
  STEP_UP_AUTH_REQUIRED: { status: 403, message: 'Additional authentication is required.' },
  RESOURCE_NOT_FOUND: { status: 404, message: 'The resource was not found.' },
  SESSION_NOT_FOUND: { status: 404, message: 'The session was not found.' },
  OFFER_STATE_CONFLICT: {
    status: 409,
    message: 'The offer cannot be changed in its current state.',
  },
  PRODUCT_STATE_CONFLICT: {
    status: 409,
    message: 'The product submission conflicts with its current state. Reload before continuing.',
  },
  SUPPORT_CONFLICT: { status: 409, message: 'The support case changed. Reload before continuing.' },
  REVIEW_CONFLICT: { status: 409, message: 'The review changed. Reload before continuing.' },
  REVIEW_NOT_ALLOWED: {
    status: 409,
    message: 'Only items of your own orders that were delivered can be reviewed.',
  },
  CART_CONFLICT: { status: 409, message: 'The cart changed. Reload it before trying again.' },
  CART_OFFER_UNAVAILABLE: {
    status: 409,
    message: 'The requested offer or quantity is unavailable.',
  },
  CART_LIMIT_REACHED: { status: 409, message: 'The cart has reached its item limit.' },
  CHECKOUT_DISABLED: { status: 503, message: 'Checkout is not available in this environment.' },
  QUOTE_CHANGED: {
    status: 409,
    message: 'Cart, price or availability changed. Request a new quote.',
  },
  QUOTE_EXPIRED: { status: 409, message: 'The quote expired. Request a new quote.' },
  ORDER_NOT_FOUND: { status: 404, message: 'The order or quote was not found.' },
  ORDER_STATE_CONFLICT: {
    status: 409,
    message: 'The order cannot be changed in its current state.',
  },
  DELIVERY_UNAVAILABLE: { status: 409, message: 'Delivery is not available for this destination.' },
  DELIVERY_CONFLICT: {
    status: 409,
    message: 'Delivery configuration changed. Reload before saving.',
  },
  METHOD_NOT_ALLOWED: { status: 405, message: 'The method is not supported.' },
  PAYLOAD_TOO_LARGE: { status: 413, message: 'The request payload is too large.' },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, message: 'The media type is not supported.' },
  VALIDATION_FAILED: { status: 422, message: 'The request failed validation.' },
  RATE_LIMITED: { status: 429, message: 'Too many requests.' },
  INVALID_CREDENTIALS: { status: 401, message: 'The email, password or code is incorrect.' },
  ACCOUNT_CONFLICT: { status: 409, message: 'An account with these details already exists.' },
  EMAIL_NOT_VERIFIED: { status: 403, message: 'Confirm your email address before ordering.' },
  PHONE_NOT_VERIFIED: { status: 403, message: 'Confirm your phone number before ordering.' },
  COD_LIMIT_REACHED: {
    status: 409,
    message: 'You have reached the number of open cash-on-delivery orders allowed.',
  },
  ACCOUNT_HAS_OPEN_ORDERS: {
    status: 409,
    message: 'Close or cancel your open orders before deleting the account.',
  },
  COD_BLOCKED: {
    status: 403,
    message: 'Cash on delivery is unavailable for this account. Contact support.',
  },
  INTERNAL_ERROR: { status: 500, message: 'An unexpected error occurred.' },
  SERVICE_UNAVAILABLE: { status: 503, message: 'The service is temporarily unavailable.' },
  UPSTREAM_TIMEOUT: { status: 504, message: 'A required dependency timed out.' },
};

export const ErrorDetailSchema = z
  .object({
    path: z.string().min(1).max(240),
    reason: z.string().regex(/^[A-Z][A-Z0-9_]{2,119}$/),
  })
  .strict();

export const ValidationErrorDetailsSchema = z
  .object({ fields: z.array(ErrorDetailSchema).min(1).max(50) })
  .strict();

export const RateLimitErrorDetailsSchema = z
  .object({ retryAfterSeconds: z.number().int().min(1).max(86_400) })
  .strict();

export const SafeErrorDetailsSchema = z.union([
  ValidationErrorDetailsSchema,
  RateLimitErrorDetailsSchema,
]);

export type SafeErrorDetails = z.infer<typeof SafeErrorDetailsSchema>;

const safeDetailSchemas: Readonly<Partial<Record<SafeErrorCode, z.ZodType<SafeErrorDetails>>>> = {
  VALIDATION_FAILED: ValidationErrorDetailsSchema,
  RATE_LIMITED: RateLimitErrorDetailsSchema,
};

export class SafeApplicationError extends Error {
  public readonly status: number;
  public readonly safeMessage: string;
  public readonly details: SafeErrorDetails | undefined;

  public constructor(
    public readonly code: SafeErrorCode,
    details?: unknown,
  ) {
    const definition = SAFE_ERROR_DEFINITIONS[code];
    super(definition.message);
    this.name = 'SafeApplicationError';
    this.status = definition.status;
    this.safeMessage = definition.message;
    if (details !== undefined) {
      const schema = safeDetailSchemas[code];
      if (schema === undefined) {
        throw new TypeError(`Safe details are not defined for ${code}`);
      }
      this.details = Object.freeze(schema.parse(details));
    }
  }
}

export const ErrorEnvelopeSchema = z
  .object({
    code: ErrorCodeSchema,
    message: z.string().min(1).max(500),
    correlationId: CorrelationIdSchema,
    details: SafeErrorDetailsSchema.optional(),
  })
  .strict();

export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
