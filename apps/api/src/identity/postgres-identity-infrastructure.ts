import { Inject, Injectable } from '@nestjs/common';
import {
  PostgresIdentityAuthorizationRepository,
  PostgresSessionRepository,
} from '@atlas/identity-postgres';

import { SharedDatabasePool } from '../shared-database-pool.js';

@Injectable()
export class PostgresIdentityInfrastructure {
  public readonly authorization: PostgresIdentityAuthorizationRepository;
  public readonly sessions: PostgresSessionRepository;

  public constructor(@Inject(SharedDatabasePool) database: SharedDatabasePool) {
    const pool = database.pool;
    this.authorization = new PostgresIdentityAuthorizationRepository(pool);
    this.sessions = new PostgresSessionRepository(pool);
  }
}
