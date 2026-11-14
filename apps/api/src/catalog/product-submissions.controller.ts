import {
  CatalogCategorySchema,
  CatalogEntrySchema,
  ProductSubmissionSchema,
  SubmitProductInputSchema,
  ReviewProductInputSchema,
  SafeApplicationError,
  UuidSchema,
} from '@atlas/contracts';
import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import {
  getRequestPrincipal,
  RequirePermission,
  type AuthenticatedRequest,
} from '../auth/index.js';
import type { CorrelatedRequest } from '../http-types.js';
import { RateLimited } from '../rate-limit/index.js';
import { CATALOG_REPOSITORY, type CatalogRepositoryPort } from './catalog-infrastructure.js';
import { translateWriteError } from './catalog.controller.js';

type ProductRequest = AuthenticatedRequest & CorrelatedRequest;
function seller(request: ProductRequest) {
  const p = getRequestPrincipal(request);
  if (p.actorType !== 'seller_user' || p.scope.type !== 'SELLER')
    throw new SafeApplicationError('FORBIDDEN');
  return { id: p.scope.id, userId: p.userId };
}
function staff(request: ProductRequest) {
  const p = getRequestPrincipal(request);
  if (p.actorType !== 'staff' || p.scope.type !== 'GLOBAL')
    throw new SafeApplicationError('FORBIDDEN');
  return p.userId;
}

@Controller('api/v1/seller/products')
export class SellerProductsController {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly catalog: CatalogRepositoryPort) {}
  @Get('categories')
  @RequirePermission('product.submit', { minimumAssurance: 'MFA' })
  @RateLimited('authenticated', 'catalog.products.categories')
  async categories(@Req() request: ProductRequest) {
    seller(request);
    return {
      items: CatalogCategorySchema.array().parse(await this.catalog.listProductCategories()),
    };
  }
  @Get('catalog')
  @RequirePermission('offer.read', { minimumAssurance: 'MFA' })
  @RateLimited('authenticated', 'catalog.products.select')
  async catalogProducts(@Req() request: ProductRequest) {
    seller(request);
    return { items: CatalogEntrySchema.array().parse(await this.catalog.listOfferProducts()) };
  }
  @Get()
  @RequirePermission('product.submit', { minimumAssurance: 'MFA' })
  @RateLimited('authenticated', 'catalog.products.list')
  async list(@Req() request: ProductRequest) {
    return {
      items: ProductSubmissionSchema.array().parse(
        await this.catalog.listProductSubmissions(seller(request).id),
      ),
    };
  }
  @Get(':id')
  @RequirePermission('product.submit', { minimumAssurance: 'MFA' })
  @RateLimited('authenticated', 'catalog.products.read')
  async get(@Req() request: ProductRequest, @Param('id') id: string) {
    const owner = seller(request);
    if (!UuidSchema.safeParse(id).success) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    const submission = await this.catalog.getProductSubmission(owner.id, id);
    if (!submission) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    return ProductSubmissionSchema.parse(submission);
  }
  @Post()
  @RequirePermission('product.submit', { minimumAssurance: 'MFA' })
  @RateLimited('authenticated', 'catalog.products.submit')
  async submit(@Req() request: ProductRequest, @Body() body: unknown) {
    const p = seller(request);
    const input = SubmitProductInputSchema.safeParse(body);
    if (!input.success) throw new SafeApplicationError('VALIDATION_FAILED');
    try {
      return ProductSubmissionSchema.parse(
        await this.catalog.submitProduct(p.id, input.data, {
          actorUserId: p.userId,
          correlationId: request.correlationId,
        }),
      );
    } catch (error) {
      return translateWriteError(error);
    }
  }
}

@Controller('api/v1/admin/products')
export class AdminProductsController {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly catalog: CatalogRepositoryPort) {}
  @Get('catalog')
  @RequirePermission('offer.approve', { scope: { type: 'GLOBAL' }, minimumAssurance: 'MFA' })
  @RateLimited('authenticated', 'catalog.products.offer_review')
  async catalogProducts(@Req() request: ProductRequest) {
    staff(request);
    return { items: CatalogEntrySchema.array().parse(await this.catalog.listOfferProducts()) };
  }
  @Get()
  @RequirePermission('product.review', { scope: { type: 'GLOBAL' }, minimumAssurance: 'MFA' })
  @RateLimited('authenticated', 'catalog.products.review_list')
  async list(@Req() request: ProductRequest) {
    staff(request);
    return {
      items: ProductSubmissionSchema.array().parse(await this.catalog.listPendingProducts()),
    };
  }
  @Post(':id/review')
  @RequirePermission('product.review', { scope: { type: 'GLOBAL' }, minimumAssurance: 'MFA' })
  @RateLimited('authenticated', 'catalog.products.review')
  async review(@Req() request: ProductRequest, @Param('id') id: string, @Body() body: unknown) {
    const actorUserId = staff(request);
    if (!UuidSchema.safeParse(id).success) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    const input = ReviewProductInputSchema.safeParse(body);
    if (!input.success) throw new SafeApplicationError('VALIDATION_FAILED');
    try {
      return ProductSubmissionSchema.parse(
        await this.catalog.reviewProduct(id, input.data, {
          actorUserId,
          correlationId: request.correlationId,
        }),
      );
    } catch (error) {
      return translateWriteError(error);
    }
  }
}
