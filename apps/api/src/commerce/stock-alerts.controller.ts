import { StockAlertError, type PostgresStockAlertRepository } from '@atlas/commerce';
import {
  CatalogSlugSchema,
  SafeApplicationError,
  StockAlertListSchema,
  StockAlertStatusSchema,
} from '@atlas/contracts';
import { Controller, Delete, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import {
  getRequestPrincipal,
  RequirePermission,
  type AuthenticatedRequest,
} from '../auth/index.js';
import { RateLimited } from '../rate-limit/index.js';

export const STOCK_ALERTS = Symbol('atlas.stock-alerts');
export type StockAlertsPort = Pick<
  PostgresStockAlertRepository,
  'waiting' | 'subscribe' | 'unsubscribe' | 'list'
>;

function customerId(request: AuthenticatedRequest): string {
  const principal = getRequestPrincipal(request);
  if (principal.actorType !== 'customer' || principal.scope.type !== 'GLOBAL')
    throw new SafeApplicationError('FORBIDDEN');
  return principal.userId;
}

function slugOf(value: string): string {
  const parsed = CatalogSlugSchema.safeParse(value);
  if (!parsed.success) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
  return parsed.data;
}

/** Customers ask to be emailed once when a sold-out product can be bought again. */
@Controller('api/v1/stock-alerts')
export class StockAlertsController {
  public constructor(@Inject(STOCK_ALERTS) private readonly alerts: StockAlertsPort) {}

  @Get()
  @RequirePermission('cart.manage')
  @RateLimited('authenticated', 'commerce.stock_alerts.read')
  public async list(@Req() request: AuthenticatedRequest) {
    return StockAlertListSchema.parse({ items: await this.alerts.list(customerId(request)) });
  }

  @Get(':slug')
  @RequirePermission('cart.manage')
  @RateLimited('authenticated', 'commerce.stock_alerts.read')
  public async status(@Req() request: AuthenticatedRequest, @Param('slug') slug: string) {
    return StockAlertStatusSchema.parse({
      waiting: await this.alerts.waiting(customerId(request), slugOf(slug)),
    });
  }

  @Post(':slug')
  @HttpCode(201)
  @RequirePermission('cart.manage')
  @RateLimited('authenticated', 'commerce.stock_alerts.write')
  public async subscribe(@Req() request: AuthenticatedRequest, @Param('slug') slug: string) {
    try {
      await this.alerts.subscribe(customerId(request), slugOf(slug));
    } catch (error) {
      if (error instanceof StockAlertError) {
        if (error.code === 'PRODUCT_NOT_FOUND') throw new SafeApplicationError('RESOURCE_NOT_FOUND');
        // In stock: buy it now instead. Limit: too many waiting alerts.
        throw new SafeApplicationError('PRODUCT_STATE_CONFLICT');
      }
      throw error;
    }
    return StockAlertStatusSchema.parse({ waiting: true });
  }

  @Delete(':slug')
  @HttpCode(200)
  @RequirePermission('cart.manage')
  @RateLimited('authenticated', 'commerce.stock_alerts.write')
  public async unsubscribe(@Req() request: AuthenticatedRequest, @Param('slug') slug: string) {
    await this.alerts.unsubscribe(customerId(request), slugOf(slug));
    return StockAlertStatusSchema.parse({ waiting: false });
  }
}
