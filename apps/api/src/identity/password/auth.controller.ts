import {
  SafeApplicationError,
  SellerHolidayInputSchema,
  SellerLegalSchema,
  UuidSchema,
} from '@atlas/contracts';
import type { SessionSelfService } from '@atlas/identity';
import type { RuntimeConfig } from '@atlas/platform';
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';

import {
  AuthenticatedOnly,
  getRequestPrincipal,
  Public,
  RequirePermission,
  type AuthenticatedRequest,
} from '../../auth/index.js';
import type { CorrelatedRequest } from '../../http-types.js';
import { RateLimited } from '../../rate-limit/index.js';
import { InMemoryRateLimiter } from '../../rate-limit/in-memory-rate-limiter.js';
import {
  MARKETPLACE_NOTIFIER,
  type MarketplaceNotifier,
} from '../../notifications/marketplace-notifier.js';
import { RUNTIME_CONFIG } from '../../tokens.js';
import { SESSION_SELF_SERVICE } from '../tokens.js';
import { passwordPolicyViolation } from './credential-crypto.js';
import { normalizeEmail, type PasswordIdentityRepository } from './password-identity.js';

export const PASSWORD_IDENTITY = Symbol('atlas.password-identity');

type Request = CorrelatedRequest;
type Body = Record<string, unknown>;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function invalid(path: string, reason = 'INVALID'): never {
  throw new SafeApplicationError('VALIDATION_FAILED', { fields: [{ path, reason }] });
}

function object(input: unknown, allowed: readonly string[]): Body {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) invalid('body');
  const body = input as Body;
  const extra = Object.keys(body).find((key) => !allowed.includes(key));
  if (extra !== undefined) invalid(extra, 'UNKNOWN_FIELD');
  return body;
}

// Names: no control, format (bidi overrides, zero-width) or line/paragraph separator characters,
// which could spoof how a store name reads in the shop, Seller Center and emails.
const SINGLE_LINE = /^[^\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+$/u;
// Free text keeps line breaks and tabs but no other control characters (NUL breaks storage).
const MULTI_LINE = /^(?:[^\p{Cc}]|[\t\n\r])+$/u;

function text(body: Body, key: string, max: number, multiline = false): string {
  const value = body[key];
  if (typeof value !== 'string') invalid(key);
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > max) invalid(key);
  if (!(multiline ? MULTI_LINE : SINGLE_LINE).test(trimmed)) invalid(key);
  return trimmed;
}

function email(body: Body): string {
  const value = normalizeEmail(text(body, 'email', 254));
  if (!EMAIL.test(value)) invalid('email');
  return value;
}

function password(body: Body): string {
  const value = body['password'];
  if (typeof value !== 'string' || value.length < 1 || value.length > 128) invalid('password');
  return value;
}

function locale(body: Body): 'fr' | 'ar' | 'en' {
  const value = body['locale'] ?? 'fr';
  if (value !== 'fr' && value !== 'ar' && value !== 'en') invalid('locale');
  return value;
}

function policyFailure(reason: string): never {
  throw new SafeApplicationError('VALIDATION_FAILED', { fields: [{ path: 'password', reason }] });
}

/** Public, IP-throttled endpoints; responses never reveal whether an email is registered at login. */
@Controller('api/v1/auth')
@Public()
export class AuthController {
  private readonly limiter = new InMemoryRateLimiter({
    login: { limit: 30, windowSeconds: 60 },
    loginEmail: { limit: 10, windowSeconds: 900 },
    register: { limit: 20, windowSeconds: 3600 },
    reset: { limit: 30, windowSeconds: 3600 },
    verify: { limit: 60, windowSeconds: 3600 },
  });

  public constructor(
    @Inject(PASSWORD_IDENTITY) private readonly identity: PasswordIdentityRepository,
    @Inject(MARKETPLACE_NOTIFIER) private readonly notifier: MarketplaceNotifier,
    @Inject(RUNTIME_CONFIG) private readonly config: RuntimeConfig,
  ) {}

