import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { SafeApplicationError } from '@atlas/contracts';
import type { PostgresReviewRepository, ReviewActor } from '@atlas/commerce';
import {
  getRequestPrincipal,
  Public,
  RequirePermission,
  type AuthenticatedRequest,
} from '../auth/index.js';
import type { CorrelatedRequest } from '../http-types.js';
import { RateLimited } from '../rate-limit/index.js';

export const ORDER_REVIEWS = Symbol('atlas.order.reviews');
export type ReviewRepositoryPort = Pick<
  PostgresReviewRepository,
  | 'forProduct'
  | 'forSeller'
  | 'forOrder'
  | 'write'
  | 'remove'
  | 'sellerList'
  | 'reply'
  | 'staffList'
  | 'moderate'
>;
type Request = AuthenticatedRequest & CorrelatedRequest;

function actor(req: Request, expected: ReviewActor['type']): ReviewActor {
  const p = getRequestPrincipal(req);
  if (expected === 'customer' && p.actorType === 'customer' && p.scope.type === 'GLOBAL')
    return { type: 'customer', userId: p.userId };
  if (expected === 'seller_user' && p.actorType === 'seller_user' && p.scope.type === 'SELLER')
    return { type: 'seller_user', userId: p.userId, sellerId: p.scope.id };
  if (expected === 'staff' && p.actorType === 'staff' && p.scope.type === 'GLOBAL')
    return { type: 'staff', userId: p.userId };
  throw new SafeApplicationError('FORBIDDEN');
}

/** What shoppers read on product and shop pages. */
@Controller('api/v1/catalog')
@Public()
export class CatalogReviewsController {
  constructor(@Inject(ORDER_REVIEWS) private readonly reviews: ReviewRepositoryPort) {}
  @Get('products/:slug/reviews')
  product(@Param('slug') slug: string, @Query() query: unknown) {
    return this.reviews.forProduct(slug, query);
  }
  @Get('sellers/:slug/reviews')
  seller(@Param('slug') slug: string, @Query() query: unknown) {
    return this.reviews.forSeller(slug, query);
  }
}

@Controller('api/v1/reviews')
@RequirePermission('review.write')
export class CustomerReviewsController {
  constructor(@Inject(ORDER_REVIEWS) private readonly reviews: ReviewRepositoryPort) {}
  @Get('order/:sellerOrderId')
  @RateLimited('authenticated', 'commerce.reviews.order')
  forOrder(@Req() req: Request, @Param('sellerOrderId') sellerOrderId: string) {
    return this.reviews.forOrder(actor(req, 'customer'), sellerOrderId);
  }
  @Put('order/:sellerOrderId/:productId')
  @RateLimited('authenticated', 'commerce.reviews.write')
  write(
    @Req() req: Request,
    @Param('sellerOrderId') sellerOrderId: string,
    @Param('productId') productId: string,
    @Body() body: unknown,
  ) {
    return this.reviews.write(
      actor(req, 'customer'),
      sellerOrderId,
      productId,
      body,
      req.correlationId,
    );
  }
  @Delete('order/:sellerOrderId/:productId')
  @RateLimited('authenticated', 'commerce.reviews.delete')
  remove(
    @Req() req: Request,
    @Param('sellerOrderId') sellerOrderId: string,
    @Param('productId') productId: string,
    @Query() query: unknown,
  ) {
    return this.reviews.remove(
      actor(req, 'customer'),
      sellerOrderId,
      productId,
      query,
      req.correlationId,
    );
  }
}

@Controller('api/v1/seller/reviews')
@RequirePermission('review.reply')
export class SellerReviewsController {
  constructor(@Inject(ORDER_REVIEWS) private readonly reviews: ReviewRepositoryPort) {}
  @Get()
  @RateLimited('authenticated', 'commerce.reviews.seller_list')
  list(@Req() req: Request, @Query() query: unknown) {
    return this.reviews.sellerList(actor(req, 'seller_user'), query);
  }
  @Post(':reviewId/reply')
  @HttpCode(200)
  @RateLimited('authenticated', 'commerce.reviews.reply')
  reply(@Req() req: Request, @Param('reviewId') reviewId: string, @Body() body: unknown) {
    return this.reviews.reply(actor(req, 'seller_user'), reviewId, body, req.correlationId);
  }
}

@Controller('api/v1/admin/reviews')
@RequirePermission('review.moderate', { scope: { type: 'GLOBAL' }, minimumAssurance: 'MFA' })
export class AdminReviewsController {
  constructor(@Inject(ORDER_REVIEWS) private readonly reviews: ReviewRepositoryPort) {}
  @Get()
  @RateLimited('authenticated', 'commerce.reviews.staff_list')
  list(@Req() req: Request, @Query() query: unknown) {
    return this.reviews.staffList(actor(req, 'staff'), query);
  }
  @Post(':reviewId')
  @HttpCode(200)
  @RateLimited('authenticated', 'commerce.reviews.moderate')
  moderate(@Req() req: Request, @Param('reviewId') reviewId: string, @Body() body: unknown) {
    return this.reviews.moderate(actor(req, 'staff'), reviewId, body, req.correlationId);
  }
}
