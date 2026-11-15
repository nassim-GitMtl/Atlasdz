import { DeliveryWriteError } from '@atlas/commerce';
import {
  DeliveryDestinationSchema,
  SafeApplicationError,
  SellerDeliveryRateSchema,
  SetSellerDeliveryRateInputSchema,
  UuidSchema,
} from '@atlas/contracts';
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import {
  Public,
  getRequestPrincipal,
  RequirePermission,
  type AuthenticatedRequest,
} from '../auth/index.js';
import type { CorrelatedRequest } from '../http-types.js';
import { RateLimited } from '../rate-limit/index.js';
import { ORDER_REPOSITORY, type OrderRepositoryPort } from './order-infrastructure.js';
type Request = AuthenticatedRequest & CorrelatedRequest;
async function mapped<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof DeliveryWriteError) throw new SafeApplicationError(error.code);
    throw error;
  }
}
function seller(req: Request) {
  const p = getRequestPrincipal(req);
  if (p.actorType !== 'seller_user' || p.scope.type !== 'SELLER')
    throw new SafeApplicationError('FORBIDDEN');
  return { sellerId: p.scope.id, actorId: p.userId };
}
@Controller('api/v1/delivery')
export class DeliveryDestinationsController {
  constructor(@Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort) {}
  /** Public reference data: shoppers pick their commune before any account exists. */
  @Get('destinations')
  @Public()
  async list() {
    return mapped(async () => ({
      items: DeliveryDestinationSchema.array().parse(await this.orders.listDestinations()),
    }));
  }
}
@Controller('api/v1/seller/delivery')
export class SellerDeliveryController {
  constructor(@Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort) {}
  @Get()
  @RequirePermission('delivery.read')
  @RateLimited('authenticated', 'commerce.seller_delivery.read')
  async list(@Req() req: Request) {
    const actor = seller(req);
    return mapped(async () => ({
      items: SellerDeliveryRateSchema.array().parse(
        await this.orders.listSellerRates(actor.sellerId),
      ),
    }));
  }
  @Post(':destinationId')
  @HttpCode(200)
  @RequirePermission('delivery.manage', { minimumAssurance: 'MFA' })
  @RateLimited('authenticated', 'commerce.seller_delivery.write')
  async set(
    @Req() req: Request,
    @Param('destinationId') destinationId: string,
    @Body() body: unknown,
  ) {
    const actor = seller(req);
    const id = UuidSchema.safeParse(destinationId);
    const input = SetSellerDeliveryRateInputSchema.safeParse(body);
    if (!id.success || !input.success) throw new SafeApplicationError('VALIDATION_FAILED');
    return mapped(async () =>
      SellerDeliveryRateSchema.parse(
        await this.orders.setSellerRate(
          actor.sellerId,
          actor.actorId,
          id.data,
          input.data,
          req.correlationId,
        ),
      ),
    );
  }
}
