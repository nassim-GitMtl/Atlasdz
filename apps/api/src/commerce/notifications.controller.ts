import { Body, Controller, Get, HttpCode, Inject, Post, Query, Req } from '@nestjs/common';
import { NotificationReadInputSchema, SafeApplicationError } from '@atlas/contracts';
import type { NotificationOwner, PostgresOrderNotificationRepository } from '@atlas/commerce';
import {
  getRequestPrincipal,
  RequirePermission,
  type AuthenticatedRequest,
} from '../auth/index.js';

import { RateLimited } from '../rate-limit/index.js';
export const ORDER_NOTIFICATIONS = Symbol('atlas.order.notifications');
export type NotificationRepositoryPort = Pick<
  PostgresOrderNotificationRepository,
  'list' | 'markRead'
>;

function owner(req: AuthenticatedRequest): NotificationOwner {
  const p = getRequestPrincipal(req);
  if (p.actorType === 'customer' && p.scope.type === 'GLOBAL')
    return { type: 'customer', userId: p.userId };
  if (p.actorType === 'seller_user' && p.scope.type === 'SELLER')
    return { type: 'seller_user', userId: p.userId, sellerId: p.scope.id };
  throw new SafeApplicationError('FORBIDDEN');
}

@Controller('api/v1/notifications')
@RequirePermission('order.read')
export class OrderNotificationsController {
  constructor(
    @Inject(ORDER_NOTIFICATIONS) private readonly notifications: NotificationRepositoryPort,
  ) {}

  @Get()
  @RateLimited('authenticated', 'commerce.notifications.read')
  async list(@Req() req: AuthenticatedRequest, @Query() query: unknown) {
    return this.notifications.list(owner(req), query);
  }

  @Post('read')
  @HttpCode(200)
  @RateLimited('authenticated', 'commerce.notifications.mark_read')
  async markRead(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const actor = owner(req);
    const input = NotificationReadInputSchema.safeParse(body);
    if (!input.success) throw new SafeApplicationError('VALIDATION_FAILED');
    return this.notifications.markRead(actor, input.data);
  }
}
