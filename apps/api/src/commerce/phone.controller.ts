import { SafeApplicationError } from '@atlas/contracts';
import { Body, Controller, Get, HttpCode, Inject, Post, Req } from '@nestjs/common';

import {
  AuthenticatedOnly,
  getRequestPrincipal,
  type AuthenticatedRequest,
} from '../auth/index.js';
import { RateLimited } from '../rate-limit/index.js';
import { COD_RISK, type CodRiskService } from './cod-risk.js';

function customerId(request: AuthenticatedRequest): string {
  const principal = getRequestPrincipal(request);
  if (principal.actorType !== 'customer') throw new SafeApplicationError('FORBIDDEN');
  return principal.userId;
}

function field(body: unknown, key: string, pattern: RegExp): string {
  const value =
    typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)[key]
      : undefined;
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new SafeApplicationError('VALIDATION_FAILED', {
      fields: [{ path: key, reason: 'INVALID' }],
    });
  }
  return value;
}

/** Customer phone verification by SMS code (only when an SMS gateway is configured). */
@Controller('api/v1/account/phone')
export class PhoneVerificationController {
  public constructor(@Inject(COD_RISK) private readonly risk: CodRiskService) {}

  @Get()
  @AuthenticatedOnly()
  @RateLimited('authenticated', 'identity.phone.read')
  public async status(@Req() request: AuthenticatedRequest) {
    return this.risk.phoneStatus(customerId(request));
  }

  @Post('start')
  @HttpCode(202)
  @AuthenticatedOnly()
  @RateLimited('authenticated', 'identity.phone.start')
  public async start(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const phone = field(body, 'phone', /^[+0-9 .-]{8,20}$/);
    const requested =
      typeof body === 'object' && body !== null ? (body as { locale?: unknown }).locale : undefined;
    const locale = requested === 'ar' || requested === 'en' ? requested : 'fr';
    const outcome = await this.risk.startPhoneVerification(customerId(request), phone, locale);
    if (outcome === 'INVALID_PHONE') {
      throw new SafeApplicationError('VALIDATION_FAILED', {
        fields: [{ path: 'phone', reason: 'PHONE_INVALID' }],
      });
    }
    if (outcome === 'THROTTLED') {
      throw new SafeApplicationError('RATE_LIMITED', { retryAfterSeconds: 3600 });
    }
    if (outcome === 'UNAVAILABLE') throw new SafeApplicationError('SERVICE_UNAVAILABLE');
    return { status: 'SENT' };
  }

  @Post('confirm')
  @HttpCode(200)
  @AuthenticatedOnly()
  @RateLimited('authenticated', 'identity.phone.confirm')
  public async confirm(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const phone = field(body, 'phone', /^[+0-9 .-]{8,20}$/);
    const code = field(body, 'code', /^[0-9]{6}$/);
    const outcome = await this.risk.confirmPhone(customerId(request), phone, code);
    if (outcome === 'INVALID') {
      throw new SafeApplicationError('VALIDATION_FAILED', {
        fields: [{ path: 'code', reason: 'PHONE_CODE_INVALID' }],
      });
    }
    return { status: 'VERIFIED' };
  }
}
