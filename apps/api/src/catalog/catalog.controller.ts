import { CatalogWriteError } from '@atlas/catalog';
import {
  CatalogCategoryListSchema,
  CatalogProductListSchema,
  CatalogProductSchema,
  CatalogSellerSchema,
  CatalogSlugSchema,
  CreateOfferInputSchema,
  ListProductsInputSchema,
  SafeApplicationError,
  RejectOfferInputSchema,
  SellerOfferSchema,
  UpdateOfferInputSchema,
  UuidSchema,
} from '@atlas/contracts';
import { Body, Controller, Get, Inject, Param, Post, Query, Req } from '@nestjs/common';

import {
  getRequestPrincipal,
  Public,
  RequirePermission,
  type AuthenticatedRequest,
} from '../auth/index.js';
import type { CorrelatedRequest } from '../http-types.js';
import { RateLimited } from '../rate-limit/index.js';
import { CATALOG_REPOSITORY, type CatalogRepositoryPort } from './catalog-infrastructure.js';

type CatalogRequest = AuthenticatedRequest & CorrelatedRequest;

const validSlug = (value: string): string => {
  const result = CatalogSlugSchema.safeParse(value);
  if (!result.success) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
  return result.data;
};

export const translateWriteError = (error: unknown): never => {
  if (!(error instanceof CatalogWriteError)) throw error;
  switch (error.code) {
    case 'PRODUCT_STATE_CONFLICT':
      throw new SafeApplicationError('PRODUCT_STATE_CONFLICT');
    case 'SELLER_NOT_APPROVED':
      throw new SafeApplicationError('FORBIDDEN');
    case 'OFFER_NOT_FOUND':
    case 'PRODUCT_NOT_AVAILABLE':
      throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    case 'OFFER_NOT_PENDING':
    case 'OFFER_STATE_CONFLICT':
    case 'OFFER_ALREADY_EXISTS':
      throw new SafeApplicationError('OFFER_STATE_CONFLICT');
    case 'OFFER_INVALID':
      throw new SafeApplicationError('VALIDATION_FAILED');
  }
};

@Controller('api/v1/catalog')
@Public()
export class CatalogController {
  public constructor(@Inject(CATALOG_REPOSITORY) private readonly catalog: CatalogRepositoryPort) {}

  @Get('products')
  public async list(@Query() query: Record<string, unknown>) {
    const number = (key: string) =>
      typeof query[key] === 'string' ? { [key]: Number(query[key]) } : {};
    const parsed = ListProductsInputSchema.safeParse({
      ...query,
      ...number('limit'),
      ...number('page'),
      ...(query['available'] === undefined ? {} : { available: query['available'] === 'true' }),
    });
    if (!parsed.success) throw new SafeApplicationError('VALIDATION_FAILED');
    return CatalogProductListSchema.parse(await this.catalog.listProducts(parsed.data));
  }

  @Get('categories')
  public async categories() {
    return CatalogCategoryListSchema.parse(await this.catalog.listCategories());
  }

  @Get('products/:slug')
  public async product(@Param('slug') slug: string) {
    const product = await this.catalog.getProduct(validSlug(slug));
    if (product === null) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    return CatalogProductSchema.parse(product);
  }

  @Get('sellers/:slug')
  public async seller(@Param('slug') slug: string) {
    const seller = await this.catalog.getSeller(validSlug(slug));
    if (seller === null) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    return CatalogSellerSchema.parse(seller);
  }
}

@Controller('api/v1/seller/offers')
export class SellerOffersController {
  public constructor(@Inject(CATALOG_REPOSITORY) private readonly catalog: CatalogRepositoryPort) {}

  @Get(':offerId')
  @RequirePermission('offer.read', { minimumAssurance: 'MFA' })
  @RateLimited('authenticated', 'catalog.offers.read')
  public async get(@Req() request: CatalogRequest, @Param('offerId') offerId: string) {
    const p = getRequestPrincipal(request);
    if (p.actorType !== 'seller_user' || p.scope.type !== 'SELLER')
      throw new SafeApplicationError('FORBIDDEN');
    if (!UuidSchema.safeParse(offerId).success)
      throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    const offer = await this.catalog.getSellerOffer(p.scope.id, offerId);
    if (!offer) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    return SellerOfferSchema.parse(offer);
  }

