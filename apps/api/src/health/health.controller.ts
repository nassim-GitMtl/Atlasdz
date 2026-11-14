import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { HealthResponse } from '@atlas/contracts';
import type { RuntimeConfig } from '@atlas/platform';
import type { Response } from 'express';

import { Public } from '../auth/index.js';
import type { DatabaseHealthPort } from '../database-health.js';
import { currentRequestContext } from '../request-context.js';
import { DATABASE_HEALTH, RUNTIME_CONFIG } from '../tokens.js';
import { ReadinessState } from './readiness-state.js';

@Public()
@Controller('health')
export class HealthController {
  public constructor(
    @Inject(RUNTIME_CONFIG) private readonly config: RuntimeConfig,
    @Inject(DATABASE_HEALTH) private readonly database: DatabaseHealthPort,
    private readonly readiness: ReadinessState,
  ) {}

  @Get('live')
  public live(): HealthResponse {
    return this.response('ok');
  }

  @Get('ready')
  public async ready(@Res({ passthrough: true }) response: Response): Promise<HealthResponse> {
    const databaseReady = !this.readiness.isDraining() && (await this.database.check());
    if (!databaseReady) {
      response.status(503);
      return this.response('not_ready', { postgres: 'down' });
    }

    return this.response('ok', { postgres: 'up' });
  }

  private response(
    status: HealthResponse['status'],
    dependencies?: HealthResponse['dependencies'],
  ): HealthResponse {
    const correlationId = currentRequestContext()?.correlationId;
    if (correlationId === undefined) {
      throw new Error('Request context is unavailable');
    }

    return {
      status,
      service: this.config.serviceName,
      timestamp: new Date().toISOString(),
      correlationId,
      ...(dependencies === undefined ? {} : { dependencies }),
    };
  }
}
