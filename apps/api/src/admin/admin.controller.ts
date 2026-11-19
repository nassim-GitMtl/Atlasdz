import { IsoTimestampSchema, SafeApplicationError, UuidSchema } from '@atlas/contracts';
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';

import {
  getRequestPrincipal,
  RequirePermission,
  type AuthenticatedRequest,
} from '../auth/index.js';
import type { CorrelatedRequest } from '../http-types.js';
import { RateLimited } from '../rate-limit/index.js';
import {
  ACCOUNT_ADMIN,
  ADMIN_SERVICE,
  type AccountAdminService,
  type AdminService,
} from './admin.js';

type StaffRequest = AuthenticatedRequest & CorrelatedRequest;
const GLOBAL = { scope: { type: 'GLOBAL' as const }, minimumAssurance: 'MFA' as const };

function staff(request: StaffRequest): string {
  const principal = getRequestPrincipal(request);
  if (principal.actorType !== 'staff') throw new SafeApplicationError('FORBIDDEN');
  return principal.userId;
}
function invalid(path: string): never {
  throw new SafeApplicationError('VALIDATION_FAILED', { fields: [{ path, reason: 'INVALID' }] });
}
function body(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) invalid('body');
  const extra = Object.keys(input).find((key) => !keys.includes(key));
  if (extra) invalid(extra);
  return input as Record<string, unknown>;
}
function text(raw: Record<string, unknown>, key: string, max: number): string {
  const value = raw[key];
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > max)
    invalid(key);
  return value.trim();
}
/** An optional text field: absent or blank means none. */
function optionalText(raw: Record<string, unknown>, key: string, max: number): string | null {
  const value = raw[key];
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === ''))
    return null;
  return text(raw, key, max);
}
function uuid(value: string): string {
  if (!UuidSchema.safeParse(value).success) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
  return value;
}

@Controller('api/v1/admin')
export class AdminController {
  public constructor(@Inject(ADMIN_SERVICE) private readonly admin: AdminService) {}

  @Get('dashboard')
  @RequirePermission('marketplace.dashboard', GLOBAL)
  @RateLimited('authenticated', 'admin.dashboard')
  public async dashboard(@Req() request: StaffRequest) {
    staff(request);
    return this.admin.dashboard();
  }

  @Get('categories')
  @RequirePermission('catalog.manage', GLOBAL)
  @RateLimited('authenticated', 'admin.categories.read')
  public async categories(@Req() request: StaffRequest) {
    staff(request);
    return { items: await this.admin.listCategories() };
  }

  @Post('categories')
  @HttpCode(201)
  @RequirePermission('catalog.manage', GLOBAL)
  @RateLimited('authenticated', 'admin.categories.write')
  public async createCategory(@Req() request: StaffRequest, @Body() input: unknown) {
    const actor = staff(request);
    const raw = body(input, ['slug', 'titleFr', 'titleAr', 'titleEn']);
    const outcome = await this.admin.createCategory(
      {
        slug: text(raw, 'slug', 100),
        titleFr: text(raw, 'titleFr', 160),
        titleAr: text(raw, 'titleAr', 160),
        titleEn: optionalText(raw, 'titleEn', 160),
      },
      actor,
      request.correlationId,
    );
    if (outcome === 'INVALID') invalid('slug');
    if (outcome === 'CONFLICT') throw new SafeApplicationError('ACCOUNT_CONFLICT');
    return { status: 'CREATED' };
  }

  @Post('categories/:id')
  @HttpCode(200)
  @RequirePermission('catalog.manage', GLOBAL)
  @RateLimited('authenticated', 'admin.categories.write')
  public async updateCategory(
    @Req() request: StaffRequest,
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    const actor = staff(request);
    const raw = body(input, ['titleFr', 'titleAr', 'titleEn', 'status', 'restrictionClass']);
    const status = raw['status'];
    const restriction = raw['restrictionClass'];
    if (status !== 'ACTIVE' && status !== 'INACTIVE') invalid('status');
    if (
      restriction !== 'STANDARD' &&
      restriction !== 'REVIEW_REQUIRED' &&
      restriction !== 'PROHIBITED'
    )
      invalid('restrictionClass');
    const ok = await this.admin.updateCategory(
      uuid(id),
      {
        titleFr: text(raw, 'titleFr', 160),
        titleAr: text(raw, 'titleAr', 160),
        titleEn: optionalText(raw, 'titleEn', 160),
        status,
        restrictionClass: restriction,
      },
      actor,
      request.correlationId,
    );
    if (!ok) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    return { status: 'UPDATED' };
  }

