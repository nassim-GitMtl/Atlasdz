'use client';
import { useActionState } from 'react';
import { teamAction } from '@/app/auth-actions';
import { copy, lang, type Locale } from '@/lib/i18n';

const failure = (locale: Locale, error: string) =>
  ({
    invalid: lang(locale, 'Adresse e-mail invalide.', 'بريد إلكتروني غير صالح.', 'Invalid email address.'),
    exists: lang(
      locale,
      'Cette adresse a déjà un compte Atlas DZ : utilisez-en une autre.',
      'لهذا البريد حساب في Atlas DZ: استعمل بريدًا آخر.',
      'This address already has an Atlas DZ account: use another one.',
    ),
    full: lang(locale, 'L’équipe compte déjà 10 membres.', 'يضم الفريق 10 أعضاء بالفعل.', 'The team already has 10 members.'),
    forbidden: lang(
      locale,
      'Réservé au propriétaire d’une boutique approuvée.',
      'متاح لصاحب متجر مقبول فقط.',
      'Only for the owner of an approved shop.',
    ),
  })[error] ?? copy[locale][error === 'csrf' ? 'csrf' : error === 'unauthorized' ? 'unauthorized' : 'unavailable'];

/** Invite a team member by email. */
export function InviteForm({ locale }: { readonly locale: Locale }) {
  const [state, action, pending] = useActionState(teamAction, {});
  return (
    <form action={action} className="legal-form">
      <input type="hidden" name="lang" value={locale} />
      <div className="field">
        <label htmlFor="team-email">{lang(locale, 'E-mail du membre', 'بريد العضو', 'Member email')}</label>
        <input
          id="team-email"
          name="email"
          type="email"
          dir="ltr"
          required
          maxLength={254}
          defaultValue={state.error ? state.email : undefined}
          key={state.done ?? 'form'}
        />
      </div>
      {state.error && (
        <p className="notice error" role="alert">
          {failure(locale, state.error)}
        </p>
      )}
      {state.done === 'invited' && (
        <p className="notice success" role="status">
          {lang(
            locale,
            'Invitation envoyée : le lien pour choisir le mot de passe est valable 7 jours.',
            'أُرسلت الدعوة: رابط اختيار كلمة المرور صالح 7 أيام.',
            'Invitation sent: the link to choose a password is valid for 7 days.',
          )}
        </p>
      )}
      <button className="button" type="submit" disabled={pending}>
        {lang(locale, 'Inviter', 'دعوة', 'Invite')}
      </button>
    </form>
  );
}

/** Remove one team member (access ends at once). */
export function RemoveMemberForm({ userId, email, locale }: { readonly userId: string; readonly email: string; readonly locale: Locale }) {
  const [state, action, pending] = useActionState(teamAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="remove" value={userId} />
      {state.error && (
        <p className="notice error" role="alert">
          {failure(locale, state.error)}
        </p>
      )}
      <button
        className="button secondary small"
        type="submit"
        disabled={pending}
        aria-label={lang(locale, `Retirer ${email}`, `إزالة ${email}`, `Remove ${email}`)}
      >
        {lang(locale, 'Retirer', 'إزالة', 'Remove')}
      </button>
    </form>
  );
}
