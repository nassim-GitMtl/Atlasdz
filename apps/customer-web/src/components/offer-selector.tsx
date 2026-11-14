'use client';

import { CheckCircle, Clock, Storefront, Truck } from '@phosphor-icons/react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import type { CatalogProduct } from '@atlas/contracts';

import { compareOffers, formatMoney, offerTotal } from '@/lib/catalog-view';
import { copy, localizedHref, type Locale } from '@/lib/i18n';
import { AddCartForm } from './cart-forms';

type Offer = CatalogProduct['offers'][number];

export function OfferSelector({
  offers,
  locale,
}: {
  readonly offers: readonly Offer[];
  readonly locale: Locale;
}) {
  const ordered = useMemo(() => [...offers].sort(compareOffers), [offers]);
  const initial = ordered.find((offer) => offer.availableQuantity > 0) ?? ordered[0];
  const [selectedId, setSelectedId] = useState(initial?.id ?? '');
  const selected = ordered.find((offer) => offer.id === selectedId) ?? initial;
  const t = copy[locale];

  if (!selected) return null;

  return (
    <section className="offer-section" aria-labelledby="offers-title">
      <div className="section-heading section-heading--compact">
        <div>
          <p className="eyebrow">{t.compareTitle}</p>
          <h2 id="offers-title">{t.compareOffers}</h2>
        </div>
        <span className="count-pill">
          {ordered.length} {ordered.length === 1 ? t.offer : t.offers}
        </span>
      </div>
      <div className="offer-list">
        {ordered.map((offer) => {
          const active = offer.id === selected.id;
          const available = offer.availableQuantity > 0;
          return (
            <label
              className={`offer-row ${active ? 'is-selected' : ''} ${available ? '' : 'is-disabled'}`}
              key={offer.id}
            >
              <input
                type="radio"
                name="selected-offer"
                value={offer.id}
                checked={active}
                disabled={!available}
                onChange={() => setSelectedId(offer.id)}
              />
              <span className="offer-check" aria-hidden="true">
                {active ? <CheckCircle size={24} weight="fill" /> : null}
              </span>
              <span className="offer-seller">
                <strong>{offer.seller.name}</strong>
                <span>
                  <Storefront aria-hidden="true" size={15} />
                  {available ? `${offer.availableQuantity} ${t.stock}` : t.unavailable}
                </span>
              </span>
              <span className="offer-meta">
                <span>
                  <Clock aria-hidden="true" size={16} />
                  {t.preparation} {offer.handlingDays} {offer.handlingDays === 1 ? t.day : t.days}
                </span>
                <span>
                  <Truck aria-hidden="true" size={16} />
                  {t.shippingAtCheckout}
                </span>
              </span>
              <strong className="offer-price" dir="ltr">
                {formatMoney(offer.priceMinor, locale)}
              </strong>
              <span className="sr-only">{active ? t.selectedOffer : t.chooseOffer}</span>
            </label>
          );
        })}
      </div>
      <aside className="selected-offer" aria-live="polite">
        <div>
          <span>{t.selectedOffer}</span>
          <strong>{selected.seller.name}</strong>
        </div>
        <div>
          <span>{t.offerTotal}</span>
          <strong dir="ltr">{formatMoney(offerTotal(selected), locale)}</strong>
        </div>
        <Link
          className="button button--primary"
          href={localizedHref(`/store/${selected.seller.slug}`, locale)}
        >
          {t.viewStore}
        </Link>
      </aside>
      <AddCartForm
        key={selected.id}
        offerId={selected.id}
        locale={locale}
        disabled={selected.availableQuantity === 0}
      />
    </section>
  );
}