  /** Optional link origin; must be one of this deployment's own web apps. */
  private allowedOrigin(value: unknown): string | null {
    if (value === undefined) return null;
    if (typeof value !== 'string' || !this.config.corsAllowedOrigins.includes(value)) {
      invalid('origin');
    }
    return value;
  }

  private throttle(
    kind: 'login' | 'loginEmail' | 'register' | 'reset' | 'verify',
    key: string,
  ): void {
    const decision = this.limiter.hit(kind, key);
    if (!decision.allowed) {
      throw new SafeApplicationError('RATE_LIMITED', {
        retryAfterSeconds: decision.resetAfterSeconds,
      });
    }
  }

  @Post('register/customer')
  @HttpCode(201)
  public async registerCustomer(@Req() request: Request, @Body() body: unknown) {
    this.throttle('register', request.ip ?? 'unknown');
    const raw = object(body, ['email', 'password', 'locale', 'origin']);
    const input = { email: email(raw), password: password(raw), locale: locale(raw) };
    const origin = this.allowedOrigin(raw['origin']);
    const violation = passwordPolicyViolation(input.password, input.email);
    if (violation) policyFailure(violation);
    const result = await this.identity.registerCustomer(input, {
      correlationId: request.correlationId,
    });
    if (result.status === 'CONFLICT') throw new SafeApplicationError('ACCOUNT_CONFLICT');
    this.notifier.emailVerification(result.userId, origin);
    return { status: 'CREATED' };
  }

  /**
   * "Buy without an account": creates the customer account for this email, signs it in and
   * emails a link to choose a password. An address that already has an account must sign in.
   */
  @Post('register/guest')
  @HttpCode(201)
  public async registerGuest(@Req() request: Request, @Body() body: unknown) {
    this.throttle('register', request.ip ?? 'unknown');
    const raw = object(body, ['email', 'locale', 'origin']);
    const address = email(raw);
    const requestedLocale = locale(raw);
    const origin = this.allowedOrigin(raw['origin']);
    this.throttle('register', address);
    const result = await this.identity.registerGuest(
      { email: address, locale: requestedLocale },
      { correlationId: request.correlationId },
    );
    if (result.status === 'CONFLICT') throw new SafeApplicationError('ACCOUNT_CONFLICT');
    this.notifier.guestAccount(address, requestedLocale, result.setPasswordToken, origin);
    return { status: 'AUTHENTICATED', ...result.session };
  }

  @Post('register/seller')
  @HttpCode(201)
  public async registerSeller(@Req() request: Request, @Body() body: unknown) {
    this.throttle('register', request.ip ?? 'unknown');
    const raw = object(body, [
      'email',
      'password',
      'locale',
      'storeName',
      'descriptionFr',
      'descriptionAr',
      'origin',
      'legal',
    ]);
    const origin = this.allowedOrigin(raw['origin']);
    // Law 18-05: the seller's register number, NIF, address and contacts are shown to buyers.
    const legal = SellerLegalSchema.safeParse(raw['legal']);
    if (!legal.success) invalid('legal', 'INVALID');
    const input = {
      email: email(raw),
      password: password(raw),
      locale: locale(raw),
      storeName: text(raw, 'storeName', 160),
      descriptionFr: text(raw, 'descriptionFr', 8000, true),
      descriptionAr: text(raw, 'descriptionAr', 8000, true),
      legal: legal.data,
    };
    const violation = passwordPolicyViolation(input.password, input.email);
    if (violation) policyFailure(violation);
    const result = await this.identity.registerSeller(input, {
      correlationId: request.correlationId,
    });
    if (result.status === 'CONFLICT') throw new SafeApplicationError('ACCOUNT_CONFLICT');
    this.notifier.emailVerification(result.userId, origin);
    return { status: 'CREATED' };
  }

