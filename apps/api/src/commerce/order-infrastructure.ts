import {
  PostgresOrderRepository,
  PostgresOrderNotificationRepository,
  PostgresReviewRepository,
  PostgresSupportRepository,
  PostgresStockAlertRepository,
  PostgresQuestionRepository,
  PostgresReportRepository,
  type CheckoutPolicy,
} from '@atlas/commerce';
import { Inject, Injectable } from '@nestjs/common';
import { SharedDatabasePool } from '../shared-database-pool.js';
export const ORDER_REPOSITORY = Symbol('atlas.order.repository');
export const LOCAL_CHECKOUT_POLICY = Symbol('atlas.local-checkout-policy');
export type OrderRepositoryPort = Pick<
  PostgresOrderRepository,
  | 'createQuote'
  | 'getQuote'
  | 'place'
  | 'listCustomerOrders'
  | 'hasOrderForQuote'
  | 'getCustomerOrder'
  | 'listSellerOrders'
  | 'getSellerOrder'
  | 'closeSellerOrder'
  | 'expireDue'
  | 'processSellerOrder'
  | 'confirmDelivery'
  | 'listDestinations'
  | 'sellerFees'
  | 'listSellerRates'
  | 'setSellerRate'
>;
@Injectable()
export class OrderInfrastructure {
  readonly repository: PostgresOrderRepository;
  readonly notifications: PostgresOrderNotificationRepository;
  readonly support: PostgresSupportRepository;
  readonly reviews: PostgresReviewRepository;
  readonly stockAlerts: PostgresStockAlertRepository;
  readonly questions: PostgresQuestionRepository;
  readonly reports: PostgresReportRepository;
  constructor(
    @Inject(SharedDatabasePool) database: SharedDatabasePool,
    @Inject(LOCAL_CHECKOUT_POLICY) policy: CheckoutPolicy | null,
  ) {
    const pool = database.pool;
    this.repository = new PostgresOrderRepository(pool, policy);
    this.notifications = new PostgresOrderNotificationRepository(pool);
    this.support = new PostgresSupportRepository(pool);
    this.reviews = new PostgresReviewRepository(pool);
    this.stockAlerts = new PostgresStockAlertRepository(pool);
    this.questions = new PostgresQuestionRepository(pool);
    this.reports = new PostgresReportRepository(pool);
  }
}
