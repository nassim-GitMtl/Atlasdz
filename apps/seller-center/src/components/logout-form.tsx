'use client';

import { useActionState } from 'react';
import { logoutAction } from '@/app/actions';
import { copy, type Locale } from '@/lib/i18n';

export function LogoutForm({ locale }: { readonly locale: Locale }) {
  const [state, action, pending] = useActionState(logoutAction, {});
  const t = copy[locale];
  return (
    <form action={action} className="logout-form">
      <input type="hidden" name="lang" value={locale} />
      <button className="text-button" type="submit" disabled={pending}>
        {pending ? t.signingOut : t.signOut}
      </button>
      {state.error && (
        <p className="notice error" role="alert">
          {t[state.error]}
        </p>
      )}
    </form>
  );
}
