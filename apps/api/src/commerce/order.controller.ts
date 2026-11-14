import { DeliveryWriteError, OrderWriteError } from '@atlas/commerce';
import {
  CheckoutQuoteSchema,
  CloseSellerOrderInputSchema,
  CreateCheckoutQuoteInputSchema,
  CustomerOrderSchema,
  SafeApplicationError,
  SellerOrderSchema,
  type SellerOrder,
  RejectSellerOrderInputSchema,
  ProcessSellerOrderInputSchema,
  UuidSchema,
} from '@atlas/contracts';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Optional,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  MARKETPLACE_NOTIFIER,
  type MarketplaceNotifier,
} from '../notifications/marketplace-notifier.js';
import {
  getRequestPrincipal,
  RequirePermission,
  type AuthenticatedRequest,
} from '../auth/index.js';
import type { CorrelatedRequest } from '../http-types.js';
import { RateLimited } from '../rate-limit/index.js';
import {
  LOCAL_CHECKOUT_POLICY,
  ORDER_REPOSITORY,
  type OrderRepositoryPort,
} from './order-infrastructure.js';
import type { CheckoutPolicy } from '@atlas/commerce';
import { PASSWORD_IDENTITY } from '../identity/password/auth.controller.js';
import type { PasswordIdentityRepository } from '../identity/password/password-identity.js';
import { COD_RISK, type CodRiskService } from './cod-risk.js';
type OrderRequest = AuthenticatedRequest & CorrelatedRequest;
const id = (value: string) => {
  const parsed = UuidSchema.safeParse(value);
  if (!parsed.success) throw new SafeApplicationError('ORDER_NOT_FOUND');
  return parsed.data;
};
function customer(request: OrderRequest) {
  const p = getRequestPrincipal(request);
  if (p.actorType !== 'customer' || p.scope.type !== 'GLOBAL')
    throw new SafeApplicationError('FORBIDDEN');
  return p.userId;
}
function seller(request: OrderRequest) {
  const p = getRequestPrincipal(request);
  if (p.actorType !== 'seller_user' || p.scope.type !== 'SELLER')
    throw new SafeApplicationError('FORBIDDEN');
  return { userId: p.userId, sellerId: p.scope.id };
}
async function mapped<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof OrderWriteError || error instanceof DeliveryWriteError)
      throw new SafeApplicationError(error.code);
    throw error;
  }
}

