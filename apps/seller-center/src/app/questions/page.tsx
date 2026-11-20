import { redirect } from 'next/navigation';
import { AnswerForm } from '@/components/question-forms';
import { Shell } from '@/components/shell';
import { ServiceState } from '@/components/states';
import { listSellerQuestions } from '@/lib/api';
import { href, lang, localeFrom, localized, type SearchParams } from '@/lib/i18n';
import { orderDate } from '@/lib/orders-copy';
import { accessToken } from '@/lib/session';

/** Customers' questions on the seller's products; answers are public on the product page. */
export default async function Questions({ searchParams }: { readonly searchParams: Promise<SearchParams> }) {
  const locale = localeFrom((await searchParams).lang);
  const token = await accessToken();
  if (!token) redirect(href('/login', locale));
  const result = await listSellerQuestions(token)
    .then((data) => ({ items: data.items, error: undefined }))
    .catch((error: unknown) => ({ items: undefined, error }));
  return (
    <Shell locale={locale} currentPath="/questions" signedIn>
      <div className="page-heading">
        <div>
          <h1>{lang(locale, 'Questions clients', 'أسئلة الزبائن', 'Customer questions')}</h1>
          <p>
            {lang(
              locale,
              'Questions posées avant achat sur vos produits. Votre réponse est publique sur la fiche.',
              'أسئلة قبل الشراء حول منتجاتك. ردّك يظهر للجميع على صفحة المنتج.',
              'Questions asked before buying your products. Your answer is public on the product page.',
            )}
          </p>
        </div>
      </div>
      {result.items ? (
        result.items.length === 0 ? (
          <p className="notice">{lang(locale, 'Aucune question pour l’instant.', 'لا توجد أسئلة حتى الآن.', 'No questions yet.')}</p>
        ) : (
          <div className="question-list">
            {result.items.map((question) => (
              <article className="question-card" key={question.id}>
                <h2>{localized(question.product.title, locale)}</h2>
                <p className="question-body">{question.body}</p>
                <small>
                  {orderDate(question.createdAt, locale)}
                  {question.answer === null && ` · ${lang(locale, 'Sans réponse', 'دون رد', 'Unanswered')}`}
                </small>
                <AnswerForm questionId={question.id} current={question.answer} locale={locale} />
              </article>
            ))}
          </div>
        )
      ) : (
        <ServiceState error={result.error} locale={locale} retryPath="/questions" />
      )}
    </Shell>
  );
}
