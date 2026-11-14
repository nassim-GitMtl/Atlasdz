import { PostgresOutboxQueue, type OutboxClaim } from '@atlas/database';
import type { Pool } from 'pg';
import type { Logger } from 'pino';

import type { MarketplaceNotifier } from './marketplace-notifier.js';

/**
 * Drains the transactional outbox inside the API process (single-VPS deployment).
 * Events with side effects (order expiry emails) are handled; all others are acknowledged so
 * the table does not grow without bound. Failures retry with backoff, then park as FAILED.
 */
export class OutboxDispatcher {
  private readonly queue: PostgresOutboxQueue;
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;

  public constructor(
    pool: Pool,
    private readonly notifier: MarketplaceNotifier | null,
    private readonly logger: Logger,
  ) {
    this.queue = new PostgresOutboxQueue(pool, 'atlas-api-dispatcher', {
      maxAttempts: 8,
      leaseMs: 30_000,
      baseDelayMs: 5_000,
      maxDelayMs: 600_000,
    });
  }

  private async handle(claim: OutboxClaim): Promise<void> {
    if (
      claim.eventType === 'seller_order.closed' &&
      claim.data['status'] === 'EXPIRED' &&
      claim.data['dataClass'] === 'live' &&
      typeof claim.data['sellerOrderId'] === 'string'
    ) {
      await this.notifier?.sellerOrderExpired(claim.data['sellerOrderId']);
    }
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

  public start(intervalMs = 5_000): void {
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = this.drain()
        .then(() => undefined)
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