  @Post('login')
  @HttpCode(200)
  public async login(@Req() request: Request, @Body() body: unknown) {
    this.throttle('login', request.ip ?? 'unknown');
    const raw = object(body, ['email', 'password', 'totpCode']);
    const code = raw['totpCode'];
    if (code !== undefined && (typeof code !== 'string' || !/^[0-9]{6}$/.test(code))) {
      invalid('totpCode');
    }
    const input = { email: email(raw), password: password(raw), totpCode: code };
    this.throttle('loginEmail', input.email);
    const result = await this.identity.login(input, { correlationId: request.correlationId });
    if (result.status === 'INVALID_CREDENTIALS') {
      throw new SafeApplicationError('INVALID_CREDENTIALS');
    }
    return result;
  }

  /** Always 202, whether or not the email is registered. */
  @Post('password/forgot')
  @HttpCode(202)
  public async forgotPassword(@Req() request: Request, @Body() body: unknown) {
    this.throttle('reset', request.ip ?? 'unknown');
    const raw = object(body, ['email', 'locale', 'origin']);
    const address = email(raw);
    const requestedLocale = locale(raw);
    const origin = raw['origin'];
    // Links may only point at this deployment's own web apps.
    if (typeof origin !== 'string' || !this.config.corsAllowedOrigins.includes(origin)) {
      invalid('origin');
    }
    this.throttle('reset', address);
    const reset = await this.identity.requestPasswordReset(address, {
      correlationId: request.correlationId,
    });
    if (reset !== null) {
      const mailLocale = raw['locale'] === undefined ? reset.locale : requestedLocale;
      this.notifier.passwordReset(
        address,
        mailLocale,
        `${origin}/reset-password?token=${reset.token}&lang=${mailLocale}`,
      );
    }
    return { status: 'ACCEPTED' };
  }

  @Post('email/verify')
  @HttpCode(200)
  public async verifyEmail(@Req() request: Request, @Body() body: unknown) {
    this.throttle('verify', request.ip ?? 'unknown');
    const raw = object(body, ['token']);
    const token = raw['token'];
    if (typeof token !== 'string') invalid('token');
    const outcome = await this.identity.verifyEmail(token, {
      correlationId: request.correlationId,
    });
    if (outcome === 'INVALID') invalid('token', 'VERIFY_TOKEN_INVALID');
    return { status: 'VERIFIED' };
  }

  /** Always 202; sends a fresh link only to unverified accounts. */
  @Post('email/resend')
  @HttpCode(202)
  public async resendVerification(@Req() request: Request, @Body() body: unknown) {
    this.throttle('reset', request.ip ?? 'unknown');
    const raw = object(body, ['email', 'origin']);
    const address = email(raw);
    const origin = this.allowedOrigin(raw['origin']);
    this.throttle('reset', address);
    const userId = await this.identity.userIdForEmail(address);
    if (userId !== null) this.notifier.emailVerification(userId, origin);
    return { status: 'ACCEPTED' };
  }

  @Post('password/reset')
  @HttpCode(200)
  public async resetPassword(@Req() request: Request, @Body() body: unknown) {
    this.throttle('reset', request.ip ?? 'unknown');
    const raw = object(body, ['token', 'password']);
    const token = raw['token'];
    if (typeof token !== 'string') invalid('token');
    const newPassword = password(raw);
    const violation = passwordPolicyViolation(newPassword, '');
    if (violation) policyFailure(violation);
    const outcome = await this.identity.resetPassword(token, newPassword, {
      correlationId: request.correlationId,
    });
    if (outcome === 'INVALID') invalid('token', 'RESET_TOKEN_INVALID');
    return { status: 'RESET' };
  }
}

/** The seller owner invites and removes team members (orders, delivery, support only). */
@Controller('api/v1/seller/team')
@RequirePermission('seller.team.manage', { minimumAssurance: 'MFA' })
export class SellerTeamController {
  public constructor(
    @Inject(PASSWORD_IDENTITY) private readonly identity: PasswordIdentityRepository,
    @Inject(MARKETPLACE_NOTIFIER) private readonly notifier: MarketplaceNotifier,
  ) {}

