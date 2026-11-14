'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import type { CartLine } from '@atlas/contracts';
import {
  addCartAction,
  updateCartAction,
  customerLoginAction,
  customerLogoutAction,
  type CartActionState,
} from '@/app/cart/actions';
import { cartCopy } from '@/lib/cart-copy';
import { localizedHref, type Locale } from '@/lib/i18n';

function Feedback({ state, locale }: { readonly state: CartActionState; readonly locale: Locale }) {
  const t = cartCopy[locale];
  return state.error ? (
    <div className="cart-feedback" role="alert">
      <p>{t[state.error]}</p>
      <a href={localizedHref('/cart', locale)}>{t.retry}</a>
    </div>
  ) : state.added ? (
    <p role="status">
      <Link href={localizedHref('/cart', locale)}>
        {t.added} {t.title} →
      </Link>
    </p>
  ) : null;
}
export function AddCartForm({
  offerId,
  locale,
  disabled,
}: {
  readonly offerId: string;
  readonly locale: Locale;
  readonly disabled: boolean;
}) {
  const [state, action, pending] = useActionState(addCartAction, {});
  const t = cartCopy[locale];
  return (
    <form action={action} className="cart-add-form">
      <input type="hidden" name="offerId" value={offerId} />
      <input type="hidden" name="lang" value={locale} />
      <button className="button button--primary" type="submit" disabled={disabled || pending}>
        {pending ? t.busy : t.add}
      </button>
      <Feedback state={state} locale={locale} />
    </form>
  );
}
export function CartQuantityForm({
  line,
  version,
  locale,
}: {
  readonly line: CartLine;
  readonly version: number;
  readonly locale: Locale;
}) {
  const [state, action, pending] = useActionState(updateCartAction, {});
  const t = cartCopy[locale];
  return (
    <form action={action} className="cart-quantity-form">
      <input type="hidden" name="offerId" value={line.offerId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="lang" value={locale} />
      <label htmlFor={`qty-${line.offerId}`}>{t.quantity}</label>
      <input
        id={`qty-${line.offerId}`}
        name="quantity"
        type="number"
        min="1"
        max="99"
        step="1"
        required
        defaultValue={line.quantity}
      />
      <button
        className="button button--secondary"
        type="submit"
        disabled={pending || line.state === 'UNAVAILABLE'}
      >
        {pending ? t.busy : t.update}
      </button>
      <button
        className="button button--secondary"
        type="submit"
        name="remove"
        value="1"
        formNoValidate
        disabled={pending}
      >
        {t.remove}
      </button>
      <Feedback state={state} locale={locale} />
    </form>
  );
}
export function CustomerSessionForm({
  locale,
  logout = false,
}: {
  readonly locale: Locale;
  readonly logout?: boolean;
}) {
  const [state, action, pending] = useActionState(
    logout ? customerLogoutAction : customerLoginAction,
    {},
  );
  const t = cartCopy[locale];
  return (
    <form action={action}>
      <input type="hidden" name="lang" value={locale} />
      <button
        className={`button ${logout ? 'button--secondary' : 'button--primary'}`}
        type="submit"
        disabled={pending}
      >
        {pending ? t.busy : logout ? t.logout : t.loginButton}
      </button>
      <Feedback state={state} locale={locale} />
    </form>
  );
}
