import { SafeApplicationError, UuidSchema } from '@atlas/contracts';
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';

import {
  getRequestPrincipal,
  RequirePermission,
  type AuthenticatedRequest,
} from '../auth/index.js';
import type { CorrelatedRequest } from '../http-types.js';
import { RateLimited } from '../rate-limit/index.js';
import { ADMIN_SERVICE, type AdminService } from './admin.js';

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
    const raw = body(input, ['slug', 'titleFr', 'titleAr']);
    const outcome = await this.admin.createCategory(
      {
        slug: text(raw, 'slug', 100),
        titleFr: text(raw, 'titleFr', 160),
        titleAr: text(raw, 'titleAr', 160),
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
    const raw = body(input, ['titleFr', 'titleAr', 'status', 'restrictionClass']);
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
}
