'use client';

import { useActionState } from 'react';
import { deleteAccountAction, phoneAction } from '@/app/account/actions';
import { accountCopy } from '@/lib/account-copy';
import type { Locale } from '@/lib/i18n';

export function PhoneForm({ locale }: { readonly locale: Locale }) {
  const [state, action, pending] = useActionState(phoneAction, {});
  const t = accountCopy[locale];
  if (state.step === 'done') return <p role="status">{t.phoneDone}</p>;
  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="lang" value={locale} />
      <label htmlFor="account-phone">
        {t.phoneLabel}
        <input
          id="account-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          required
          maxLength={20}
          defaultValue={state.phone ?? ''}
          readOnly={state.step === 'code'}
        />
      </label>
      {state.step === 'code' && (
        <>
          <p role="status">{t.codeSent}</p>
          <label htmlFor="account-code">
            {t.codeLabel}
            <input
              id="account-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              dir="ltr"
              required
              autoFocus
            />
          </label>
        </>
      )}
      {state.error && (
        <p className="cart-feedback" role="alert">
          {t[state.error === 'passwordError' ? 'passwordError' : state.error]}
        </p>
      )}
      <button className="button button--primary" type="submit" disabled={pending}>
        {pending ? t.busy : state.step === 'code' ? t.confirmCode : t.sendCode}
      </button>
    </form>
  );
}

export function DeleteAccountForm({ locale }: { readonly locale: Locale }) {
  const [state, action, pending] = useActionState(deleteAccountAction, {});
  const t = accountCopy[locale];
  if (state.step === 'done') return <p role="status">{t.deleted}</p>;
  return (
    <form action={action} className="auth-form">
      <label htmlFor="delete-password">
        {t.password}
        <input
          id="delete-password"
          name="password"
          type="password"
          autoComplete="current-password"
          dir="ltr"
          required
          maxLength={128}
        />
      </label>
      {state.error && (
        <p className="cart-feedback" role="alert">
          {t[state.error]}
        </p>
      )}
      <button className="button button--secondary" type="submit" disabled={pending}>
        {pending ? t.busy : t.confirmDelete}
      </button>
    </form>
  );
}
