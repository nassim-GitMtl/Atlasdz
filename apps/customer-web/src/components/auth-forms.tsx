'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import {
  forgotPasswordAction,
  guestAction,
  loginAction,
  registerAction,
  resendVerificationAction,
  resetPasswordAction,
} from '@/app/login/actions';
import { authCopy } from '@/lib/auth-copy';
import { localizedHref, type Locale } from '@/lib/i18n';

export function AuthForm({
  mode,
  locale,
  next,
}: {
  readonly mode: 'login' | 'register' | 'guest';
  readonly locale: Locale;
  readonly next: string;
}) {
  const [state, action, pending] = useActionState(
    mode === 'login' ? loginAction : mode === 'guest' ? guestAction : registerAction,
    {},
  );
  const t = authCopy[locale];
  const id = (name: string) => `${mode}-${name}`;
  return (
    <form action={action} className="auth-form" noValidate={false}>
      <input type="hidden" name="lang" value={locale} />
      <input type="hidden" name="next" value={next} />
      <label htmlFor={id('email')}>
        {t.email}
        <input
          id={id('email')}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          dir="ltr"
          required
          maxLength={254}
        />
      </label>
      {mode !== 'guest' && (
        <label htmlFor={id('password')}>
          {t.password}
          <input
            id={id('password')}
            name="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            dir="ltr"
            required
            minLength={mode === 'register' ? 10 : 1}
            maxLength={128}
            aria-describedby={mode === 'register' ? id('hint') : undefined}
          />
        </label>
      )}
      {mode === 'register' && (
        <p id={id('hint')} className="auth-hint">
          {t.passwordHint}
        </p>
      )}
      {state.error && (
        <p className="cart-feedback" role="alert">
          {mode === 'guest' && state.error === 'exists' ? t.guestExists : t[state.error]}
        </p>
      )}
      <button
        className={mode === 'guest' ? 'button button--secondary' : 'button button--primary'}
        type="submit"
        disabled={pending}
      >
        {pending
          ? t.busy
          : mode === 'login'
            ? t.signIn
            : mode === 'guest'
              ? t.guestSubmit
              : t.register}
      </button>
      {mode === 'login' && (
        <Link className="auth-hint" href={localizedHref('/forgot-password', locale)}>
          {t.forgot}
        </Link>
      )}
    </form>
  );
}

export function ForgotPasswordForm({ locale }: { readonly locale: Locale }) {
  const [state, action, pending] = useActionState(forgotPasswordAction, {});
  const t = authCopy[locale];
  if (state.done) return <p role="status">{t.forgotSent}</p>;
  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="lang" value={locale} />
      <label htmlFor="forgot-email">
        {t.email}
        <input
          id="forgot-email"
          name="email"
          type="email"
          autoComplete="email"
          dir="ltr"
          required
          maxLength={254}
        />
      </label>
      {state.error && (
        <p className="cart-feedback" role="alert">
          {t[state.error]}
        </p>
      )}
      <button className="button button--primary" type="submit" disabled={pending}>
        {pending ? t.busy : t.forgotSend}
      </button>
    </form>
  );
}

export function ResetPasswordForm({
  locale,
  token,
}: {
  readonly locale: Locale;
  readonly token: string;
}) {
  const [state, action, pending] = useActionState(resetPasswordAction, {});
  const t = authCopy[locale];
  if (state.done)
    return (
      <p role="status">
        {t.resetDone} <Link href={localizedHref('/login', locale)}>{t.signIn}</Link>
      </p>
    );
  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="lang" value={locale} />
      <input type="hidden" name="token" value={token} />
      <label htmlFor="reset-password">
        {t.password}
        <input
          id="reset-password"
          name="password"
          type="password"
          autoComplete="new-password"
          dir="ltr"
          required
          minLength={10}
          maxLength={128}
          aria-describedby="reset-hint"
        />
      </label>
      <p id="reset-hint" className="auth-hint">
        {t.passwordHint}
      </p>
      {state.error && (
        <p className="cart-feedback" role="alert">
          {t[state.error]}{' '}
          {state.error === 'resetInvalid' && (
            <Link href={localizedHref('/forgot-password', locale)}>{t.forgot}</Link>
          )}
        </p>
      )}
      <button className="button button--primary" type="submit" disabled={pending}>
        {pending ? t.busy : t.resetSubmit}
      </button>
    </form>
  );
}

export function ResendVerificationForm({ locale }: { readonly locale: Locale }) {
  const [state, action, pending] = useActionState(resendVerificationAction, {});
  const t = authCopy[locale];
  if (state.done) return <p role="status">{t.verifySent}</p>;
  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="lang" value={locale} />
      <p>{t.verifyResendBody}</p>
      <label htmlFor="verify-email">
        {t.email}
        <input
          id="verify-email"
          name="email"
          type="email"
          autoComplete="email"
          dir="ltr"
          required
          maxLength={254}
        />
      </label>
      {state.error && (
        <p className="cart-feedback" role="alert">
          {t[state.error]}
        </p>
      )}
      <button className="button button--primary" type="submit" disabled={pending}>
        {pending ? t.busy : t.verifyResend}
      </button>
    </form>
  );
}
