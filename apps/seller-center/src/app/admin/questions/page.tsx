import { redirect } from 'next/navigation';
import { HideQuestionForm } from '@/components/question-forms';
import { Shell } from '@/components/shell';
import { ServiceState } from '@/components/states';
import { listStaffQuestions } from '@/lib/api';
import { href, lang, localeFrom, type SearchParams } from '@/lib/i18n';
import { orderDate } from '@/lib/orders-copy';
import { accessToken } from '@/lib/session';

/** Staff moderation of customer questions (latest 50). */
export default async function AdminQuestions({ searchParams }: { readonly searchParams: Promise<SearchParams> }) {
  const locale = localeFrom((await searchParams).lang);
  const token = await accessToken();
  if (!token) redirect(href('/login', locale));
  const result = await listStaffQuestions(token)
    .then((data) => ({ items: data.items, error: undefined }))
    .catch((error: unknown) => ({ items: undefined, error }));
  return (
    <Shell locale={locale} currentPath="/admin/questions" signedIn>
      <div className="page-heading">
        <div>
          <h1>{lang(locale, 'Questions clients', 'أسئلة الزبائن', 'Customer questions')}</h1>
          <p>
            {lang(
              locale,
              'Masquez une question hors sujet ou contenant des données personnelles.',
              'أخفِ أي سؤال خارج الموضوع أو يحتوي على بيانات شخصية.',
              'Hide a question that is off-topic or contains personal data.',
            )}
          </p>
        </div>
      </div>
      {result.items ? (
        <ul className="plain-list panel-list">
          {result.items.map((question) => (
            <li key={question.id}>
              <span>
                {question.body}
                <small>
                  {orderDate(question.createdAt, locale)} · {question.productSlug} · {question.status}
                </small>
              </span>
              {question.status === 'PUBLISHED' && <HideQuestionForm questionId={question.id} locale={locale} />}
            </li>
          ))}
        </ul>
      ) : (
        <ServiceState error={result.error} locale={locale} retryPath="/admin/questions" />
      )}
    </Shell>
  );
}
