import type { CustomerOrder, SellerOrder } from '@atlas/contracts';
import type { Logger } from 'pino';

import type { PasswordIdentityRepository } from '../identity/password/password-identity.js';
import {
  customerOrderPlacedMail,
  customerOrderStatusMail,
  newSellerOrderMail,
  NOTIFIED_STATUSES,
  sellerOrderCancelledMail,
  sellerOrderReminderMail,
  guestAccountMail,
  passwordResetMail,
  sellerReviewedMail,
  verifyEmailMail,
  type NotifiedStatus,
  offerDecisionMail,
  backInStockMail,
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
const formatDate = (iso: string, locale: 'fr' | 'ar' | 'en') =>
  new Intl.DateTimeFormat(locale === 'ar' ? 'ar-DZ' : locale === 'en' ? 'en-GB' : 'fr-DZ', {
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

  public passwordReset(email: string, locale: 'fr' | 'ar' | 'en', link: string): void {
    deliver(this.mailer, this.logger, passwordResetMail(email, locale, link));
  }

  /** Guest checkout: the account exists; a 7-day link lets the buyer choose a password. */
  public guestAccount(
    email: string,
    locale: 'fr' | 'ar' | 'en',
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

  private shopLink(path: string, locale: 'fr' | 'ar' | 'en'): string {
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

  private sellerLink(sellerOrderId: string, locale: 'fr' | 'ar' | 'en'): string {
    return this.links.sellerWebOrigin
      ? `${this.links.sellerWebOrigin}/orders/${sellerOrderId}?lang=${locale}`
      : `/orders/${sellerOrderId}`;
  }

  private async sellerContact(sellerId: string) {
    return (await this.identity.sellerContacts([sellerId])).find(
      (contact) => contact.sellerId === sellerId,
    );
  }

  // The methods below are awaited by the outbox dispatcher: a failure is retried there
  // (with backoff) instead of being lost, and stays visible until it succeeds.

  /** The seller learns about a new order and its acceptance deadline. */
  public async newSellerOrder(order: SellerOrder): Promise<void> {
    const contact = await this.sellerContact(order.snapshot.sellerId);
    if (!contact) return;
    await this.mailer.send(
      newSellerOrderMail(
        contact.email,
        contact.locale,
        this.sellerLink(order.id, contact.locale),
        formatDzd(order.snapshot.totalMinor),
        formatDate(order.acceptanceDeadline, contact.locale),
      ),
    );
  }

  /** One reminder when an order still waits for the seller's answer. */
  public async sellerOrderReminder(order: SellerOrder): Promise<void> {
    const contact = await this.sellerContact(order.snapshot.sellerId);
    if (!contact) return;
    await this.mailer.send(
      sellerOrderReminderMail(
        contact.email,
        contact.locale,
        this.sellerLink(order.id, contact.locale),
        formatDzd(order.snapshot.totalMinor),
        formatDate(order.acceptanceDeadline, contact.locale),
      ),
    );
  }

  /** Staff approved (reason null) or refused one of the seller's offers. */
  public async offerDecision(
    sellerId: string,
    offerId: string,
    title: { readonly fr: string; readonly ar: string; readonly en?: string | null },
    reason: string | null,
  ): Promise<void> {
    const contact = await this.sellerContact(sellerId);
    if (!contact) return;
    const link = this.links.sellerWebOrigin
      ? `${this.links.sellerWebOrigin}/offers/${offerId}?lang=${contact.locale}`
      : `/offers/${offerId}`;
    await this.mailer.send(
      offerDecisionMail(
        contact.email,
        contact.locale,
        link,
        contact.locale === 'ar' ? title.ar : contact.locale === 'en' ? (title.en ?? title.fr) : title.fr,
        reason,
      ),
    );
  }

  /** The buyer cancelled: the seller must not prepare or ship it. */
  public async sellerOrderCancelled(order: SellerOrder): Promise<void> {
    const contact = await this.sellerContact(order.snapshot.sellerId);
    if (!contact) return;
    await this.mailer.send(
      sellerOrderCancelledMail(
        contact.email,
        contact.locale,
        this.sellerLink(order.id, contact.locale),
      ),
    );
  }

  /** The buyer's confirmation, listing every seller of the order. */
  /** A product the customer waited for is back in stock. */
  public async backInStock(
    customerId: string,
    product: { readonly slug: string; readonly title: { fr: string; ar: string; en?: string } },
  ): Promise<void> {
    const contact = await this.identity.emailForUser(customerId);
    if (contact === null) return;
    const title =
      contact.locale === 'ar'
        ? product.title.ar
        : contact.locale === 'en'
          ? (product.title.en ?? product.title.fr)
          : product.title.fr;
    await this.mailer.send(
      backInStockMail(
        contact.email,
        contact.locale,
        title,
        this.shopLink(`/product/${product.slug}`, contact.locale),
      ),
    );
  }

  public async customerOrderPlaced(order: CustomerOrder, customerId: string): Promise<void> {
    const contact = await this.identity.emailForUser(customerId);
    if (contact === null) return;
    await this.mailer.send(
      customerOrderPlacedMail(
        contact.email,
        contact.locale,
        this.shopLink(`/orders/${order.id}`, contact.locale),
        formatDzd(order.quote.totalMinor),
        order.sellerOrders.map((sellerOrder) => sellerOrder.snapshot.sellerName),
      ),
    );
  }

  /**
   * Buyer emails for seller-driven status changes (accepted, shipped, delivered…). `status` is
   * the one the event recorded: the order may have moved on before the email is sent.
   */
  public async customerOrderStatus(order: SellerOrder, eventStatus: string): Promise<void> {
    if (!(NOTIFIED_STATUSES as readonly string[]).includes(eventStatus)) return;
    const status = eventStatus as NotifiedStatus;
    const contact = await this.identity.customerForSellerOrder(order.id);
    if (contact === null) return;
    await this.mailer.send(
      customerOrderStatusMail(
        contact.email,
        contact.locale,
        status,
        order.snapshot.sellerName,
        this.shopLink(`/orders/${contact.orderId}`, contact.locale),
        status === 'SHIPPED' && order.shipment
          ? { carrier: order.shipment.carrier, trackingReference: order.shipment.trackingReference }
          : null,
      ),
    );
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
}
