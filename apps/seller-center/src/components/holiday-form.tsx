'use client';
import { useActionState } from 'react';
import { holidayAction } from '@/app/auth-actions';
import { copy, intlLocale, lang, type Locale } from '@/lib/i18n';

const day = (date: Date) => date.toISOString().slice(0, 10);

/** Holiday mode: offers hidden until a date, back on their own afterwards. */
export function HolidayForm({
  locale,
  holidayUntil,
}: {
  readonly locale: Locale;
  readonly holidayUntil: string | null | undefined;
}) {
  const [state, action, pending] = useActionState(holidayAction, {});
  const now = Date.now();
  const min = day(new Date(now + 86_400_000));
  const max = day(new Date(now + 59 * 86_400_000));
  const error =
    state.error === 'invalid'
      ? lang(locale, 'Choisissez une date entre demain et 60 jours.', 'اختر تاريخًا بين الغد و60 يومًا.', 'Choose a date between tomorrow and 60 days ahead.')
      : state.error
        ? copy[locale][state.error === 'csrf' ? 'csrf' : state.error === 'unauthorized' ? 'unauthorized' : 'unavailable']
        : null;
  return (
    <section className="holiday-panel" aria-labelledby="holiday-title">
      <h2 id="holiday-title">{lang(locale, 'Mode congé', 'وضع العطلة', 'Holiday mode')}</h2>
      {holidayUntil ? (
        <form action={action}>
          <input type="hidden" name="reopen" value="1" />
          <p role="status" className="notice">
            {lang(locale, 'Boutique en congé jusqu’au ', 'المتجر في عطلة حتى ', 'Shop on holiday until ')}
            <strong>
              {new Date(holidayUntil).toLocaleDateString(intlLocale(locale), { dateStyle: 'long', timeZone: 'Africa/Algiers' })}
            </strong>
            {lang(
              locale,
              ' : vos offres sont masquées et reviendront seules. Les commandes déjà reçues restent à traiter.',
              ': عروضك مخفية وستعود تلقائيًا. الطلبات المستلمة سابقًا يجب معالجتها.',
              ': your offers are hidden and come back on their own. Orders already received still need handling.',
            )}
          </p>
          {error && <p className="notice error" role="alert">{error}</p>}
          <button className="button" type="submit" disabled={pending}>
            {lang(locale, 'Rouvrir maintenant', 'إعادة الفتح الآن', 'Reopen now')}
          </button>
        </form>
      ) : (
        <form action={action} className="holiday-form">
          <p>
            {lang(
              locale,
              'Absent quelques jours ? Masquez toutes vos offres jusqu’à une date ; elles reviennent seules ensuite.',
              'غائب لبضعة أيام؟ أخفِ كل عروضك حتى تاريخ معين؛ وستعود تلقائيًا بعده.',
              'Away for a few days? Hide all your offers until a date; they come back on their own.',
            )}
          </p>
          <label htmlFor="holiday-until">{lang(locale, 'Fermé jusqu’au (inclus)', 'مغلق حتى (ضمنًا)', 'Closed until (included)')}</label>
          <input id="holiday-until" name="until" type="date" min={min} max={max} required />
          {error && <p className="notice error" role="alert">{error}</p>}
          <button className="button secondary" type="submit" disabled={pending}>
            {lang(locale, 'Activer le mode congé', 'تفعيل وضع العطلة', 'Start holiday mode')}
          </button>
        </form>
      )}
    </section>
  );
}
