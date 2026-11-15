'use client';
import { useActionState, useState } from 'react';
import type { DeliveryContact, DeliveryDestination } from '@atlas/contracts';
import {
  cancelAction,
  placeAction,
  quoteAction,
  confirmDeliveryAction,
} from '@/app/orders/actions';
import { orderText } from '@/lib/orders-copy';
import { localizedHref, type Locale } from '@/lib/i18n';
import { preorderCopy } from '@/lib/preorder';

export function OrderForm({
  kind,
  id = '',
  version = 1,
  locale,
  destinations = [],
  live = false,
  guest = false,
  preorder = null,
}: {
  readonly kind: 'quote' | 'place' | 'cancel' | 'receipt';
  readonly id?: string;
  readonly version?: number;
  readonly locale: Locale;
  readonly destinations?: readonly DeliveryDestination[];
  readonly live?: boolean;
  /** Signed out: the email is asked with the delivery details and creates the account. */
  readonly guest?: boolean;
  /** Pre-order items in the cart: the buyer must accept this delivery window. */
  readonly preorder?: { readonly min: number; readonly max: number } | null;
}) {
  const [contact, setContact] = useState<DeliveryContact>({
    recipientName: '',
    phone: '',
    addressLine: '',
    city: '',
  });
  const [state, action, pending] = useActionState(
    kind === 'quote'
      ? quoteAction
      : kind === 'place'
        ? placeAction
        : kind === 'receipt'
          ? confirmDeliveryAction
          : cancelAction,
    {},
  );
  const t = orderText(locale, live);
  const [wilayaId, setWilayaId] = useState('');
  const [destinationId, setDestinationId] = useState('');
  const wilayas = [
    ...new Map(
      destinations.flatMap((d) => (d.wilaya ? [[d.wilaya.id, d.wilaya] as const] : [])),
    ).values(),
  ];
  const visibleDestinations = destinations.filter(
    (d) => wilayas.length === 0 || (wilayaId === 'test' ? !d.wilaya : d.wilaya?.id === wilayaId),
  );
  return (
    <form action={action} className="order-form">
      <input type="hidden" name="lang" value={locale} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name={kind === 'place' ? 'quoteId' : 'sellerOrderId'} value={id} />
      {kind === 'quote' && (
        <>
          {wilayas.length > 0 && (
            <>
              <label htmlFor="checkout-wilaya">{t.wilaya}</label>
              <select
                id="checkout-wilaya"
                required
                value={wilayaId}
                onChange={(e) => {
                  setWilayaId(e.target.value);
                  setDestinationId('');
                }}
              >
                <option value="" disabled>
                  {t.chooseWilaya}
                </option>
                {wilayas.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name[locale]}
                  </option>
                ))}
                {destinations.some((d) => !d.wilaya) && (
                  <option value="test">{t.testLocations}</option>
                )}
              </select>
            </>
          )}
          <label htmlFor="checkout-destination">{t.destination}</label>
          <select
            id="checkout-destination"
            name="destinationId"
            required
            value={destinationId}
            onChange={(e) => setDestinationId(e.target.value)}
            disabled={wilayas.length > 0 && !wilayaId}
            aria-describedby="destination-hint"
          >
            <option value="" disabled>
              {t.chooseDestination}
            </option>
            {visibleDestinations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name[locale]}
              </option>
            ))}
          </select>
          <p id="destination-hint">{t.destinationHint}</p>
          <fieldset
            className="delivery-contact-fields"
            aria-describedby="contact-hint"
            disabled={pending}
          >
            <legend>{t.deliveryContact}</legend>
            <p id="contact-hint">{t.contactHint}</p>
            {guest && (
              <label htmlFor="checkout-email">
                {t.guestEmail}
                <input
                  id="checkout-email"
                  name="email"
                  type="email"
                  dir="ltr"
                  autoComplete="email"
                  inputMode="email"
                  required
                  maxLength={254}
                  aria-describedby="checkout-email-hint"
                />
                <span id="checkout-email-hint" className="auth-hint">
                  {t.guestEmailHint}{' '}
                  <a href={localizedHref('/login', locale, { next: '/cart' })}>{t.guestSignIn}</a>
                </span>
              </label>
            )}
            {(
              [
                ['recipientName', 2, 120],
                ['phone', 7, 16],
                ['addressLine', 5, 240],
                ['city', 2, 120],
              ] as const
            ).map(([field, min, max]) => (
              <label key={field} htmlFor={`checkout-${field}`}>
                {t[field]}
                <input
                  id={`checkout-${field}`}
                  name={field}
                  type={field === 'phone' ? 'tel' : 'text'}
                  dir={field === 'phone' ? 'ltr' : 'auto'}
                  autoComplete="off"
                  required
                  minLength={min}
                  maxLength={max}
                  pattern={field === 'phone' ? '[+]?[0-9]{7,15}' : undefined}
                  aria-describedby={field === 'phone' ? 'contact-phone-hint' : undefined}
                  value={contact[field]}
                  onChange={(event) => setContact({ ...contact, [field]: event.target.value })}
                />
              </label>
            ))}
            <p id="contact-phone-hint">{t.phoneHint}</p>
          </fieldset>
          {destinations.length === 0 && <p role="status">{t.noDestinations}</p>}
          {preorder && (
            <label className="terms-check preorder-accept">
              <input type="checkbox" name="acceptPreorder" value="yes" required />{' '}
              {preorderCopy[locale].accept(preorder.min, preorder.max)}
            </label>
          )}
        </>
      )}
      {kind === 'cancel' && <p>{t.cancelHint}</p>}
      {kind === 'receipt' && (
        <label>
          <input type="checkbox" name="confirmReceipt" value="yes" required /> {t.receiptConfirm}
        </label>
      )}
      {kind === 'place' && live && (
        <label className="terms-check">
          <input type="checkbox" name="acceptTerms" value="yes" required /> {t.acceptTerms}{' '}
          <a href={localizedHref('/legal/conditions', locale)} target="_blank" rel="noreferrer">
            {t.termsLink}
          </a>
        </label>
      )}
      <button
        className={`button ${kind === 'cancel' ? 'button--secondary' : 'button--primary'}`}
        disabled={
          pending ||
          state.cancelled ||
          state.confirmed ||
          (kind === 'quote' && destinations.length === 0)
        }
        type="submit"
      >
        {pending
          ? t.busy
          : kind === 'quote'
            ? t.checkout
            : kind === 'place'
              ? t.confirm
              : kind === 'receipt'
                ? t.receipt
                : t.cancel}
      </button>
      {state.error && (
        <div role="alert" className="cart-feedback">
          <p>{t[state.error]}</p>
          {state.error === 'unverified' ? (
            <a href={localizedHref('/verify-email', locale)}>{t.resendVerification}</a>
          ) : state.error === 'phoneRequired' ? (
            <a href={localizedHref('/account', locale)}>{t.accountLink}</a>
          ) : (
            <a href={localizedHref(state.error === 'auth' ? '/login' : '/cart', locale)}>
              {state.error === 'auth' ? t.login : t.cart}
            </a>
          )}
        </div>
      )}
      {state.cancelled && <p role="status">{t.cancelled}</p>}
    </form>
  );
}