  private owner(request: AuthenticatedRequest) {
    const principal = getRequestPrincipal(request);
    if (principal.actorType !== 'seller_user' || principal.scope.type !== 'SELLER') {
      throw new SafeApplicationError('FORBIDDEN');
    }
    return { sellerId: principal.scope.id, userId: principal.userId };
  }

  @Get()
  @RateLimited('authenticated', 'sellers.team.list')
  public async list(@Req() request: AuthenticatedRequest) {
    return { items: await this.identity.listTeam(this.owner(request).sellerId) };
  }

  @Post('invite')
  @HttpCode(201)
  @RateLimited('authenticated', 'sellers.team.invite')
  public async invite(@Req() request: AuthenticatedRequest & CorrelatedRequest, @Body() body: unknown) {
    const { sellerId, userId } = this.owner(request);
    const raw = object(body, ['email', 'locale']);
    const address = email(raw);
    const language = locale(raw);
    const outcome = await this.identity.inviteTeamMember(
      { sellerId, ownerId: userId, email: address, locale: language },
      { correlationId: request.correlationId },
    );
    if (outcome.status !== 'INVITED') {
      if (outcome.status === 'CONFLICT') throw new SafeApplicationError('ACCOUNT_CONFLICT');
      if (outcome.status === 'NOT_APPROVED') throw new SafeApplicationError('FORBIDDEN');
      invalid('email', 'TEAM_FULL');
    }
    const [store] = await this.identity.sellerContacts([sellerId]);
    this.notifier.sellerInvitation(address, language, store?.name ?? 'Atlas DZ', outcome.setPasswordToken);
    return { userId: outcome.userId, status: 'INVITED' };
  }

  @Post(':userId/remove')
  @HttpCode(200)
  @RateLimited('authenticated', 'sellers.team.remove')
  public async remove(
    @Req() request: AuthenticatedRequest & CorrelatedRequest,
    @Param('userId') memberId: string,
  ) {
    const { sellerId, userId } = this.owner(request);
    if (!UuidSchema.safeParse(memberId).success || memberId === userId) {
      throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    }
    const removed = await this.identity.removeTeamMember(sellerId, userId, memberId, {
      correlationId: request.correlationId,
    });
    if (!removed) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    return { status: 'REMOVED' };
  }
}

/** Any signed-in account changes its password; other devices are signed out. */
@Controller('api/v1/auth/password')
export class PasswordChangeController {
  public constructor(
    @Inject(PASSWORD_IDENTITY) private readonly identity: PasswordIdentityRepository,
    @Inject(SESSION_SELF_SERVICE) private readonly sessions: SessionSelfService,
  ) {}

  @Post('change')
  @HttpCode(200)
  @AuthenticatedOnly()
  @RateLimited('authenticated', 'identity.password.change')
  public async change(
    @Req() request: AuthenticatedRequest & CorrelatedRequest,
    @Body() body: unknown,
  ) {
    const principal = getRequestPrincipal(request);
    const actor = principal.actorType;
    if (actor !== 'customer' && actor !== 'seller_user' && actor !== 'staff')
      throw new SafeApplicationError('FORBIDDEN');
    const raw = object(body, ['currentPassword', 'password']);
    const current = raw['currentPassword'];
    if (typeof current !== 'string' || current.length < 1 || current.length > 128)
      invalid('currentPassword');
    const next = password(raw);
    if (next === current) policyFailure('PASSWORD_UNCHANGED');
    const account = await this.identity.emailForUser(principal.userId);
    if (account === null) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    const violation = passwordPolicyViolation(next, account.email);
    if (violation) policyFailure(violation);
    const outcome = await this.identity.changePassword(
      principal.userId,
      actor,
      current,
      next,
      { correlationId: request.correlationId },
    );
    if (outcome === 'INVALID_PASSWORD') throw new SafeApplicationError('INVALID_CREDENTIALS');
    const revoked = await this.sessions.revokeOtherFamilies({
      principal,
      correlation: { correlationId: request.correlationId },
    });
    return { status: 'CHANGED', signedOutDevices: revoked.counts.revokedFamilyCount };
  }
}

