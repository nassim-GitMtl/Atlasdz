import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Req,
} from '@nestjs/common';
import {
  RevocationResultSchema,
  SafeApplicationError,
  SessionListSchema,
  type RevocationResult,
  type SessionList,
} from '@atlas/contracts';
import type { SessionSelfService } from '@atlas/identity';

import {
  AuthenticatedOnly,
  getRequestPrincipal,
  type AuthenticatedRequest,
} from '../auth/index.js';
import type { CorrelatedRequest } from '../http-types.js';
import { RateLimited } from '../rate-limit/index.js';
import { SESSION_SELF_SERVICE } from './tokens.js';

type AuthenticatedCorrelatedRequest = AuthenticatedRequest & CorrelatedRequest;

@AuthenticatedOnly()
@Controller('api/v1/auth')
export class SessionsController {
  public constructor(@Inject(SESSION_SELF_SERVICE) private readonly sessions: SessionSelfService) {}

  @Get('sessions')
  @RateLimited('authenticated', 'identity.sessions.list')
  public async list(@Req() request: AuthenticatedCorrelatedRequest): Promise<SessionList> {
    const result = await this.sessions.listCurrentFamilies(this.context(request));

    return SessionListSchema.parse({
      sessions: result.families.map((family) => ({
        id: family.familyId,
        deviceLabel: family.deviceLabel,
        assuranceLevel: family.assuranceLevel,
        issuedAt: family.createdAt.toISOString(),
        lastSeenAt: family.lastSeenAt?.toISOString() ?? null,
        expiresAt: family.expiresAt.toISOString(),
        current: family.isCurrent,
      })),
    });
  }

  @Delete('sessions')
  @RateLimited('authenticated', 'identity.sessions.revoke_others')
  public async revokeOthers(
    @Req() request: AuthenticatedCorrelatedRequest,
  ): Promise<RevocationResult> {
    const result = await this.sessions.revokeOtherFamilies(this.context(request));
    return RevocationResultSchema.parse({ revokedCount: result.counts.revokedFamilyCount });
  }

  @Delete('sessions/:sessionId')
  @RateLimited('authenticated', 'identity.sessions.revoke_one')
  @HttpCode(HttpStatus.NO_CONTENT)
  public async revokeOne(
    @Req() request: AuthenticatedCorrelatedRequest,
    @Param('sessionId', new ParseUUIDPipe({ version: 'all', errorHttpStatusCode: 422 }))
    sessionFamilyId: string,
  ): Promise<void> {
    const result = await this.sessions.revokeFamily(this.context(request), sessionFamilyId);
    if (!result.ok) {
      throw new SafeApplicationError(result.code);
    }
  }

  private context(request: AuthenticatedCorrelatedRequest) {
    return {
      principal: getRequestPrincipal(request),
      correlation: { correlationId: request.correlationId },
    } as const;
  }
}
