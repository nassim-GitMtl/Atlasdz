import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { RuntimeConfig } from '@atlas/platform';
import { Pool } from 'pg';

import { RUNTIME_CONFIG } from './tokens.js';

export interface DatabaseHealthPort {
  check(): Promise<boolean>;
}

@Injectable()
export class PostgresDatabaseHealth implements DatabaseHealthPort, OnModuleDestroy {
  private readonly pool: Pool;

  public constructor(@Inject(RUNTIME_CONFIG) config: RuntimeConfig) {
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: config.databaseSsl ? { rejectUnauthorized: true } : false,
      max: 2,
      connectionTimeoutMillis: 500,
      query_timeout: 500,
      statement_timeout: 500,
      application_name: config.serviceName,
    });
  }

  public async check(): Promise<boolean> {
    try {
      const result = await this.pool.query<{ healthy: number }>('SELECT 1 AS healthy');
      return result.rows[0]?.healthy === 1;
    } catch {
      return false;
    }
  }

  public async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