@Controller('api/v1/seller/account')
export class SellerAccountController {
  public constructor(
    @Inject(PASSWORD_IDENTITY) private readonly identity: PasswordIdentityRepository,
  ) {}

  @Get()
  @AuthenticatedOnly()
  public async get(@Req() request: AuthenticatedRequest) {
    const principal = getRequestPrincipal(request);
    if (principal.actorType !== 'seller_user' || principal.scope.type !== 'SELLER') {
      throw new SafeApplicationError('FORBIDDEN');
    }
    const status = await this.identity.sellerStatus(principal.scope.id);
    if (status === null) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    return {
      sellerId: principal.scope.id,
      status,
      holidayUntil: await this.identity.sellerHoliday(principal.scope.id),
      legal: await this.identity.sellerLegal(principal.scope.id),
      logoUrl: await this.identity.sellerLogo(principal.scope.id),
      role: await this.identity.sellerRole(principal.userId, principal.scope.id),
    };
  }

  /** The seller's legal identity shown to buyers (register, NIF, address, contacts). */
  @Post('legal')
  @HttpCode(200)
  @RequirePermission('offer.update', { minimumAssurance: 'MFA' })
  @RateLimited('authenticated', 'seller.account.legal')
  public async legal(
    @Req() request: AuthenticatedRequest & CorrelatedRequest,
    @Body() body: unknown,
  ) {
    const principal = getRequestPrincipal(request);
    if (principal.actorType !== 'seller_user' || principal.scope.type !== 'SELLER') {
      throw new SafeApplicationError('FORBIDDEN');
    }
    const parsed = SellerLegalSchema.safeParse(body);
    if (!parsed.success) invalid('legal', 'INVALID');
    await this.identity.setSellerLegal(principal.scope.id, parsed.data, {
      actorUserId: principal.userId,
      correlationId: request.correlationId,
    });
    return { legal: parsed.data };
  }

  /**
   * Holiday mode: `{ until }` (at most 60 days ahead) hides every offer until then; `null`
   * reopens now. Orders already received stay to be handled.
   */
  @Post('holiday')
  @HttpCode(200)
  @RequirePermission('offer.update', { minimumAssurance: 'MFA' })
  @RateLimited('authenticated', 'seller.account.holiday')
  public async holiday(
    @Req() request: AuthenticatedRequest & CorrelatedRequest,
    @Body() body: unknown,
  ) {
    const principal = getRequestPrincipal(request);
    if (principal.actorType !== 'seller_user' || principal.scope.type !== 'SELLER') {
      throw new SafeApplicationError('FORBIDDEN');
    }
    const parsed = SellerHolidayInputSchema.safeParse(body);
    if (!parsed.success) invalid('until', 'INVALID');
    const until = parsed.data.until;
    if (until !== null) {
      const at = Date.parse(until);
      if (!(at > Date.now() + 60_000) || at > Date.now() + 60 * 86_400_000) invalid('until', 'RANGE');
    }
    await this.identity.setSellerHoliday(principal.scope.id, until, {
      actorUserId: principal.userId,
      correlationId: request.correlationId,
    });
    return { holidayUntil: until };
  }
}

@Controller('api/v1/admin/sellers')
export class AdminSellersController {
  public constructor(
    @Inject(PASSWORD_IDENTITY) private readonly identity: PasswordIdentityRepository,
    @Inject(MARKETPLACE_NOTIFIER) private readonly notifier: MarketplaceNotifier,
  ) {}

