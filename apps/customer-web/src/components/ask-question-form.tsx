'use client';
import { useActionState } from 'react';
import { askQuestionAction } from '@/app/product/question-actions';
import { lang, type Locale } from '@/lib/i18n';

export function AskQuestionForm({ slug, locale }: { readonly slug: string; readonly locale: Locale }) {
  const [state, action, pending] = useActionState(askQuestionAction, {});
  const message = {
    sent: lang(locale, 'Question envoyée : les vendeurs de ce produit vont répondre ici.', 'أُرسل السؤال: سيجيب بائعو هذا المنتج هنا.', 'Question sent: the sellers of this product will answer here.'),
    invalid: lang(locale, 'Écrivez entre 5 et 500 caractères.', 'اكتب بين 5 و500 حرف.', 'Write between 5 and 500 characters.'),
    auth: lang(locale, 'Reconnectez-vous pour continuer.', 'سجّل الدخول من جديد للمتابعة.', 'Sign in again to continue.'),
    limit: lang(locale, 'Trop de questions aujourd’hui. Réessayez demain.', 'أسئلة كثيرة اليوم. حاول غدًا.', 'Too many questions today. Try again tomorrow.'),
    csrf: lang(locale, 'Rechargez la page et réessayez.', 'أعد تحميل الصفحة وحاول مجددًا.', 'Reload the page and try again.'),
    unavailable: lang(locale, 'Le service ne répond pas. Réessayez.', 'الخدمة لا تستجيب. حاول مجددًا.', 'The service is not responding. Try again.'),
  };
  return (
    <form action={action} className="ask-question">
      <input type="hidden" name="slug" value={slug} />
      <label htmlFor="question-body">{lang(locale, 'Votre question', 'سؤالك', 'Your question')}</label>
      <textarea id="question-body" name="body" required minLength={5} maxLength={500} rows={3} />
      <small>
        {lang(
          locale,
          'Affichée sans votre nom. N’indiquez ni téléphone ni adresse.',
          'تُعرض دون اسمك. لا تكتب رقم هاتف أو عنوانًا.',
          'Shown without your name. Do not include a phone number or address.',
        )}
      </small>
      {state.result && (
        <p className={`notice ${state.result === 'sent' ? 'success' : 'error'}`} role={state.result === 'sent' ? 'status' : 'alert'}>
          {message[state.result]}
        </p>
      )}
      <button className="button button--secondary" type="submit" disabled={pending}>
        {lang(locale, 'Envoyer la question', 'إرسال السؤال', 'Send the question')}
      </button>
    </form>
  );
}
