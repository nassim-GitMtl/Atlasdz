import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { SafeApplicationError, UuidSchema } from '@atlas/contracts';
import type { PostgresSupportRepository, SupportOwner } from '@atlas/commerce';
import {
  getRequestPrincipal,
  RequirePermission,
  type AuthenticatedRequest,
} from '../auth/index.js';
import type { CorrelatedRequest } from '../http-types.js';
import { RateLimited } from '../rate-limit/index.js';
export const ORDER_SUPPORT = Symbol('atlas.order.support');
export type SupportRepositoryPort = Pick<
  PostgresSupportRepository,
  'list' | 'get' | 'forOrder' | 'create' | 'act'
>;
type Request = AuthenticatedRequest & CorrelatedRequest;
function owner(req: Request, staff = false): SupportOwner {
  const p = getRequestPrincipal(req);
  if (staff && p.actorType === 'staff' && p.scope.type === 'GLOBAL')
    return { type: 'staff', userId: p.userId };
  if (!staff && p.actorType === 'customer' && p.scope.type === 'GLOBAL')
    return { type: 'customer', userId: p.userId };
  if (!staff && p.actorType === 'seller_user' && p.scope.type === 'SELLER')
    return { type: 'seller_user', userId: p.userId, sellerId: p.scope.id };
  throw new SafeApplicationError('FORBIDDEN');
}
function id(value: string) {
  const result = UuidSchema.safeParse(value);
  if (!result.success) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
  return result.data;
}

@Controller('api/v1/support')
@RequirePermission('support.manage')
export class SupportController {
  constructor(@Inject(ORDER_SUPPORT) private readonly support: SupportRepositoryPort) {}
  @Get()
  @RateLimited('authenticated', 'commerce.support.list')
  list(@Req() req: Request, @Query() query: unknown) {
    return this.support.list(owner(req), query);
  }
  @Get('order/:sellerOrderId')
  @RateLimited('authenticated', 'commerce.support.order')
  async forOrder(@Req() req: Request, @Param('sellerOrderId') orderId: string) {
    return { detail: await this.support.forOrder(owner(req), id(orderId)) };
  }
  @Get(':caseId')
  @RateLimited('authenticated', 'commerce.support.read')
  get(@Req() req: Request, @Param('caseId') caseId: string, @Query() query: unknown) {
    return this.support.get(owner(req), id(caseId), query);
  }
  @Post()
  @RateLimited('authenticated', 'commerce.support.create')
  create(@Req() req: Request, @Body() body: unknown) {
    return this.support.create(owner(req), body, req.correlationId);
  }
  @Post(':caseId')
  @HttpCode(200)
  @RateLimited('authenticated', 'commerce.support.update')
  act(@Req() req: Request, @Param('caseId') caseId: string, @Body() body: unknown) {
    return this.support.act(owner(req), id(caseId), body, req.correlationId);
  }
}

@Controller('api/v1/admin/support')
@RequirePermission('support.escalations', { scope: { type: 'GLOBAL' }, minimumAssurance: 'MFA' })
export class AdminSupportController {
  constructor(@Inject(ORDER_SUPPORT) private readonly support: SupportRepositoryPort) {}
  @Get()
  @RateLimited('authenticated', 'commerce.support.escalations')
  list(@Req() req: Request, @Query() query: unknown) {
    return this.support.list(owner(req, true), query);
  }
  @Get(':caseId')
  @RateLimited('authenticated', 'commerce.support.escalation_read')
  get(@Req() req: Request, @Param('caseId') caseId: string, @Query() query: unknown) {
    return this.support.get(owner(req, true), id(caseId), query);
  }
  @Post(':caseId')
  @HttpCode(200)
  @RateLimited('authenticated', 'commerce.support.escalation_update')
  act(@Req() req: Request, @Param('caseId') caseId: string, @Body() body: unknown) {
    return this.support.act(owner(req, true), id(caseId), body, req.correlationId);
  }
}
