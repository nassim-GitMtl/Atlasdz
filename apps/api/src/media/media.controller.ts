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
    const body: unknown = request.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new SafeApplicationError('UNSUPPORTED_MEDIA_TYPE');
    }
    if (body.length > MAX_IMAGE_BYTES) throw new SafeApplicationError('PAYLOAD_TOO_LARGE');
    if (detectImage(body) === null) throw new SafeApplicationError('UNSUPPORTED_MEDIA_TYPE');
    const normalized = await normalizeImage(body);
    if (normalized === null) throw new SafeApplicationError('UNSUPPORTED_MEDIA_TYPE');
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