  @Get('sellers/all')
  @RequirePermission('seller.manage', GLOBAL)
  @RateLimited('authenticated', 'admin.sellers.read')
  public async sellers(@Req() request: StaffRequest, @Query('status') status?: string) {
    staff(request);
    if (
      status !== undefined &&
      !['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED'].includes(status)
    )
      invalid('status');
    return { items: await this.admin.listSellers(status) };
  }

  @Post('sellers/:id/status')
  @HttpCode(200)
  @RequirePermission('seller.manage', GLOBAL)
  @RateLimited('authenticated', 'admin.sellers.status')
  public async sellerStatus(
    @Req() request: StaffRequest,
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    const actor = staff(request);
    const raw = body(input, ['status', 'reason']);
    const status = raw['status'];
    if (status !== 'SUSPENDED' && status !== 'APPROVED') invalid('status');
    const reason = status === 'SUSPENDED' ? text(raw, 'reason', 1000) : null;
    const ok = await this.admin.setSellerStatus(
      uuid(id),
      status,
      reason,
      actor,
      request.correlationId,
    );
    if (!ok) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    return { sellerId: id, status };
  }

  @Post('products/:id/photo/remove')
  @HttpCode(200)
  @RequirePermission('catalog.manage', GLOBAL)
  @RateLimited('authenticated', 'admin.products.photo')
  public async removePhoto(@Req() request: StaffRequest, @Param('id') id: string) {
    const actor = staff(request);
    const ok = await this.admin.removeProductPhoto(uuid(id), actor, request.correlationId);
    if (!ok) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    return { status: 'REMOVED' };
  }

  @Post('products/:id/gallery/:mediaId/remove')
  @HttpCode(200)
  @RequirePermission('catalog.manage', GLOBAL)
  @RateLimited('authenticated', 'admin.products.photo')
  public async removeGalleryPhoto(
    @Req() request: StaffRequest,
    @Param('id') id: string,
    @Param('mediaId') mediaId: string,
  ) {
    const actor = staff(request);
    const ok = await this.admin.removeGalleryPhoto(
      uuid(id),
      uuid(mediaId),
      actor,
      request.correlationId,
    );
    if (!ok) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    return { status: 'REMOVED' };
  }
}

/** Staff access to every seller and customer account, and removal of marketplace content. */
@Controller('api/v1/admin')
export class AccountAdminController {
  public constructor(@Inject(ACCOUNT_ADMIN) private readonly accounts: AccountAdminService) {}

  @Get('sellers/:id/detail')
  @RequirePermission('account.manage', GLOBAL)
  @RateLimited('authenticated', 'admin.accounts.seller')
  public async seller(@Req() request: StaffRequest, @Param('id') id: string) {
    staff(request);
    const detail = await this.accounts.sellerDetail(uuid(id));
    if (!detail) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    return detail;
  }

  @Post('sellers/:id/close')
  @HttpCode(200)
  @RequirePermission('account.manage', GLOBAL)
  @RateLimited('authenticated', 'admin.accounts.close')
  public async closeSeller(@Req() request: StaffRequest, @Param('id') id: string) {
    const actor = staff(request);
    const result = await this.accounts.closeSeller(uuid(id), actor, request.correlationId);
    if (result === null) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    if (result === 'OPEN_ORDERS') throw new SafeApplicationError('ORDER_STATE_CONFLICT');
    return { sellerId: id, status: 'CLOSED' };
  }

