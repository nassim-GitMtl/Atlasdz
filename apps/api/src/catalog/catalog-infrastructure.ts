import { PostgresCatalogRepository } from '@atlas/catalog';
import { Inject, Injectable } from '@nestjs/common';

import { SharedDatabasePool } from '../shared-database-pool.js';

export const CATALOG_REPOSITORY = Symbol('atlas.catalog.repository');
export type CatalogRepositoryPort = Pick<
  PostgresCatalogRepository,
  | 'listProducts'
  | 'getProduct'
  | 'getSeller'
  | 'createOffer'
  | 'getSellerOffer'
  | 'updateOffer'
  | 'approveOffer'
  | 'listSellerOffers'
  | 'listPendingOffers'
  | 'listProductCategories'
  | 'listOfferProducts'
  | 'listProductSubmissions'
  | 'getProductSubmission'
  | 'listPendingProducts'
  | 'submitProduct'
  | 'reviewProduct'
>;

@Injectable()
export class CatalogInfrastructure {
  public readonly repository: PostgresCatalogRepository;

  public constructor(@Inject(SharedDatabasePool) database: SharedDatabasePool) {
    const pool = database.pool;
    this.repository = new PostgresCatalogRepository(pool);
  }
}
