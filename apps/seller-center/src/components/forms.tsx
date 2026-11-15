'use client';

import { useActionState, useState } from 'react';
import type { CatalogEntry, SellerOffer } from '@atlas/contracts';
import {
  approveOfferAction,
  rejectOfferAction,
  createOfferAction,
  updateOfferAction,
  loginAction,
} from '@/app/actions';
import { copy, type Locale } from '@/lib/i18n';
import { emptyOfferValues } from '@/lib/offer-input';

const promoCopy = {
  fr: {
    title: 'Promotion',
    label: 'Prix promotionnel sur une période',
    help: 'Plus bas que votre prix habituel, 90 jours au plus. Les clients voient les deux prix et la date de fin.',
    price: 'Prix promotionnel (DZD)',
    start: 'Premier jour',
    end: 'Dernier jour',
  },
  ar: {
    title: 'تخفيض',
    label: 'سعر مخفض لفترة محددة',
    help: 'أقل من سعرك المعتاد، 90 يومًا كحد أقصى. يرى الزبائن السعرين وتاريخ الانتهاء.',
    price: 'السعر المخفض (دج)',
    start: 'اليوم الأول',
    end: 'اليوم الأخير',
  },
} as const;
/** yyyy-mm-dd of an instant in Algiers time (UTC+1, no daylight saving). */
const algiersDay = (iso: string) => new Date(Date.parse(iso) + 3_600_000).toISOString().slice(0, 10);

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
          preorder: offer.preorder ? 'yes' : '',
          preorderMin: offer.preorder ? String(offer.preorder.minDays) : '',
          preorderMax: offer.preorder ? String(offer.preorder.maxDays) : '',
          preorderOrigin: offer.preorder?.origin ?? '',
          promo: offer.promotion ? 'yes' : '',
          promoPrice: offer.promotion ? (offer.promotion.priceMinor / 100).toFixed(2) : '',
          promoStart: offer.promotion ? algiersDay(offer.promotion.startsAt) : '',
          promoEnd: offer.promotion ? algiersDay(offer.promotion.endsAt) : '',
        }
      : { ...emptyOfferValues, productId: preselectedProductId });
  const [preorder, setPreorder] = useState(values.preorder === 'yes');
  const [promo, setPromo] = useState(values.promo === 'yes');
  const p = promoCopy[locale];
  const preorderMin = values.preorderMin ?? '';
  const preorderMax = values.preorderMax ?? '';
  const preorderOrigin = values.preorderOrigin ?? '';
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
        <fieldset className="field preorder-fields">
          <legend>{t.preorder}</legend>
          <label htmlFor="preorder">
            <input
              id="preorder"
              name="preorder"
              type="checkbox"
              value="yes"
              checked={preorder}
              onChange={(event) => setPreorder(event.target.checked)}
            />{' '}
            {t.preorderLabel}
          </label>
          <small>{t.preorderHelp}</small>
          {preorder && (
            <>
              <label htmlFor="preorderMin">{t.preorderMin}</label>
              <input
                id="preorderMin"
                name="preorderMin"
                type="number"
                min="1"
                max="180"
                step="1"
                required
                defaultValue={preorderMin}
                placeholder="20"
              />
              <label htmlFor="preorderMax">{t.preorderMax}</label>
              <input
                id="preorderMax"
                name="preorderMax"
                type="number"
                min="1"
                max="180"
                step="1"
                required
                defaultValue={preorderMax}
                placeholder="35"
              />
              <label htmlFor="preorderOrigin">{t.preorderOrigin}</label>
              <input
                id="preorderOrigin"
                name="preorderOrigin"
                type="text"
                maxLength={60}
                defaultValue={preorderOrigin}
                placeholder={t.preorderOriginExample}
              />
            </>
          )}
        </fieldset>
        <fieldset className="field preorder-fields">
          <legend>{p.title}</legend>
          <label htmlFor="promo">
            <input
              id="promo"
              name="promo"
              type="checkbox"
              value="yes"
              checked={promo}
              onChange={(event) => setPromo(event.target.checked)}
            />{' '}
            {p.label}
          </label>
          <small>{p.help}</small>
          {promo && (
            <>
              <label htmlFor="promoPrice">{p.price}</label>
              <input
                id="promoPrice"
                name="promoPrice"
                type="text"
                inputMode="decimal"
                required
                defaultValue={values.promoPrice ?? ''}
              />
              <label htmlFor="promoStart">{p.start}</label>
              <input id="promoStart" name="promoStart" type="date" required defaultValue={values.promoStart ?? ''} />
              <label htmlFor="promoEnd">{p.end}</label>
              <input id="promoEnd" name="promoEnd" type="date" required defaultValue={values.promoEnd ?? ''} />
            </>
          )}
        </fieldset>
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

const refuseCopy = {
  fr: { refuse: 'Refuser…', reason: 'Motif envoyé au vendeur (5 à 300 caractères)', send: 'Refuser l’offre', invalid: 'Indiquez un motif de 5 à 300 caractères.' },
  ar: { refuse: 'رفض…', reason: 'السبب المرسل إلى البائع (5 إلى 300 حرف)', send: 'رفض العرض', invalid: 'اكتب سببًا من 5 إلى 300 حرف.' },
} as const;

/** Refusal needs a reason; it is emailed to the seller, who can edit and resubmit. */
export function RejectOfferForm({ locale, offerId }: { readonly locale: Locale; readonly offerId: string }) {
  const [state, action, pending] = useActionState(rejectOfferAction, {});
  const t = refuseCopy[locale];
  const id = `refuse-${offerId}`;
  return (
    <details className="refuse">
      <summary className="button secondary small">{t.refuse}</summary>
      <form action={action} className="refuse-form">
        <input type="hidden" name="lang" value={locale} />
        <input type="hidden" name="offerId" value={offerId} />
        <label htmlFor={id}>{t.reason}</label>
        <textarea id={id} name="reason" required minLength={5} maxLength={300} rows={3} />
        {state.error && (
          <p className="notice error" role="alert">
            {state.error === 'invalid' ? t.invalid : copy[locale][state.error]}
          </p>
        )}
        <button className="button secondary small" type="submit" disabled={pending}>
          {pending ? '…' : t.send}
        </button>
      </form>
    </details>
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
