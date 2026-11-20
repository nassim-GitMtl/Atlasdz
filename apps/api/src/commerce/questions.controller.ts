import { QuestionError, type PostgresQuestionRepository } from '@atlas/commerce';
import {
  AnswerQuestionInputSchema,
  AskQuestionInputSchema,
  CatalogSlugSchema,
  ProductQuestionListSchema,
  SafeApplicationError,
  SellerQuestionListSchema,
  UuidSchema,
} from '@atlas/contracts';
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import {
  getRequestPrincipal,
  Public,
  RequirePermission,
  type AuthenticatedRequest,
} from '../auth/index.js';
import type { CorrelatedRequest } from '../http-types.js';
import { RateLimited } from '../rate-limit/index.js';

export const PRODUCT_QUESTIONS = Symbol('atlas.product-questions');
export type QuestionsPort = Pick<
  PostgresQuestionRepository,
  'list' | 'ask' | 'sellerList' | 'answer' | 'staffList' | 'hide'
>;
type Request = AuthenticatedRequest & CorrelatedRequest;

const slugOf = (value: string) => {
  const parsed = CatalogSlugSchema.safeParse(value);
  if (!parsed.success) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
  return parsed.data;
};
const idOf = (value: string) => {
  if (!UuidSchema.safeParse(value).success) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
  return value;
};
const mapped = async <T>(work: () => Promise<T>) => {
  try {
    return await work();
  } catch (error) {
    if (error instanceof QuestionError)
      throw new SafeApplicationError(
        error.code === 'NOT_FOUND' ? 'RESOURCE_NOT_FOUND' : 'RATE_LIMITED',
      );
    throw error;
  }
};

/** Public questions on a product; signed-in customers ask (shown without their name). */
@Controller('api/v1/catalog/products/:slug/questions')
export class ProductQuestionsController {
  public constructor(@Inject(PRODUCT_QUESTIONS) private readonly questions: QuestionsPort) {}

  @Get()
  @Public()
  public async list(@Param('slug') slug: string) {
    return ProductQuestionListSchema.parse({ items: await this.questions.list(slugOf(slug)) });
  }

  @Post()
  @HttpCode(201)
  @RequirePermission('review.write')
  @RateLimited('authenticated', 'catalog.questions.ask')
  public async ask(@Req() req: Request, @Param('slug') slug: string, @Body() body: unknown) {
    const principal = getRequestPrincipal(req);
    if (principal.actorType !== 'customer' || principal.scope.type !== 'GLOBAL')
      throw new SafeApplicationError('FORBIDDEN');
    const input = AskQuestionInputSchema.safeParse(body);
    if (!input.success) throw new SafeApplicationError('VALIDATION_FAILED');
    return mapped(() => this.questions.ask(principal.userId, slugOf(slug), input.data.body));
  }
}

/** Questions on the seller's products, to answer. */
@Controller('api/v1/seller/questions')
@RequirePermission('review.reply')
export class SellerQuestionsController {
  public constructor(@Inject(PRODUCT_QUESTIONS) private readonly questions: QuestionsPort) {}

  private seller(req: Request) {
    const principal = getRequestPrincipal(req);
    if (principal.actorType !== 'seller_user' || principal.scope.type !== 'SELLER')
      throw new SafeApplicationError('FORBIDDEN');
    return { sellerId: principal.scope.id, userId: principal.userId };
  }

  @Get()
  @RateLimited('authenticated', 'catalog.questions.seller_list')
  public async list(@Req() req: Request) {
    return SellerQuestionListSchema.parse({
      items: await this.questions.sellerList(this.seller(req).sellerId),
    });
  }

  @Post(':id/answer')
  @HttpCode(200)
  @RateLimited('authenticated', 'catalog.questions.answer')
  public async answer(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const { sellerId, userId } = this.seller(req);
    const input = AnswerQuestionInputSchema.safeParse(body);
    if (!input.success) throw new SafeApplicationError('VALIDATION_FAILED');
    await mapped(() => this.questions.answer(sellerId, userId, idOf(id), input.data.body));
    return { status: 'ANSWERED' };
  }
}

/** Staff see the latest questions and hide unsuitable ones. */
@Controller('api/v1/admin/questions')
@RequirePermission('review.moderate', { scope: { type: 'GLOBAL' }, minimumAssurance: 'MFA' })
export class AdminQuestionsController {
  public constructor(@Inject(PRODUCT_QUESTIONS) private readonly questions: QuestionsPort) {}

  @Get()
  @RateLimited('authenticated', 'catalog.questions.staff_list')
  public async list() {
    return { items: await this.questions.staffList() };
  }

  @Post(':id/hide')
  @HttpCode(200)
  @RateLimited('authenticated', 'catalog.questions.hide')
  public async hide(@Req() req: Request, @Param('id') id: string) {
    const principal = getRequestPrincipal(req);
    if (principal.actorType !== 'staff') throw new SafeApplicationError('FORBIDDEN');
    const hidden = await this.questions.hide(idOf(id), principal.userId, req.correlationId);
    if (!hidden) throw new SafeApplicationError('RESOURCE_NOT_FOUND');
    return { status: 'HIDDEN' };
  }
}
