'use client';
import { useActionState } from 'react';
import { answerQuestionAction, hideQuestionAction } from '@/app/actions';
import { copy, lang, type Locale } from '@/lib/i18n';

const failure = (locale: Locale, error: string) =>
  error === 'invalid'
    ? lang(locale, 'Écrivez entre 2 et 1000 caractères.', 'اكتب بين 2 و1000 حرف.', 'Write between 2 and 1000 characters.')
    : copy[locale][error === 'csrf' ? 'csrf' : error === 'unauthorized' ? 'unauthorized' : 'unavailable'];

/** The seller's public answer to one question (editable). */
export function AnswerForm({
  questionId,
  current,
  locale,
}: {
  readonly questionId: string;
  readonly current: string | null;
  readonly locale: Locale;
}) {
  const [state, action, pending] = useActionState(answerQuestionAction, {});
  const id = `answer-${questionId}`;
  return (
    <form action={action} className="answer-form">
      <input type="hidden" name="questionId" value={questionId} />
      <label htmlFor={id}>
        {lang(locale, 'Votre réponse (publique)', 'ردّك (علني)', 'Your answer (public)')}
      </label>
      <textarea id={id} name="body" required minLength={2} maxLength={1000} rows={3} defaultValue={current ?? ''} />
      {state.error && (
        <p className="notice error" role="alert">
          {failure(locale, state.error)}
        </p>
      )}
      {state.done && (
        <p className="notice success" role="status">
          {lang(locale, 'Réponse publiée.', 'تم نشر الرد.', 'Answer published.')}
        </p>
      )}
      <button className="button secondary small" type="submit" disabled={pending}>
        {current
          ? lang(locale, 'Modifier la réponse', 'تعديل الرد', 'Update the answer')
          : lang(locale, 'Répondre', 'الرد', 'Answer')}
      </button>
    </form>
  );
}

/** Staff hide an unsuitable question. */
export function HideQuestionForm({ questionId, locale }: { readonly questionId: string; readonly locale: Locale }) {
  const [state, action, pending] = useActionState(hideQuestionAction, {});
  if (state.done)
    return (
      <p className="notice success" role="status">
        {lang(locale, 'Question masquée.', 'تم إخفاء السؤال.', 'Question hidden.')}
      </p>
    );
  return (
    <form action={action}>
      <input type="hidden" name="questionId" value={questionId} />
      {state.error && (
        <p className="notice error" role="alert">
          {failure(locale, state.error)}
        </p>
      )}
      <button className="button secondary small" type="submit" disabled={pending}>
        {lang(locale, 'Masquer', 'إخفاء', 'Hide')}
      </button>
    </form>
  );
}