  @Post(':offerId')
  @RequirePermission('offer.update', { minimumAssurance: 'MFA' })
  @RateLimited('authenticated', 'catalog.offers.update')
  public async update(
    @Req() request: CatalogRequest,
    @Param('offerId') offerId: string,
    @Body() body: unknown,
  ) {
    const p = getRequestPrincipal(request);
    if (p.actorType !== 'seller_user' || p.scope.type !== 'SELLER')
      throw new SafeApplicationError('FORBIDDEN');
    if (!UuidSchema.safeParse(offerId).success)
      throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    const data = UpdateOfferInputSchema.safeParse(body);
    if (!data.success) throw new SafeApplicationError('VALIDATION_FAILED');
    try {
      return SellerOfferSchema.parse(
        await this.catalog.updateOffer(p.scope.id, offerId, data.data, {
          actorUserId: p.userId,
          correlationId: request.correlationId,
        }),
      );
    } catch (error) {
      return translateWriteError(error);
    }
  }

  @Get()
  @RequirePermission('offer.read', { minimumAssurance: 'MFA' })
  @RateLimited('authenticated', 'catalog.offers.list')
  public async list(@Req() request: CatalogRequest) {
    const principal = getRequestPrincipal(request);
    if (principal.actorType !== 'seller_user' || principal.scope.type !== 'SELLER') {
      throw new SafeApplicationError('FORBIDDEN');
    }
    return {
      items: SellerOfferSchema.array().parse(
        await this.catalog.listSellerOffers(principal.scope.id),
      ),
    };
  }

  @Post()
  @RequirePermission('offer.create', { minimumAssurance: 'MFA' })
  @RateLimited('authenticated', 'catalog.offers.create')
  public async create(@Req() request: CatalogRequest, @Body() body: unknown) {
    const principal = getRequestPrincipal(request);
    if (principal.actorType !== 'seller_user' || principal.scope.type !== 'SELLER') {
      throw new SafeApplicationError('FORBIDDEN');
    }
    const input = CreateOfferInputSchema.safeParse(body);
    if (!input.success) throw new SafeApplicationError('VALIDATION_FAILED');
    try {
      return SellerOfferSchema.parse(
        await this.catalog.createOffer(principal.scope.id, input.data, {
          actorUserId: principal.userId,
          correlationId: request.correlationId,
        }),
      );
    } catch (error) {
      return translateWriteError(error);
    }
  }
}

@Controller('api/v1/admin/offers')
export class AdminOffersController {
  public constructor(@Inject(CATALOG_REPOSITORY) private readonly catalog: CatalogRepositoryPort) {}

  @Get()
  @RequirePermission('offer.approve', { scope: { type: 'GLOBAL' }, minimumAssurance: 'MFA' })
  @RateLimited('authenticated', 'catalog.offers.review')
  public async list(@Req() request: CatalogRequest, @Query() query: Record<string, unknown>) {
    const principal = getRequestPrincipal(request);
    if (principal.actorType !== 'staff' || principal.scope.type !== 'GLOBAL') {
      throw new SafeApplicationError('FORBIDDEN');
    }
    if (
      Object.keys(query).some((key) => key !== 'status') ||
      (query['status'] !== undefined && query['status'] !== 'PENDING_REVIEW')
    ) {
      throw new SafeApplicationError('VALIDATION_FAILED');
    }
    return { items: SellerOfferSchema.array().parse(await this.catalog.listPendingOffers()) };
  }

  @Post(':offerId/approve')
  @RequirePermission('offer.approve', { scope: { type: 'GLOBAL' }, minimumAssurance: 'MFA' })
  @RateLimited('authenticated', 'catalog.offers.approve')
  public async approve(@Req() request: CatalogRequest, @Param('offerId') offerId: string) {
    const principal = getRequestPrincipal(request);
    if (principal.actorType !== 'staff' || principal.scope.type !== 'GLOBAL') {
      throw new SafeApplicationError('FORBIDDEN');
    }
    if (!UuidSchema.safeParse(offerId).success)
      throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    try {
      return SellerOfferSchema.parse(
        await this.catalog.approveOffer(principal.userId, offerId, request.correlationId),
      );
    } catch (error) {
      return translateWriteError(error);
    }
  }

  @Post(':offerId/reject')
  @RequirePermission('offer.approve', { scope: { type: 'GLOBAL' }, minimumAssurance: 'MFA' })
  @RateLimited('authenticated', 'catalog.offers.reject')
  public async reject(
    @Req() request: CatalogRequest,
    @Param('offerId') offerId: string,
    @Body() body: unknown,
  ) {
    const principal = getRequestPrincipal(request);
    if (principal.actorType !== 'staff' || principal.scope.type !== 'GLOBAL') {
      throw new SafeApplicationError('FORBIDDEN');
    }
    if (!UuidSchema.safeParse(offerId).success)
      throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    const input = RejectOfferInputSchema.safeParse(body);
    if (!input.success) throw new SafeApplicationError('VALIDATION_FAILED');
    try {
      return SellerOfferSchema.parse(
        await this.catalog.rejectOffer(
          principal.userId,
          offerId,
          input.data.reason,
          request.correlationId,
        ),
      );
    } catch (error) {
      return translateWriteError(error);
    }
  }
}
