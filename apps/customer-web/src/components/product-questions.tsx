import Link from 'next/link';
import type { ProductQuestion } from '@atlas/contracts';
import { lang, localizedHref, type Locale } from '@/lib/i18n';
import { orderDate } from '@/lib/orders-copy';
import { AskQuestionForm } from './ask-question-form';

/** Questions before buying, with the sellers' answers (askers stay anonymous). */
export function ProductQuestions({
  slug,
  questions,
  locale,
  signedIn,
}: {
  readonly slug: string;
  readonly questions: readonly ProductQuestion[];
  readonly locale: Locale;
  readonly signedIn: boolean;
}) {
  return (
    <section className="product-questions" aria-labelledby="questions-title">
      <h2 id="questions-title">{lang(locale, 'Questions et réponses', 'أسئلة وأجوبة', 'Questions and answers')}</h2>
      {questions.length === 0 ? (
        <p>{lang(locale, 'Aucune question pour l’instant.', 'لا توجد أسئلة حتى الآن.', 'No questions yet.')}</p>
      ) : (
        <ul>
          {questions.map((question) => (
            <li key={question.id}>
              <p className="question">
                <strong>{lang(locale, 'Question', 'سؤال', 'Question')} :</strong> {question.body}
              </p>
              <small>
                {lang(locale, 'Client', 'زبون', 'Customer')} · {orderDate(question.createdAt, locale)}
              </small>
              {question.answers.length === 0 ? (
                <p className="answer pending">
                  {lang(locale, 'En attente de réponse du vendeur.', 'في انتظار رد البائع.', 'Waiting for the seller’s answer.')}
                </p>
              ) : (
                question.answers.map((answer) => (
                  <p className="answer" key={`${answer.sellerName}-${answer.createdAt}`}>
                    <strong>{answer.sellerName} :</strong> {answer.body}
                  </p>
                ))
              )}
            </li>
          ))}
        </ul>
      )}
      {signedIn ? (
        <AskQuestionForm slug={slug} locale={locale} />
      ) : (
        <Link href={localizedHref('/login', locale, { next: `/product/${slug}` })}>
          {lang(locale, 'Se connecter pour poser une question', 'سجّل الدخول لطرح سؤال', 'Sign in to ask a question')}
        </Link>
      )}
    </section>
  );
}