@Controller('api/v1/checkout/quotes')
export class CheckoutController {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort,
    @Optional()
    @Inject(MARKETPLACE_NOTIFIER)
    private readonly notifier: MarketplaceNotifier | null = null,
    @Optional()
    @Inject(PASSWORD_IDENTITY)
    private readonly identity: PasswordIdentityRepository | null = null,
    @Optional()
    @Inject(LOCAL_CHECKOUT_POLICY)
    private readonly policy: CheckoutPolicy | null = null,
    @Optional()
    @Inject(COD_RISK)
    private readonly risk: CodRiskService | null = null,
  ) {}
  @Post()
  @RequirePermission('order.create')
  @RateLimited('authenticated', 'commerce.quote.create')
  async create(@Req() req: OrderRequest, @Body() body: unknown) {
    const owner = customer(req);
    const input = CreateCheckoutQuoteInputSchema.safeParse(body);
    if (!input.success) throw new SafeApplicationError('VALIDATION_FAILED');
    return mapped(async () =>
      CheckoutQuoteSchema.parse(
        await this.orders.createQuote(
          owner,
          input.data.expectedCartVersion,
          input.data.destinationId,
          input.data.deliveryContact,
        ),
      ),
    );
  }
  @Get(':quoteId')
  @RequirePermission('order.create')
  @RateLimited('authenticated', 'commerce.quote.read')
  async get(@Req() req: OrderRequest, @Param('quoteId') quoteId: string) {
    const quote = await this.orders.getQuote(customer(req), id(quoteId));
    if (!quote) throw new SafeApplicationError('ORDER_NOT_FOUND');
    return CheckoutQuoteSchema.parse(quote);
  }
  @Post(':quoteId/place')
  @HttpCode(200)
  @RequirePermission('order.create')
  @RateLimited('authenticated', 'commerce.order.place')
  async place(
    @Req() req: OrderRequest,
    @Param('quoteId') quoteId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: unknown,
  ) {
    const owner = customer(req);
    const quote = id(quoteId);
    // Server-issued quote ID is the stable retry key. A new key cannot duplicate one quote.
    if (
      key !== quote ||
      typeof body !== 'object' ||
      body === null ||
      Array.isArray(body) ||
      Object.keys(body).length !== 0
    )
      throw new SafeApplicationError('VALIDATION_FAILED');
    // Live cash-on-delivery orders require a confirmed email address (anti-fraud).
    if (
      this.policy?.environment === 'live' &&
      this.identity !== null &&
      !(await this.identity.isEmailVerified(owner))
    ) {
      throw new SafeApplicationError('EMAIL_NOT_VERIFIED');
    }
    // Retries of an already-placed quote return the existing order without re-checking limits
    // or sending the order emails again.
    const placed =
      this.policy?.environment === 'live' &&
      (await this.orders.listCustomerOrders(owner)).some((existing) => existing.quote.id === quote);
    if (this.policy?.environment === 'live' && this.risk !== null) {
      const pending = await this.orders.getQuote(owner, quote);
      if (pending !== null && !placed) {
        const decision = await this.risk.evaluate(owner, pending.deliveryContact?.phone ?? null);
        if (decision === 'BLOCKED') throw new SafeApplicationError('COD_BLOCKED');
        if (decision === 'PHONE_NOT_VERIFIED') throw new SafeApplicationError('PHONE_NOT_VERIFIED');
        if (decision === 'LIMIT_REACHED') throw new SafeApplicationError('COD_LIMIT_REACHED');
      }
    }
    const order = await mapped(async () =>
      CustomerOrderSchema.parse(await this.orders.place(owner, quote, req.correlationId)),
    );
    if (!placed) this.notifier?.ordersPlaced(order, owner);
    return order;
  }
}
@Controller('api/v1/orders')
export class CustomerOrdersController {
  constructor(@Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort) {}
  @Post('seller-orders/:sellerOrderId/confirm-delivery')
  @HttpCode(200)
  @RequirePermission('order.confirm_delivery')
  @RateLimited('authenticated', 'commerce.order.confirm_delivery')
  async confirmDelivery(
    @Req() req: OrderRequest,
    @Param('sellerOrderId') sellerOrderId: string,
    @Body() body: unknown,
  ) {
    const owner = customer(req);
    const input = CloseSellerOrderInputSchema.safeParse(body);
    if (!input.success) throw new SafeApplicationError('VALIDATION_FAILED');
    return mapped(async () =>
      SellerOrderSchema.parse(
        await this.orders.confirmDelivery({
          sellerOrderId: id(sellerOrderId),
          customerId: owner,
          expectedVersion: input.data.expectedVersion,
          correlationId: req.correlationId,
        }),
      ),
    );
  }
  @Get()
  @RequirePermission('order.read')
  @RateLimited('authenticated', 'commerce.orders.read')
  async list(@Req() req: OrderRequest) {
    return {
      items: CustomerOrderSchema.array().parse(await this.orders.listCustomerOrders(customer(req))),
    };
  }
  @Get(':orderId')
  @RequirePermission('order.read')
  @RateLimited('authenticated', 'commerce.order.read')
  async get(@Req() req: OrderRequest, @Param('orderId') orderId: string) {
    const order = await this.orders.getCustomerOrder(customer(req), id(orderId));
    if (!order) throw new SafeApplicationError('ORDER_NOT_FOUND');
    return CustomerOrderSchema.parse(order);
  }
  @Post('seller-orders/:sellerOrderId/cancel')
  @HttpCode(200)
  @RequirePermission('order.cancel')
  @RateLimited('authenticated', 'commerce.order.cancel')
  async cancel(
    @Req() req: OrderRequest,
    @Param('sellerOrderId') sellerOrderId: string,
    @Body() body: unknown,
  ) {
    const owner = customer(req);
    const input = CloseSellerOrderInputSchema.safeParse(body);
    if (!input.success) throw new SafeApplicationError('VALIDATION_FAILED');
    return mapped(async () =>
      SellerOrderSchema.parse(
        await this.orders.closeSellerOrder({
          sellerOrderId: id(sellerOrderId),
          actor: { type: 'customer', id: owner },
          expectedVersion: input.data.expectedVersion,
          reason: 'CUSTOMER_CANCELLED',
          correlationId: req.correlationId,
        }),
      ),
    );
  }
}
@Controller('api/v1/seller/orders')
export class SellerOrdersController {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepositoryPort,
    @Optional()
    @Inject(MARKETPLACE_NOTIFIER)
    private readonly notifier: MarketplaceNotifier | null = null,
    @Optional()
    @Inject(COD_RISK)
    private readonly risk: CodRiskService | null = null,
  ) {}
  @Get(':sellerOrderId/customer-signal')
  @RequirePermission('order.read', { minimumAssurance: 'MFA' })
  @RateLimited('authenticated', 'commerce.seller_order.signal')
  async signal(@Req() req: OrderRequest, @Param('sellerOrderId') sellerOrderId: string) {
    if (this.risk === null) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    const result = await this.risk.customerSignal(seller(req).sellerId, id(sellerOrderId));
    if (result === null) throw new SafeApplicationError('ORDER_NOT_FOUND');
    return result;
  }
  private notify(order: SellerOrder): SellerOrder {
    this.notifier?.sellerOrderChanged(order);
    return order;
  }
  @Post(':sellerOrderId/transition')
  @HttpCode(200)
  @RequirePermission('order.process', { minimumAssurance: 'MFA' })
  @RateLimited('authenticated', 'commerce.seller_order.process')
  async process(
    @Req() req: OrderRequest,
    @Param('sellerOrderId') sellerOrderId: string,
    @Body() body: unknown,
  ) {
    const actor = seller(req);
    const command = ProcessSellerOrderInputSchema.safeParse(body);
    if (!command.success) throw new SafeApplicationError('VALIDATION_FAILED');
    return mapped(async () =>
      this.notify(
        SellerOrderSchema.parse(
          await this.orders.processSellerOrder({
            sellerOrderId: id(sellerOrderId),
            sellerId: actor.sellerId,
            actorId: actor.userId,
            command: command.data,
            correlationId: req.correlationId,
          }),
        ),
      ),
    );
  }
  @Get()
  @RequirePermission('order.read', { minimumAssurance: 'MFA' })
  @RateLimited('authenticated', 'commerce.seller_orders.read')
  async list(@Req() req: OrderRequest) {
    return {
      items: SellerOrderSchema.array().parse(
        await this.orders.listSellerOrders(seller(req).sellerId),
      ),
    };
  }
  @Get(':sellerOrderId')
  @RequirePermission('order.read', { minimumAssurance: 'MFA' })
  @RateLimited('authenticated', 'commerce.seller_order.read')
  async get(@Req() req: OrderRequest, @Param('sellerOrderId') sellerOrderId: string) {
    const order = await this.orders.getSellerOrder(seller(req).sellerId, id(sellerOrderId));
    if (!order) throw new SafeApplicationError('ORDER_NOT_FOUND');
    return SellerOrderSchema.parse(order);
  }
  @Post(':sellerOrderId/reject')
  @HttpCode(200)
  @RequirePermission('order.reject', { minimumAssurance: 'MFA' })
  @RateLimited('authenticated', 'commerce.seller_order.reject')
  async reject(
    @Req() req: OrderRequest,
    @Param('sellerOrderId') sellerOrderId: string,
    @Body() body: unknown,
  ) {
    const actor = seller(req);
    const input = RejectSellerOrderInputSchema.safeParse(body);
    if (!input.success) throw new SafeApplicationError('VALIDATION_FAILED');
    return mapped(async () =>
      SellerOrderSchema.parse(
        await this.orders.closeSellerOrder({
          sellerOrderId: id(sellerOrderId),
          actor: { type: 'seller_user', id: actor.userId },
          scopeId: actor.sellerId,
          expectedVersion: input.data.expectedVersion,
          reason: 'SELLER_REJECTED',
          rejectionReason: input.data.reasonCode,
          correlationId: req.correlationId,
        }),
      ),
    ).then((order) => this.notify(order));
  }
}
