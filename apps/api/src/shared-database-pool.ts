import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { RuntimeConfig } from '@atlas/platform';
import { Pool } from 'pg';

import { RUNTIME_CONFIG } from './tokens.js';

/**
 * One connection pool shared by every domain repository in the API process.
 * Previously each vertical owned its own pool (up to 32 connections per instance);
 * pg pools connect lazily, so this costs nothing when all repositories are injected fakes.
 * The health check keeps its own tiny fail-fast pool on purpose.
 */
@Injectable()
export class SharedDatabasePool implements OnModuleDestroy {
  public readonly pool: Pool;

  public constructor(@Inject(RUNTIME_CONFIG) config: RuntimeConfig) {
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: config.databaseSsl ? { rejectUnauthorized: true } : false,
      max: 16,
      connectionTimeoutMillis: 1_000,
      query_timeout: 5_000,
      statement_timeout: 5_000,
      idleTimeoutMillis: 30_000,
      application_name: config.serviceName,
    });
  }

  public async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
