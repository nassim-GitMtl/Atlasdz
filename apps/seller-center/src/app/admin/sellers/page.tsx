import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Shell } from '@/components/shell';
import { ServiceState } from '@/components/states';
import { getSellers } from '@/lib/admin';
import { accountsCopy } from '@/lib/accounts-copy';
import { href, localeFrom, type SearchParams } from '@/lib/i18n';
import { accessToken } from '@/lib/session';

export default async function AdminSellers({ searchParams }: { readonly searchParams: Promise<SearchParams> }) {
  const locale = localeFrom((await searchParams).lang);
  const t = accountsCopy[locale];
  const token = await accessToken();
  if (!token) redirect(href('/login', locale));
  const result = await getSellers(token)
    .then((data) => ({ items: data.items, error: undefined }))
    .catch((error: unknown) => ({ items: undefined, error }));
  return (
    <Shell locale={locale} currentPath="/admin/sellers" signedIn>
      <div className="page-heading">
        <div>
          <h1>{t.sellers}</h1>
          <p>{t.sellersBody}</p>
        </div>
      </div>
      {result.items ? (
        <section className="panel">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t.sellers}</th>
                  <th scope="col">{t.status}</th>
                  <th scope="col" className="num">{t.offers}</th>
                  <th scope="col" className="num">{t.orders}</th>
                  <th scope="col"><span className="sr-only">{t.open}</span></th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((seller) => (
                  <tr key={seller.sellerId}>
                    <td>
                      <strong>{seller.name}</strong>
                      <small className="row-ref">/{seller.slug}</small>
                    </td>
                    <td>
                      <span className={`badge badge--${seller.closedAt ? 'bad' : seller.status === 'APPROVED' ? 'good' : 'wait'}`}>
                        {seller.closedAt ? t.closed : seller.status}
                      </span>
                    </td>
                    <td className="num">{seller.approvedOffers}</td>
                    <td className="num">{seller.orders}</td>
                    <td className="end">
                      <Link className="button secondary small" href={href(`/admin/sellers/${seller.sellerId}`, locale)}>
                        {t.open}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <ServiceState error={result.error} locale={locale} retryPath="/admin/sellers" />
      )}
    </Shell>
  );
}
