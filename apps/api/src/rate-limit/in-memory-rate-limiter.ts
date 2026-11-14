import type { RateLimitClass } from './rate-limit.decorator.js';
import type { RateLimitDecision, RateLimiterPort, RateLimitRequest } from './rate-limiter.js';

export interface FixedWindowPolicy {
  readonly limit: number;
  readonly windowSeconds: number;
}

const DEFAULT_POLICIES: Readonly<Record<string, FixedWindowPolicy>> = {
  authenticated: { limit: 120, windowSeconds: 60 },
};

/**
 * Fixed-window limiter for a single API process (the single-VPS deployment).
 * Memory is bounded: expired windows are swept and the table is capped.
 * Replace with a shared store before running more than one API replica.
 */
export class InMemoryRateLimiter implements RateLimiterPort {
  private readonly windows = new Map<string, { startedAt: number; count: number }>();

  public constructor(
    private readonly policies: Readonly<Record<string, FixedWindowPolicy>> = DEFAULT_POLICIES,
    private readonly maxKeys = 50_000,
    private readonly now: () => number = Date.now,
  ) {}

  public async consume(request: RateLimitRequest): Promise<RateLimitDecision> {
    return this.hit(request.rateLimitClass, `${request.subjectId}:${request.operation}`);
  }

  public hit(rateLimitClass: RateLimitClass | string, key: string): RateLimitDecision {
    const policy = this.policies[rateLimitClass] ?? { limit: 60, windowSeconds: 60 };
    const now = this.now();
    const windowMs = policy.windowSeconds * 1000;
    const fullKey = `${rateLimitClass}|${key}`;
    let window = this.windows.get(fullKey);
    if (window === undefined || now - window.startedAt >= windowMs) {
      if (window === undefined && this.windows.size >= this.maxKeys) this.sweep(now);
      window = { startedAt: now, count: 0 };
      this.windows.set(fullKey, window);
    }
    window.count += 1;
    return {
      allowed: window.count <= policy.limit,
      limit: policy.limit,
      remaining: Math.max(0, policy.limit - window.count),
      resetAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - window.startedAt)) / 1000)),
    };
  }

  private sweep(now: number): void {
    const longest = Math.max(...Object.values(this.policies).map((p) => p.windowSeconds), 60);
    for (const [key, window] of this.windows) {
      if (now - window.startedAt >= longest * 1000) this.windows.delete(key);
    }
    // Fail safe under a key flood: drop oldest entries rather than grow without bound.
    while (this.windows.size >= this.maxKeys) {
      const oldest = this.windows.keys().next().value;
      if (oldest === undefined) break;
      this.windows.delete(oldest);
    }
  }
}
