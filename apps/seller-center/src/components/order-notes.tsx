'use client';
import { useActionState } from 'react';
import type { SellerOrderNote } from '@atlas/contracts';
import { addOrderNoteAction } from '@/app/actions';
import { copy, intlLocale, lang, type Locale } from '@/lib/i18n';

const kindLabel = (kind: SellerOrderNote['kind'], locale: Locale) =>
  ({
    NOTE: lang(locale, 'Note', 'ملاحظة', 'Note'),
    CALL_NO_ANSWER: lang(locale, 'Appel sans réponse', 'اتصال دون رد', 'Call not answered'),
    CALL_CONFIRMED: lang(locale, 'Confirmée par téléphone', 'مؤكَّد هاتفيًا', 'Confirmed by phone'),
    CALL_CALLBACK: lang(locale, 'À rappeler', 'إعادة الاتصال', 'Call back'),
  })[kind];

/** The team's private notes on one order, with quick call outcomes. Never shown to the buyer. */
export function OrderNotes({
  sellerOrderId,
  notes,
  locale,
}: {
  readonly sellerOrderId: string;
  readonly notes: readonly SellerOrderNote[];
  readonly locale: Locale;
}) {
  const [state, action, pending] = useActionState(addOrderNoteAction, {});
  const when = (iso: string) =>
    new Date(iso).toLocaleString(intlLocale(locale), {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Africa/Algiers',
    });
  return (
    <section className="order-notes" aria-labelledby="notes-title">
      <h2 id="notes-title">{lang(locale, 'Suivi interne', 'المتابعة الداخلية', 'Internal follow-up')}</h2>
      <p className="muted">
        {lang(
          locale,
          'Visible par votre équipe uniquement, jamais par le client.',
          'مرئي لفريقك فقط، ولا يراه الزبون أبدًا.',
          'Visible to your team only, never to the customer.',
        )}
      </p>
      {notes.length > 0 && (
        <ol className="order-notes__list">
          {notes.map((note) => (
            <li key={note.id}>
              <strong>{kindLabel(note.kind, locale)}</strong>
              {note.body ? ` — ${note.body}` : ''}
              <small>
                {when(note.createdAt)}
                {note.author ? ` · ${note.author}` : ''}
              </small>
            </li>
          ))}
        </ol>
      )}
      <form action={action} className="order-notes__form" key={state.done ?? 0}>
        <input type="hidden" name="sellerOrderId" value={sellerOrderId} />
        <label htmlFor="note-body">{lang(locale, 'Note (facultative pour un appel)', 'ملاحظة (اختيارية للاتصال)', 'Note (optional for a call)')}</label>
        <textarea id="note-body" name="body" rows={2} maxLength={500} />
        {state.error && (
          <p className="notice error" role="alert">
            {state.error === 'invalid'
              ? lang(locale, 'Écrivez une note (500 caractères au plus).', 'اكتب ملاحظة (500 حرف كحد أقصى).', 'Write a note (500 characters at most).')
              : copy[locale][state.error === 'csrf' ? 'csrf' : state.error === 'unavailable' ? 'unavailable' : 'unauthorized']}
          </p>
        )}
        <div className="review-actions">
          {(['CALL_CONFIRMED', 'CALL_NO_ANSWER', 'CALL_CALLBACK', 'NOTE'] as const).map((kind) => (
            <button
              key={kind}
              className={kind === 'NOTE' ? 'button small' : 'button secondary small'}
              type="submit"
              name="kind"
              value={kind}
              disabled={pending}
            >
              {kind === 'NOTE' ? lang(locale, 'Ajouter la note', 'إضافة الملاحظة', 'Add the note') : kindLabel(kind, locale)}
            </button>
          ))}
        </div>
      </form>
    </section>
  );
}
