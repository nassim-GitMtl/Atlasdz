import { SafeApplicationError, UuidSchema } from '@atlas/contracts';
import { Controller, Get, HttpCode, Inject, Param, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';

import {
  getRequestPrincipal,
  Public,
  RequirePermission,
  type AuthenticatedRequest,
} from '../auth/index.js';
import type { CorrelatedRequest } from '../http-types.js';
import { RateLimited } from '../rate-limit/index.js';
import {
  contentTypeFor,
  detectImage,
  MAX_IMAGE_BYTES,
  MEDIA_SERVICE,
  normalizeImage,
  WEBP,
  type ProductMediaService,
} from './media.js';

/** The seller behind a photo request, after checking the product id. */
function sellerFor(request: AuthenticatedRequest, productId: string) {
  const principal = getRequestPrincipal(request);
  if (principal.actorType !== 'seller_user' || principal.scope.type !== 'SELLER') {
    throw new SafeApplicationError('FORBIDDEN');
  }
  if (!UuidSchema.safeParse(productId).success) {
    throw new SafeApplicationError('RESOURCE_NOT_FOUND');
  }
  return { sellerId: principal.scope.id, userId: principal.userId };
}

/** Validates a raw image body and re-encodes it (the declared type is never trusted). */
async function uploadedImage(body: unknown) {
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw new SafeApplicationError('UNSUPPORTED_MEDIA_TYPE');
  }
  if (body.length > MAX_IMAGE_BYTES) throw new SafeApplicationError('PAYLOAD_TOO_LARGE');
  if (detectImage(body) === null) throw new SafeApplicationError('UNSUPPORTED_MEDIA_TYPE');
  const normalized = await normalizeImage(body);
  if (normalized === null) throw new SafeApplicationError('UNSUPPORTED_MEDIA_TYPE');
  return normalized;
}

@Controller('api/v1/seller/products/:productId/image')
export class SellerProductImageController {
  public constructor(@Inject(MEDIA_SERVICE) private readonly media: ProductMediaService) {}

  /** Raw image body (image/jpeg, image/png or image/webp), at most 5 MiB. */
  @Post()
  @HttpCode(201)
  @RequirePermission('product.submit', { minimumAssurance: 'MFA' })
  @RateLimited('authenticated', 'catalog.products.photo')
  public async upload(
    @Req() request: AuthenticatedRequest & CorrelatedRequest,
    @Param('productId') productId: string,
  ) {
    const principal = getRequestPrincipal(request);
    if (principal.actorType !== 'seller_user' || principal.scope.type !== 'SELLER') {
      throw new SafeApplicationError('FORBIDDEN');
    }
    if (!UuidSchema.safeParse(productId).success) {
      throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    }
    const normalized = await uploadedImage(request.body);
    const result = await this.media.attach({
      productId,
      sellerId: principal.scope.id,
      userId: principal.userId,
      bytes: normalized.large,
      smallBytes: normalized.small,
      image: WEBP,
      correlationId: request.correlationId,
    });
    if (result.outcome === 'NOT_FOUND') throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    if (result.outcome === 'SELLER_NOT_APPROVED') throw new SafeApplicationError('FORBIDDEN');
    return { productId, imageUrl: result.imageUrl };
  }
}

@Controller('api/v1/seller/products/:productId/image/remove')
export class SellerProductImageRemoveController {
  public constructor(@Inject(MEDIA_SERVICE) private readonly media: ProductMediaService) {}

  @Post()
  @HttpCode(200)
  @RequirePermission('product.submit', { minimumAssurance: 'MFA' })
  @RateLimited('authenticated', 'catalog.products.photo')
  public async remove(
    @Req() request: AuthenticatedRequest & CorrelatedRequest,
    @Param('productId') productId: string,
  ) {
    const principal = getRequestPrincipal(request);
    if (principal.actorType !== 'seller_user' || principal.scope.type !== 'SELLER') {
      throw new SafeApplicationError('FORBIDDEN');
    }
    if (!UuidSchema.safeParse(productId).success) {
      throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    }
    const removed = await this.media.removeOwnPhoto(
      productId,
      principal.scope.id,
      principal.userId,
      request.correlationId,
    );
    if (!removed) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    return { productId, imageUrl: '/assets/product-placeholder.svg' };
  }
}

