import { redirect } from 'next/navigation';
import { ResolveReportsForm } from '@/components/report-forms';
import { Shell } from '@/components/shell';
import { ServiceState } from '@/components/states';
import { listProductReports } from '@/lib/api';
import { href, lang, localeFrom, type Locale, type SearchParams } from '@/lib/i18n';
import { orderDate } from '@/lib/orders-copy';
import { accessToken } from '@/lib/session';

const reasonLabel = (reason: string, locale: Locale) =>
  ({
    COUNTERFEIT: lang(locale, 'Contrefaçon', 'منتج مقلَّد', 'Counterfeit'),
    PROHIBITED: lang(locale, 'Produit interdit', 'منتج ممنوع', 'Prohibited item'),
    MISLEADING: lang(locale, 'Description trompeuse', 'وصف مضلِّل', 'Misleading description'),
    OFFENSIVE: lang(locale, 'Contenu choquant', 'محتوى مسيء', 'Offensive content'),
    OTHER: lang(locale, 'Autre', 'أخرى', 'Other'),
  })[reason] ?? reason;

/** Staff review of listings reported by customers, most reported first. */
export default async function AdminReports({ searchParams }: { readonly searchParams: Promise<SearchParams> }) {
  const locale = localeFrom((await searchParams).lang);
  const token = await accessToken();
  if (!token) redirect(href('/login', locale));
  const result = await listProductReports(token)
    .then((data) => ({ items: data.items, error: undefined }))
    .catch((error: unknown) => ({ items: undefined, error }));
  return (
    <Shell locale={locale} currentPath="/admin/reports" signedIn>
      <div className="page-heading">
        <div>
          <h1>{lang(locale, 'Produits signalés', 'منتجات مُبلَّغ عنها', 'Reported products')}</h1>
          <p>
            {lang(
              locale,
              'Vérifiez la fiche, puis classez les signalements sans suite ou retirez le produit de la vente. Les clients qui signalent restent anonymes pour les vendeurs.',
              'راجع صفحة المنتج، ثم احفظ البلاغات دون إجراء أو اسحب المنتج من البيع. يبقى المُبلِّغون مجهولين للبائعين.',
              'Check the listing, then dismiss the reports or take the product off sale. Reporting customers stay anonymous to sellers.',
            )}
          </p>
        </div>
      </div>
      {!result.items ? (
        <ServiceState error={result.error} locale={locale} retryPath="/admin/reports" />
      ) : result.items.length === 0 ? (
        <p className="notice">{lang(locale, 'Aucun signalement en attente.', 'لا توجد بلاغات معلّقة.', 'No reports waiting.')}</p>
      ) : (
        <ul className="plain-list panel-list">
          {result.items.map((item) => (
            <li key={item.productId}>
              <span>
                <strong>{item.title}</strong>
                <small>
                  {item.count} · {Object.entries(item.reasons).map(([reason, n]) => `${reasonLabel(reason, locale)} (${n})`).join(', ')} ·{' '}
                  {orderDate(item.latestAt, locale)} · {item.slug} · {item.productStatus}
                </small>
                {item.details.length > 0 && (
                  <ul className="report-details">
                    {item.details.slice(0, 5).map((text, index) => (
                      <li key={index}>« {text} »</li>
                    ))}
                  </ul>
                )}
              </span>
              <ResolveReportsForm productId={item.productId} locale={locale} />
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
