import { SafeApplicationError } from '@atlas/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';

import { getRequestPrincipal, type PrincipalAwareRequest } from '../auth/index.js';
import { RATE_LIMIT_METADATA, type RateLimitMetadata } from './rate-limit.decorator.js';
import {
  isValidRateLimitDecision,
  type RateLimitDecision,
  type RateLimiterPort,
} from './rate-limiter.js';
import { RATE_LIMITER } from './tokens.js';

@Injectable()
export class RateLimitGuard implements CanActivate {
  public constructor(
    @Inject(RATE_LIMITER) private readonly rateLimiter: RateLimiterPort,
    private readonly reflector: Reflector,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadata = this.reflector.getAllAndOverride<RateLimitMetadata>(RATE_LIMIT_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (metadata === undefined) {
      return true;
    }
    if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(metadata.operation)) {
      throw new SafeApplicationError('SERVICE_UNAVAILABLE');
    }

    const request = context.switchToHttp().getRequest<PrincipalAwareRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const principal = getRequestPrincipal(request);
    let decision: RateLimitDecision;
    try {
      decision = await this.rateLimiter.consume({
        rateLimitClass: metadata.rateLimitClass,
        operation: metadata.operation,
        subjectId: principal.userId,
      });
    } catch {
      throw new SafeApplicationError('SERVICE_UNAVAILABLE');
    }

    if (!isValidRateLimitDecision(decision)) {
      throw new SafeApplicationError('SERVICE_UNAVAILABLE');
    }

    response.setHeader('RateLimit-Limit', String(decision.limit));
    response.setHeader('RateLimit-Remaining', String(decision.remaining));
    response.setHeader('RateLimit-Reset', String(decision.resetAfterSeconds));

    if (!decision.allowed) {
      response.setHeader('Retry-After', String(decision.resetAfterSeconds));
      throw new SafeApplicationError('RATE_LIMITED', {
        retryAfterSeconds: decision.resetAfterSeconds,
      });
    }

    return true;
  }
}
