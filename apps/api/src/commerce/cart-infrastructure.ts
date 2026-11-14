import { PostgresCartRepository } from '@atlas/commerce';
import { Inject, Injectable } from '@nestjs/common';
import { SharedDatabasePool } from '../shared-database-pool.js';

export const CART_REPOSITORY = Symbol('atlas.cart.repository');
export type CartRepositoryPort = Pick<PostgresCartRepository, 'getCart' | 'setItem'>;
@Injectable()
export class CartInfrastructure {
  readonly repository: PostgresCartRepository;
  constructor(@Inject(SharedDatabasePool) database: SharedDatabasePool) {
    const pool = database.pool;
    this.repository = new PostgresCartRepository(pool);
  }
}
