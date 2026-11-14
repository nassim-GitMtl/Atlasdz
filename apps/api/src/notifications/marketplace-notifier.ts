import type { CustomerOrder, SellerOrder } from '@atlas/contracts';
import type { Logger } from 'pino';

import type { PasswordIdentityRepository } from '../identity/password/password-identity.js';
import {
  customerOrderPlacedMail,
  customerOrderStatusMail,
  newSellerOrderMail,
  NOTIFIED_STATUSES,
  guestAccountMail,
  passwordResetMail,
  sellerReviewedMail,
  verifyEmailMail,
  type NotifiedStatus,
} from './mail-templates.js';
import { deliver, type Mailer } from './mailer.js';

export const MARKETPLACE_NOTIFIER = Symbol('atlas.marketplace-notifier');

export interface MarketplaceLinks {
  /** Public HTTPS origin of Seller Center, used in seller emails. */
  readonly sellerWebOrigin: string | null;
  /** Public HTTPS origin of the shop, used in customer emails. */
  readonly customerWebOrigin?: string | null;
}

const formatDzd = (minor: number) =>
  new Intl.NumberFormat('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    minor / 100,
  );
const formatDate = (iso: string, locale: 'fr' | 'ar') =>
  new Intl.DateTimeFormat(locale === 'ar' ? 'ar-DZ' : 'fr-DZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Algiers',
  }).format(new Date(iso));

/** Best-effort transactional email. Never throws into the request that triggered it. */
export class MarketplaceNotifier {
  public constructor(
    private readonly identity: PasswordIdentityRepository,
    private readonly mailer: Mailer,
    private readonly logger: Logger,
    private readonly links: MarketplaceLinks,
  ) {}

  public passwordReset(email: string, locale: 'fr' | 'ar', link: string): void {
    deliver(this.mailer, this.logger, passwordResetMail(email, locale, link));
  }

  /** Guest checkout: the account exists; a 7-day link lets the buyer choose a password. */
  public guestAccount(
    email: string,
    locale: 'fr' | 'ar',
    token: string,
    origin?: string | null,
  ): void {
    const base = origin ?? this.links.customerWebOrigin ?? '';
    deliver(
      this.mailer,
      this.logger,
      guestAccountMail(
        email,
        locale,
        `${base}/reset-password?token=${token}&lang=${locale}&welcome=1`,
      ),
    );
  }

  public sellerReviewed(sellerId: string, approved: boolean, reason: string | null): void {
    void this.identity
      .sellerContacts([sellerId])
      .then((contacts) => {
        for (const contact of contacts) {
          deliver(
            this.mailer,
            this.logger,
            sellerReviewedMail(contact.email, contact.locale, approved, contact.name, reason),
          );
        }
      })
      .catch(() =>
        this.logger.warn({ code: 'MAIL_LOOKUP_FAILED' }, 'seller contact lookup failed'),
      );
  }

  private shopLink(path: string, locale: 'fr' | 'ar'): string {
    return `${this.links.customerWebOrigin ?? ''}${path}?lang=${locale}`;
  }

  /** Sends a verification link unless the address is already verified. */
  public emailVerification(userId: string, origin?: string | null): void {
    void this.identity
      .createEmailVerification(userId)
      .then((created) => {
        if (created === null) return;
        const base = origin ?? this.links.customerWebOrigin ?? '';
        deliver(
          this.mailer,
          this.logger,
          verifyEmailMail(
            created.email,
            created.locale,
            `${base}/verify-email?token=${created.token}&lang=${created.locale}`,
          ),
        );
      })
      .catch(() => this.logger.warn({ code: 'MAIL_LOOKUP_FAILED' }, 'verification email failed'));
  }

  /** Customer emails for seller-driven status changes. */
  public sellerOrderChanged(order: SellerOrder): void {
    if (order.dataClass !== 'live') return;
    if (!(NOTIFIED_STATUSES as readonly string[]).includes(order.status)) return;
    const status = order.status as NotifiedStatus;
    void this.identity
      .customerForSellerOrder(order.id)
      .then((contact) => {
        if (contact === null) return;
        deliver(
          this.mailer,
          this.logger,
          customerOrderStatusMail(
            contact.email,
            contact.locale,
            status,
            order.snapshot.sellerName,
            this.shopLink(`/orders/${contact.orderId}`, contact.locale),
            status === 'SHIPPED' && order.shipment
              ? {
                  carrier: order.shipment.carrier,
                  trackingReference: order.shipment.trackingReference,
                }
              : null,
          ),
        );
      })
      .catch(() => this.logger.warn({ code: 'MAIL_LOOKUP_FAILED' }, 'customer lookup failed'));
  }

  /** Awaited by the outbox dispatcher so a failed lookup is retried. */
  public async sellerOrderExpired(sellerOrderId: string): Promise<void> {
    const contact = await this.identity.customerForSellerOrder(sellerOrderId);
    if (contact === null) return;
    await this.mailer.send(
      customerOrderStatusMail(
        contact.email,
        contact.locale,
        'EXPIRED',
        contact.sellerName,
        this.shopLink(`/orders/${contact.orderId}`, contact.locale),
        null,
      ),
    );
  }

  public ordersPlaced(order: CustomerOrder, customerId?: string): void {
    if (order.paymentState !== 'CASH_ON_DELIVERY') return;
    if (customerId !== undefined) {
      void this.identity
        .emailForUser(customerId)
        .then((contact) => {
          if (contact === null) return;
          deliver(
            this.mailer,
            this.logger,
            customerOrderPlacedMail(
              contact.email,
              contact.locale,
              this.shopLink(`/orders/${order.id}`, contact.locale),
              formatDzd(order.quote.totalMinor),
              order.sellerOrders.map((sellerOrder) => sellerOrder.snapshot.sellerName),
            ),
          );
        })
        .catch(() => this.logger.warn({ code: 'MAIL_LOOKUP_FAILED' }, 'customer lookup failed'));
    }
    const sellerOrders = order.sellerOrders;
    void this.identity
      .sellerContacts(sellerOrders.map((sellerOrder) => sellerOrder.snapshot.sellerId))
      .then((contacts) => {
        for (const sellerOrder of sellerOrders) {
          const contact = contacts.find((c) => c.sellerId === sellerOrder.snapshot.sellerId);
          if (!contact) continue;
          const link = this.links.sellerWebOrigin
            ? `${this.links.sellerWebOrigin}/orders/${sellerOrder.id}?lang=${contact.locale}`
            : `/orders/${sellerOrder.id}`;
          deliver(
            this.mailer,
            this.logger,
            newSellerOrderMail(
              contact.email,
              contact.locale,
              link,
              formatDzd(sellerOrder.snapshot.totalMinor),
              formatDate(sellerOrder.acceptanceDeadline, contact.locale),
            ),
          );
        }
      })
      .catch(() =>
        this.logger.warn({ code: 'MAIL_LOOKUP_FAILED' }, 'seller contact lookup failed'),
      );
  }
}
