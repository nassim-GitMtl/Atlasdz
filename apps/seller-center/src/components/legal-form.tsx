'use client';
import type { SellerLegal } from '@atlas/contracts';
import { useActionState } from 'react';
import { legalAction } from '@/app/auth-actions';
import { copy, type Locale } from '@/lib/i18n';
import { legalCopy } from '@/lib/legal';
import { LegalFields } from './legal-fields';

/** The seller's legal identity on the account page (shown to buyers on the shop). */
export function LegalForm({
  locale,
  legal,
}: {
  readonly locale: Locale;
  readonly legal: SellerLegal | null | undefined;
}) {
  const [state, action, pending] = useActionState(legalAction, {});
  const t = legalCopy[locale];
  return (
    <form action={action} className="legal-form">
      {!legal && !state.done && (
        <p className="notice error" role="alert">
          {t.missing}
        </p>
      )}
      <LegalFields locale={locale} prefix="account" values={state.values ?? legal} />
      {state.error && (
        <p className="notice error" role="alert">
          {state.error === 'invalid'
            ? t.invalid
            : copy[locale][state.error === 'csrf' ? 'csrf' : state.error === 'unauthorized' ? 'unauthorized' : 'unavailable']}
        </p>
      )}
      {state.done && (
        <p className="notice success" role="status">
          {t.saved}
        </p>
      )}
      <button className="button secondary" type="submit" disabled={pending}>
        {t.save}
      </button>
    </form>
  );
}
