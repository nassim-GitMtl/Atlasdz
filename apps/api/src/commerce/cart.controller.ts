import { CartWriteError } from '@atlas/commerce';
import {
  CustomerCartSchema,
  SafeApplicationError,
  SetCartItemInputSchema,
  UuidSchema,
} from '@atlas/contracts';
import { Body, Controller, Get, Inject, Param, Put, Req } from '@nestjs/common';
import {
  getRequestPrincipal,
  RequirePermission,
  type AuthenticatedRequest,
} from '../auth/index.js';
import { RateLimited } from '../rate-limit/index.js';
import { CART_REPOSITORY, type CartRepositoryPort } from './cart-infrastructure.js';

function customerId(request: AuthenticatedRequest): string {
  const principal = getRequestPrincipal(request);
  if (principal.actorType !== 'customer' || principal.scope.type !== 'GLOBAL')
    throw new SafeApplicationError('FORBIDDEN');
  return principal.userId;
}

@Controller('api/v1/cart')
export class CartController {
  constructor(@Inject(CART_REPOSITORY) private readonly carts: CartRepositoryPort) {}

  @Get()
  @RequirePermission('cart.manage')
  @RateLimited('authenticated', 'commerce.cart.read')
  async get(@Req() request: AuthenticatedRequest) {
    return CustomerCartSchema.parse(await this.carts.getCart(customerId(request)));
  }

  @Put('items/:offerId')
  @RequirePermission('cart.manage')
  @RateLimited('authenticated', 'commerce.cart.write')
  async set(
    @Req() request: AuthenticatedRequest,
    @Param('offerId') offerId: string,
    @Body() body: unknown,
  ) {
    const owner = customerId(request);
    const id = UuidSchema.safeParse(offerId);
    const input = SetCartItemInputSchema.safeParse(body);
    if (!id.success || !input.success) throw new SafeApplicationError('VALIDATION_FAILED');
    try {
      return CustomerCartSchema.parse(await this.carts.setItem(owner, id.data, input.data));
    } catch (error) {
      if (error instanceof CartWriteError) throw new SafeApplicationError(error.code);
      throw error;
    }
  }
}
