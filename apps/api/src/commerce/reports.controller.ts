import { ReportError, type PostgresReportRepository } from '@atlas/commerce';
import {
  CatalogSlugSchema,
  ReportProductInputSchema,
  ResolveReportsInputSchema,
  SafeApplicationError,
  UuidSchema,
} from '@atlas/contracts';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Optional,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ACCOUNT_ADMIN, type AccountAdminService } from '../admin/admin.js';
import { getRequestPrincipal, RequirePermission, type AuthenticatedRequest } from '../auth/index.js';
import type { CorrelatedRequest } from '../http-types.js';
import { RateLimited } from '../rate-limit/index.js';

export const PRODUCT_REPORTS = Symbol('atlas.product-reports');
export type ReportsPort = Pick<PostgresReportRepository, 'report' | 'openByProduct' | 'resolve'>;
type Request = AuthenticatedRequest & CorrelatedRequest;

/** A signed-in customer reports a listing to staff (one open report per product). */
@Controller('api/v1/catalog/products/:slug/reports')
export class ProductReportsController {
  public constructor(@Inject(PRODUCT_REPORTS) private readonly reports: ReportsPort) {}

  @Post()
  @HttpCode(201)
  @RequirePermission('review.write')
  @RateLimited('authenticated', 'catalog.reports.create')
  public async report(@Req() req: Request, @Param('slug') slug: string, @Body() body: unknown) {
    const principal = getRequestPrincipal(req);
    if (principal.actorType !== 'customer' || principal.scope.type !== 'GLOBAL')
      throw new SafeApplicationError('FORBIDDEN');
    const parsedSlug = CatalogSlugSchema.safeParse(slug);
    if (!parsedSlug.success) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    const input = ReportProductInputSchema.safeParse(body);
    if (!input.success) throw new SafeApplicationError('VALIDATION_FAILED');
    try {
      await this.reports.report(principal.userId, parsedSlug.data, input.data);
    } catch (error) {
      if (error instanceof ReportError)
        throw new SafeApplicationError(error.code === 'NOT_FOUND' ? 'RESOURCE_NOT_FOUND' : 'RATE_LIMITED');
      throw error;
    }
    return { status: 'REPORTED' };
  }
}

/** Staff review reported listings: dismiss the reports or remove the product. */
@Controller('api/v1/admin/reports')
@RequirePermission('account.manage', { scope: { type: 'GLOBAL' }, minimumAssurance: 'MFA' })
export class AdminReportsController {
  public constructor(
    @Inject(PRODUCT_REPORTS) private readonly reports: ReportsPort,
    @Optional() @Inject(ACCOUNT_ADMIN) private readonly accounts: AccountAdminService | null,
  ) {}

  @Get()
  @RateLimited('authenticated', 'admin.reports.list')
  public async list() {
    return { items: await this.reports.openByProduct() };
  }

  @Post(':productId/resolve')
  @HttpCode(200)
  @RateLimited('authenticated', 'admin.reports.resolve')
  public async resolve(
    @Req() req: Request,
    @Param('productId') productId: string,
    @Body() body: unknown,
  ) {
    const principal = getRequestPrincipal(req);
    if (principal.actorType !== 'staff') throw new SafeApplicationError('FORBIDDEN');
    if (!UuidSchema.safeParse(productId).success)
      throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    const input = ResolveReportsInputSchema.safeParse(body);
    if (!input.success) throw new SafeApplicationError('VALIDATION_FAILED');
    if (input.data.action === 'REMOVE_PRODUCT') {
      if (this.accounts === null) throw new SafeApplicationError('SERVICE_UNAVAILABLE');
      // Already inactive is fine: the reports are still closed as acted upon.
      await this.accounts.removeProduct(productId, principal.userId, req.correlationId);
    }
    const closed = await this.reports.resolve(
      productId,
      input.data.action === 'DISMISS' ? 'DISMISSED' : 'ACTIONED',
      principal.userId,
      req.correlationId,
    );
    if (closed === 0) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    return { status: input.data.action === 'DISMISS' ? 'DISMISSED' : 'ACTIONED', closed };
  }
}