/** Extra product photos (after the cover): add, remove, or make one the cover. */
@Controller('api/v1/seller/products/:productId/gallery')
export class SellerProductGalleryController {
  public constructor(@Inject(MEDIA_SERVICE) private readonly media: ProductMediaService) {}

  /** Raw image body (image/jpeg, image/png or image/webp), at most 5 MiB. */
  @Post()
  @HttpCode(201)
  @RequirePermission('product.submit', { minimumAssurance: 'MFA' })
  @RateLimited('authenticated', 'catalog.products.photo')
  public async add(
    @Req() request: AuthenticatedRequest & CorrelatedRequest,
    @Param('productId') productId: string,
  ) {
    const { sellerId, userId } = sellerFor(request, productId);
    const normalized = await uploadedImage(request.body);
    const result = await this.media.attach({
      productId,
      sellerId,
      userId,
      bytes: normalized.large,
      smallBytes: normalized.small,
      image: WEBP,
      correlationId: request.correlationId,
      gallery: true,
    });
    if (result.outcome === 'NOT_FOUND') throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    if (result.outcome === 'SELLER_NOT_APPROVED') throw new SafeApplicationError('FORBIDDEN');
    if (result.outcome === 'LIMIT_REACHED') throw new SafeApplicationError('PHOTO_LIMIT_REACHED');
    return { productId, photo: { id: result.mediaId, url: result.imageUrl } };
  }

  @Post(':mediaId/remove')
  @HttpCode(200)
  @RequirePermission('product.submit', { minimumAssurance: 'MFA' })
  @RateLimited('authenticated', 'catalog.products.photo')
  public async remove(
    @Req() request: AuthenticatedRequest & CorrelatedRequest,
    @Param('productId') productId: string,
    @Param('mediaId') mediaId: string,
  ) {
    const { sellerId, userId } = sellerFor(request, productId);
    if (!UuidSchema.safeParse(mediaId).success) {
      throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    }
    const removed = await this.media.removeGalleryPhoto({
      productId,
      mediaId,
      sellerId,
      userId,
      correlationId: request.correlationId,
    });
    if (removed === null) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    return { productId, mediaId };
  }

  @Post(':mediaId/cover')
  @HttpCode(200)
  @RequirePermission('product.submit', { minimumAssurance: 'MFA' })
  @RateLimited('authenticated', 'catalog.products.photo')
  public async cover(
    @Req() request: AuthenticatedRequest & CorrelatedRequest,
    @Param('productId') productId: string,
    @Param('mediaId') mediaId: string,
  ) {
    const { sellerId, userId } = sellerFor(request, productId);
    if (!UuidSchema.safeParse(mediaId).success) {
      throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    }
    const imageUrl = await this.media.makeCover({
      productId,
      mediaId,
      sellerId,
      userId,
      correlationId: request.correlationId,
    });
    if (imageUrl === null) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    return { productId, imageUrl };
  }
}

@Controller('media')
@Public()
export class MediaController {
  public constructor(@Inject(MEDIA_SERVICE) private readonly media: ProductMediaService) {}

  @Get(':file')
  public serve(@Param('file') file: string, @Res() response: Response): void {
    const path = this.media.filePath(file);
    if (path === null) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    response.setHeader('Content-Type', contentTypeFor(file));
    // File names are random and never reused, so responses can be cached forever.
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    // Photos uploaded before small variants existed are served at full size instead.
    const variantOf = /^(.+)-640(\.\w+)$/.exec(file);
    const fallback = variantOf ? this.media.filePath(`${variantOf[1]}${variantOf[2]}`) : null;
    const send = (target: string, next: string | null): void => {
      response.sendFile(target, { dotfiles: 'deny', headers: {} }, (error?: Error) => {
        if (!error || response.headersSent) return;
        if (next !== null) return send(next, null);
        response.setHeader('Cache-Control', 'no-store');
        response.status(404).json({ code: 'RESOURCE_NOT_FOUND' });
      });
    };
    send(path, fallback);
  }
}
