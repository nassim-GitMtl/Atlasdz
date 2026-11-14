import { SetMetadata } from '@nestjs/common';

export type RateLimitClass = 'authenticated';

export interface RateLimitMetadata {
  readonly rateLimitClass: RateLimitClass;
  readonly operation: string;
}

export const RATE_LIMIT_METADATA = Symbol('atlas.api.rate-limit');

export const RateLimited = (
  rateLimitClass: RateLimitClass,
  operation: string,
): ReturnType<typeof SetMetadata> =>
  SetMetadata(
    RATE_LIMIT_METADATA,
    Object.freeze({ rateLimitClass, operation }) satisfies RateLimitMetadata,
  );
