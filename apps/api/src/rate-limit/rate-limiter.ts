import type { RateLimitClass } from './rate-limit.decorator.js';

export interface RateLimitRequest {
  readonly rateLimitClass: RateLimitClass;
  readonly operation: string;
  readonly subjectId: string;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly limit: number;
  readonly remaining: number;
  readonly resetAfterSeconds: number;
}

export interface RateLimiterPort {
  consume(request: RateLimitRequest): Promise<RateLimitDecision>;
}

const validInteger = (value: number, minimum: number, maximum: number): boolean =>
  Number.isSafeInteger(value) && value >= minimum && value <= maximum;

export const isValidRateLimitDecision = (value: RateLimitDecision): boolean =>
  typeof value.allowed === 'boolean' &&
  validInteger(value.limit, 1, 1_000_000) &&
  validInteger(value.remaining, 0, value.limit) &&
  validInteger(value.resetAfterSeconds, 1, 86_400);

/**
 * Safe composition default until an approved distributed limiter and policy are supplied.
 * It deliberately denies classified traffic instead of silently running without abuse control.
 */
export class RejectingRateLimiter implements RateLimiterPort {
  public async consume(_request: RateLimitRequest): Promise<RateLimitDecision> {
    return Object.freeze({
      allowed: false,
      limit: 1,
      remaining: 0,
      resetAfterSeconds: 60,
    });
  }
}
