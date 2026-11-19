import type { CustomerOrder, SellerOrder } from '@atlas/contracts';
import { PostgresStockAlertRepository } from '@atlas/commerce';
import { PostgresOutboxQueue, type OutboxClaim } from '@atlas/database';
import type { Pool } from 'pg';
import type { Logger } from 'pino';

import type { MarketplaceNotifier } from './marketplace-notifier.js';

/** What the dispatcher reads to build order emails (the order repository). */
export interface DispatcherOrders {
  getSellerOrder(sellerId: string, id: string): Promise<SellerOrder | null>;
  getCustomerOrder(customerId: string, id: string): Promise<CustomerOrder | null>;
}

/** Sellers get one reminder when an order still waits after this long. */
export const REMINDER_AFTER_HOURS = 6;

/**
 * Drains the transactional outbox inside the API process (single-VPS deployment).
 * Live order events become emails: new order (seller, and the buyer's confirmation), status
 * changes (buyer), buyer cancellation (seller), expiry (buyer); staff offer decisions (seller). A failed send is retried with
 * backoff, then parked as FAILED (counted on the staff dashboard and by the VPS monitor).
 */
export class OutboxDispatcher {
  private readonly queue: PostgresOutboxQueue;
  private readonly stockAlerts: PostgresStockAlertRepository;
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;

  public constructor(
    private readonly pool: Pool,
    private readonly notifier: MarketplaceNotifier | null,
    private readonly logger: Logger,
    private readonly orders: DispatcherOrders,
  ) {
    this.stockAlerts = new PostgresStockAlertRepository(pool);
    this.queue = new PostgresOutboxQueue(pool, 'atlas-api-dispatcher', {
      maxAttempts: 8,
      leaseMs: 30_000,
      baseDelayMs: 5_000,
      maxDelayMs: 600_000,
    });
  }

  /** Staff approved or refused an offer: the seller is told, with the reason when refused. */
  private async offerDecision(claim: OutboxClaim): Promise<void> {
    const { offerId, sellerId, reason } = claim.data;
    if (this.notifier === null || typeof offerId !== 'string' || typeof sellerId !== 'string')
      return;
    const title = await this.pool.query<{ fr: string; ar: string; en: string | null }>(
      `SELECT p.title_fr AS fr, p.title_ar AS ar, p.title_en AS en
       FROM offers.offers o JOIN catalog.products p ON p.id = o.product_id WHERE o.id = $1`,
      [offerId],
    );
    const row = title.rows[0];
    if (!row) return;
    const refusal = claim.eventType === 'offer.rejected' && typeof reason === 'string' ? reason : null;
    await this.notifier.offerDecision(sellerId, offerId, row, refusal);
  }

  /**
   * An offer went live or changed: customers waiting for its product are emailed once it can
   * be bought. Each alert is closed after its email, so a retry never repeats a sent one.
   */
  private async backInStock(claim: OutboxClaim): Promise<void> {
    const { offerId } = claim.data;
    if (this.notifier === null || typeof offerId !== 'string') return;
    for (const alert of await this.stockAlerts.dueForOffer(offerId)) {
      await this.notifier.backInStock(alert.customerId, alert);
      await this.stockAlerts.markNotified(alert.id);
    }
  }

