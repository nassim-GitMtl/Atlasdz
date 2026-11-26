import { OrderNoteError, type PostgresOrderNoteRepository } from '@atlas/commerce';
import { AddSellerOrderNoteInputSchema, SafeApplicationError, UuidSchema } from '@atlas/contracts';
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { getRequestPrincipal, RequirePermission, type AuthenticatedRequest } from '../auth/index.js';
import type { CorrelatedRequest } from '../http-types.js';
import { RateLimited } from '../rate-limit/index.js';

export const ORDER_NOTES = Symbol('atlas.order-notes');
export type OrderNotesPort = Pick<PostgresOrderNoteRepository, 'list' | 'add'>;
type Request = AuthenticatedRequest & CorrelatedRequest;

function seller(request: Request) {
  const principal = getRequestPrincipal(request);
  if (principal.actorType !== 'seller_user' || principal.scope.type !== 'SELLER')
    throw new SafeApplicationError('FORBIDDEN');
  return { sellerId: principal.scope.id, userId: principal.userId };
}
const orderId = (value: string) => {
  if (!UuidSchema.safeParse(value).success) throw new SafeApplicationError('ORDER_NOT_FOUND');
  return value;
};

/** The seller team's private notes on one order: call attempts, confirmations, callbacks. */
@Controller('api/v1/seller/orders/:sellerOrderId/notes')
export class SellerOrderNotesController {
  public constructor(@Inject(ORDER_NOTES) private readonly notes: OrderNotesPort) {}

  @Get()
  @RequirePermission('order.read', { minimumAssurance: 'MFA' })
  @RateLimited('authenticated', 'commerce.seller_order.notes')
  public async list(@Req() req: Request, @Param('sellerOrderId') id: string) {
    const items = await this.notes.list(seller(req).sellerId, orderId(id));
    if (items === null) throw new SafeApplicationError('ORDER_NOT_FOUND');
    return { items };
  }

  @Post()
  @HttpCode(201)
  @RequirePermission('order.process', { minimumAssurance: 'MFA' })
  @RateLimited('authenticated', 'commerce.seller_order.note_add')
  public async add(@Req() req: Request, @Param('sellerOrderId') id: string, @Body() body: unknown) {
    const actor = seller(req);
    const input = AddSellerOrderNoteInputSchema.safeParse(body);
    if (!input.success) throw new SafeApplicationError('VALIDATION_FAILED');
    try {
      return await this.notes.add(actor.sellerId, orderId(id), actor.userId, input.data, req.correlationId);
    } catch (error) {
      if (error instanceof OrderNoteError)
        throw new SafeApplicationError(error.code === 'NOT_FOUND' ? 'ORDER_NOT_FOUND' : 'RATE_LIMITED');
      throw error;
    }
  }
}