  @Post('offers/:id/status')
  @HttpCode(200)
  @RequirePermission('account.manage', GLOBAL)
  @RateLimited('authenticated', 'admin.accounts.offer')
  public async offerStatus(@Req() request: StaffRequest, @Param('id') id: string, @Body() input: unknown) {
    const actor = staff(request);
    const status = body(input, ['status'])['status'];
    if (status !== 'SUSPENDED' && status !== 'APPROVED') invalid('status');
    const ok = await this.accounts.setOfferStatus(uuid(id), status, actor, request.correlationId);
    if (!ok) throw new SafeApplicationError('OFFER_STATE_CONFLICT');
    return { offerId: id, status };
  }

  @Post('offers/:id/remove')
  @HttpCode(200)
  @RequirePermission('account.manage', GLOBAL)
  @RateLimited('authenticated', 'admin.accounts.offer')
  public async removeOffer(@Req() request: StaffRequest, @Param('id') id: string) {
    const actor = staff(request);
    const outcome = await this.accounts.removeOffer(uuid(id), actor, request.correlationId);
    if (outcome === null) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    return { offerId: id, outcome };
  }

  @Post('products/:id/remove')
  @HttpCode(200)
  @RequirePermission('account.manage', GLOBAL)
  @RateLimited('authenticated', 'admin.accounts.product')
  public async removeProduct(@Req() request: StaffRequest, @Param('id') id: string) {
    const actor = staff(request);
    if (!(await this.accounts.removeProduct(uuid(id), actor, request.correlationId)))
      throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    return { productId: id, status: 'REMOVED' };
  }

  @Post('reviews/:id/delete')
  @HttpCode(200)
  @RequirePermission('account.manage', GLOBAL)
  @RateLimited('authenticated', 'admin.accounts.review')
  public async deleteReview(@Req() request: StaffRequest, @Param('id') id: string) {
    const actor = staff(request);
    if (!(await this.accounts.deleteReview(uuid(id), actor, request.correlationId)))
      throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    return { reviewId: id, status: 'DELETED' };
  }

  /** Who did what, newest first: filter by area (action prefix), actor type or entity id. */
  @Get('audit')
  @RequirePermission('account.manage', GLOBAL)
  @RateLimited('authenticated', 'admin.audit.read')
  public async audit(
    @Req() request: StaffRequest,
    @Query('area') area?: string,
    @Query('actor') actor?: string,
    @Query('entity') entity?: string,
    @Query('beforeAt') beforeAt?: string,
    @Query('beforeId') beforeId?: string,
  ) {
    staff(request);
    if (area !== undefined && !/^[a-z][a-z0-9_]{1,40}$/.test(area)) invalid('area');
    if (
      actor !== undefined &&
      !['customer', 'seller_user', 'staff', 'service', 'anonymous', 'courier'].includes(actor)
    )
      invalid('actor');
    const before =
      beforeAt !== undefined || beforeId !== undefined
        ? {
            at: IsoTimestampSchema.safeParse(beforeAt).success ? (beforeAt as string) : invalid('beforeAt'),
            id: uuid(beforeId ?? ''),
          }
        : undefined;
    return this.accounts.auditLog({
      area,
      actorType: actor,
      entityId: entity === undefined || entity === '' ? undefined : uuid(entity),
      before,
    });
  }

  @Get('customers')
  @RequirePermission('account.manage', GLOBAL)
  @RateLimited('authenticated', 'admin.accounts.customers')
  public async customers(@Req() request: StaffRequest, @Query('email') email?: string) {
    staff(request);
    if (typeof email !== 'string' || email.trim().length < 3 || email.length > 254) invalid('email');
    return { items: await this.accounts.findCustomers(email.trim()) };
  }

  @Post('customers/:id/close')
  @HttpCode(200)
  @RequirePermission('account.manage', GLOBAL)
  @RateLimited('authenticated', 'admin.accounts.close')
  public async closeCustomer(@Req() request: StaffRequest, @Param('id') id: string) {
    const actor = staff(request);
    const result = await this.accounts.closeCustomer(uuid(id), actor, request.correlationId);
    if (result === null) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    if (result === 'OPEN_ORDERS') throw new SafeApplicationError('ORDER_STATE_CONFLICT');
    return { userId: id, status: 'CLOSED' };
  }
}