  private async handle(claim: OutboxClaim): Promise<void> {
    if (claim.eventType === 'offer.activated' || claim.eventType === 'offer.updated')
      await this.backInStock(claim);
    if (claim.eventType === 'offer.activated' || claim.eventType === 'offer.rejected') {
      await this.offerDecision(claim);
      return;
    }
    if (claim.eventType === 'offer.updated') return;
    const { sellerOrderId, sellerId, orderId, status, dataClass } = claim.data;
    if (
      this.notifier === null ||
      dataClass !== 'live' ||
      typeof sellerOrderId !== 'string' ||
      typeof sellerId !== 'string'
    )
      return;
    if (claim.eventType === 'seller_order.routed') {
      const sellerOrder = await this.orders.getSellerOrder(sellerId, sellerOrderId);
      if (sellerOrder) await this.notifier.newSellerOrder(sellerOrder);
      // The buyer's confirmation lists every seller: sent once, with the order's first part.
      const first = await this.pool.query<{ customer_id: string; first: boolean }>(
        `SELECT o.customer_id,
           (SELECT min(s2.id::text) FROM commerce.seller_orders s2 WHERE s2.order_id = so.order_id)
             = so.id::text AS first
         FROM commerce.seller_orders so JOIN commerce.orders o ON o.id = so.order_id
         WHERE so.id = $1`,
        [sellerOrderId],
      );
      const row = first.rows[0];
      if (row?.first && typeof orderId === 'string') {
        const order = await this.orders.getCustomerOrder(row.customer_id, orderId);
        if (order) await this.notifier.customerOrderPlaced(order, row.customer_id);
      }
      return;
    }
    if (claim.eventType !== 'seller_order.progressed' && claim.eventType !== 'seller_order.closed')
      return;
    if (status === 'EXPIRED') {
      await this.notifier.sellerOrderExpired(sellerOrderId);
      return;
    }
    const sellerOrder = await this.orders.getSellerOrder(sellerId, sellerOrderId);
    if (!sellerOrder) return;
    if (status === 'CANCELLED') await this.notifier.sellerOrderCancelled(sellerOrder);
    else if (typeof status === 'string')
      await this.notifier.customerOrderStatus(sellerOrder, status);
  }

  public async drain(): Promise<number> {
    const claims = await this.queue.claim(20);
    for (const claim of claims) {
      try {
        await this.handle(claim);
        await this.queue.acknowledge(claim);
      } catch {
        this.logger.warn(
          { code: 'OUTBOX_HANDLER_FAILED', eventType: claim.eventType },
          'outbox retry',
        );
        await this.queue.fail(claim, 'BROKER_UNAVAILABLE', true);
      }
    }
    return claims.length;
  }

  /**
   * One reminder per live order still awaiting the seller after REMINDER_AFTER_HOURS (and
   * before its deadline). The row is claimed first, and released if the email fails.
   */
  public async remind(afterHours = REMINDER_AFTER_HOURS): Promise<number> {
    if (this.notifier === null) return 0;
    const due = await this.pool.query<{ id: string; seller_id: string }>(
      `SELECT so.id, so.seller_id FROM commerce.seller_orders so
       JOIN commerce.orders o ON o.id = so.order_id
       WHERE so.status = 'AWAITING_SELLER' AND o.payment_state = 'CASH_ON_DELIVERY'
         AND so.created_at < clock_timestamp() - make_interval(hours => $1)
         AND so.acceptance_deadline > clock_timestamp()
         AND NOT EXISTS (SELECT 1 FROM commerce.seller_order_reminders r WHERE r.seller_order_id = so.id)
       ORDER BY so.created_at LIMIT 20`,
      [afterHours],
    );
    let sent = 0;
    for (const row of due.rows) {
      const claimed = await this.pool.query(
        `INSERT INTO commerce.seller_order_reminders (seller_order_id) VALUES ($1)
         ON CONFLICT DO NOTHING`,
        [row.id],
      );
      if (claimed.rowCount !== 1) continue;
      try {
        const order = await this.orders.getSellerOrder(row.seller_id, row.id);
        if (order?.status === 'AWAITING_SELLER') await this.notifier.sellerOrderReminder(order);
        sent += 1;
      } catch {
        await this.pool.query(
          'DELETE FROM commerce.seller_order_reminders WHERE seller_order_id = $1',
          [row.id],
        );
        this.logger.warn({ code: 'REMINDER_FAILED' }, 'seller reminder failed; will retry');
      }
    }
    return sent;
  }

  public start(intervalMs = 5_000): void {
    let ticks = 0;
    this.timer = setInterval(() => {
      if (this.running) return;
      ticks += 1;
      // Reminders are checked every minute; the outbox every tick.
      const work = async () => {
        await this.drain();
        if (ticks % Math.max(1, Math.round(60_000 / intervalMs)) === 0) await this.remind();
      };
      this.running = work()
        .catch(() => this.logger.warn({ code: 'OUTBOX_DRAIN_FAILED' }, 'outbox drain failed'))
        .finally(() => {
          this.running = undefined;
        });
    }, intervalMs);
    this.timer.unref();
  }

  public async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
}