  @Get()
  @RequirePermission('seller.approve', { scope: { type: 'GLOBAL' }, minimumAssurance: 'MFA' })
  @RateLimited('authenticated', 'identity.sellers.review')
  public async list(@Req() request: AuthenticatedRequest, @Query() query: Record<string, unknown>) {
    const principal = getRequestPrincipal(request);
    if (principal.actorType !== 'staff') throw new SafeApplicationError('FORBIDDEN');
    if (Object.keys(query).some((key) => key !== 'status')) {
      throw new SafeApplicationError('VALIDATION_FAILED');
    }
    return { items: await this.identity.listPendingSellers() };
  }

  @Post(':sellerId/review')
  @HttpCode(200)
  @RequirePermission('seller.approve', { scope: { type: 'GLOBAL' }, minimumAssurance: 'MFA' })
  @RateLimited('authenticated', 'identity.sellers.decide')
  public async review(
    @Req() request: AuthenticatedRequest & CorrelatedRequest,
    @Param('sellerId') sellerId: string,
    @Body() body: unknown,
  ) {
    const principal = getRequestPrincipal(request);
    if (principal.actorType !== 'staff') throw new SafeApplicationError('FORBIDDEN');
    if (!UuidSchema.safeParse(sellerId).success) {
      throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    }
    const raw = object(body, ['decision', 'reason']);
    const rawDecision = raw['decision'];
    if (rawDecision !== 'APPROVE' && rawDecision !== 'REJECT') invalid('decision');
    const decision: 'APPROVE' | 'REJECT' = rawDecision;
    const reason = raw['reason'] === undefined ? undefined : text(raw, 'reason', 1000, true);
    if (decision === 'REJECT' && reason === undefined) invalid('reason');
    const input = { decision, reason };
    const outcome = await this.identity.reviewSeller(
      {
        sellerId,
        decision: input.decision,
        reason: input.reason ?? null,
        staffUserId: principal.userId,
      },
      { correlationId: request.correlationId },
    );
    if (outcome === 'CONFLICT') throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    this.notifier.sellerReviewed(sellerId, input.decision === 'APPROVE', input.reason ?? null);
    return { sellerId, status: input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED' };
  }
}

@Controller('api/v1/account')
export class CustomerAccountController {
  public constructor(
    @Inject(PASSWORD_IDENTITY) private readonly identity: PasswordIdentityRepository,
  ) {}

  private customer(request: AuthenticatedRequest): string {
    const principal = getRequestPrincipal(request);
    if (principal.actorType !== 'customer') throw new SafeApplicationError('FORBIDDEN');
    return principal.userId;
  }

  @Get()
  @AuthenticatedOnly()
  @RateLimited('authenticated', 'identity.account.read')
  public async get(@Req() request: AuthenticatedRequest) {
    const userId = this.customer(request);
    const contact = await this.identity.emailForUser(userId);
    if (contact === null) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    return {
      email: contact.email,
      locale: contact.locale,
      emailVerified: await this.identity.isEmailVerified(userId),
    };
  }

  /** Right of access: a JSON copy of the customer's data. */
  @Get('export')
  @AuthenticatedOnly()
  @RateLimited('authenticated', 'identity.account.export')
  public async export(@Req() request: AuthenticatedRequest) {
    const data = await this.identity.exportCustomerData(this.customer(request));
    if (data === null) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    return data;
  }

  /** Right to erasure; requires the current password. */
  @Post('delete')
  @HttpCode(200)
  @AuthenticatedOnly()
  @RateLimited('authenticated', 'identity.account.delete')
  public async delete(
    @Req() request: AuthenticatedRequest & CorrelatedRequest,
    @Body() body: unknown,
  ) {
    const raw = object(body, ['password']);
    const outcome = await this.identity.deleteCustomer(this.customer(request), password(raw), {
      correlationId: request.correlationId,
    });
    if (outcome === 'INVALID_PASSWORD') throw new SafeApplicationError('INVALID_CREDENTIALS');
    if (outcome === 'OPEN_ORDERS') throw new SafeApplicationError('ACCOUNT_HAS_OPEN_ORDERS');
    return { status: 'DELETED' };
  }
}
