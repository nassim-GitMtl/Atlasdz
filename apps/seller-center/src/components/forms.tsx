'use client';

import { useActionState } from 'react';
import type { CatalogEntry, SellerOffer } from '@atlas/contracts';
import {
  approveOfferAction,
  createOfferAction,
  updateOfferAction,
  loginAction,
} from '@/app/actions';
import { copy, type Locale } from '@/lib/i18n';
import { emptyOfferValues } from '@/lib/offer-input';

export function OfferForm({
  products,
  locale,
  offer,
  preselectedProductId = '',
}: {
  readonly products: readonly CatalogEntry[];
  readonly locale: Locale;
  readonly offer?: SellerOffer;
  readonly preselectedProductId?: string;
}) {
  const [state, action, pending] = useActionState(
    offer ? updateOfferAction : createOfferAction,
    {},
  );
  const t = copy[locale];
  const values =
    state.values ??
    (offer
      ? {
          productId: offer.productId,
          price: (offer.priceMinor / 100).toFixed(2),
          quantity: String(offer.availableQuantity),
          handlingDays: String(offer.handlingDays),
          deliveryFee: (offer.deliveryFeeMinor / 100).toFixed(2),
        }
      : { ...emptyOfferValues, productId: preselectedProductId });
  return (
    <form action={action} className="offer-form">
      <input type="hidden" name="lang" value={locale} />
      {offer && (
        <>
          <input type="hidden" name="offerId" value={offer.id} />
          <input type="hidden" name="version" value={offer.rowVersion} />
          <p className="notice">{t.editHelp}</p>
        </>
      )}
      {state.error && (
        <p className="notice error" role="alert">
          {t[state.error]}
        </p>
      )}
      {!offer && (
        <div className="field">
          <label htmlFor="productId">{t.product}</label>
          <select id="productId" name="productId" required defaultValue={values.productId}>
            <option value="">{t.selectProduct}</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.title[locale]}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="price">{t.price}</label>
          <input
            id="price"
            name="price"
            type="text"
            inputMode="decimal"
            required
            maxLength={11}
            defaultValue={values.price}
            placeholder="12500"
            aria-describedby="price-help"
          />
          <small id="price-help">{t.priceHelp}</small>
        </div>
        <div className="field">
          <label htmlFor="quantity">{t.quantity}</label>
          <input
            id="quantity"
            name="quantity"
            type="number"
            min="0"
            max="1000000"
            step="1"
            required
            defaultValue={values.quantity}
            placeholder="25"
            aria-describedby="quantity-help"
          />
          <small id="quantity-help">{t.quantityHelp}</small>
        </div>
        <div className="field">
          <label htmlFor="handlingDays">{t.handling}</label>
          <input
            id="handlingDays"
            name="handlingDays"
            type="number"
            min="0"
            max="30"
            step="1"
            required
            defaultValue={values.handlingDays}
            placeholder="2"
            aria-describedby="handling-help"
          />
          <small id="handling-help">{t.handlingHelp}</small>
        </div>
        {!offer && (
          <div className="field">
            <label htmlFor="deliveryFee">{t.delivery}</label>
            <input
              id="deliveryFee"
              name="deliveryFee"
              type="text"
              inputMode="decimal"
              required
              maxLength={11}
              defaultValue={values.deliveryFee}
              placeholder="500"
              aria-describedby="delivery-help"
            />
            <small id="delivery-help">{t.deliveryHelp}</small>
          </div>
        )}
      </div>
      <div className="form-footer">
        <button
          className="button"
          type="submit"
          disabled={pending || (!offer && products.length === 0)}
        >
          {pending ? t.submitting : offer ? t.saveOffer : t.submit}
          <span aria-hidden="true">↗</span>
        </button>
      </div>
      {offer && state.error === 'conflict' && (
        <a href={`/offers/${offer.id}?lang=${locale}`}>{t.reloadOffer}</a>
      )}
    </form>
  );
}

export function LocalLoginForm({
  locale,
  account,
}: {
  readonly locale: Locale;
  readonly account: 'seller' | 'admin';
}) {
  const [state, action, pending] = useActionState(loginAction, {});
  const t = copy[locale];
  return (
    <form action={action}>
      <input type="hidden" name="lang" value={locale} />
      <input type="hidden" name="account" value={account} />
      {state.error && (
        <p className="notice error" role="alert">
          {t[state.error]}
        </p>
      )}
      <button
        className={account === 'seller' ? 'button full' : 'button secondary full'}
        type="submit"
        disabled={pending}
      >
        {pending ? t.submitting : account === 'seller' ? t.sellerLogin : t.adminLogin}
      </button>
    </form>
  );
}

export function ApproveForm({
  locale,
  offerId,
}: {
  readonly locale: Locale;
  readonly offerId: string;
}) {
  const [state, action, pending] = useActionState(approveOfferAction, {});
  const t = copy[locale];
  return (
    <form action={action}>
      <input type="hidden" name="lang" value={locale} />
      <input type="hidden" name="offerId" value={offerId} />
      {state.error && (
        <p className="notice error" role="alert">
          {t[state.error]}
        </p>
      )}
      <button className="button small" type="submit" disabled={pending}>
        {pending ? t.approving : t.approve}
        <span aria-hidden="true">✓</span>
      </button>
    </form>
  );
}
