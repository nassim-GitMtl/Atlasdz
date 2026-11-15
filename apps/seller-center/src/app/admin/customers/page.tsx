import { redirect } from 'next/navigation';
import { AccountActionForm } from '@/components/admin-forms';
import { Shell } from '@/components/shell';
import { ServiceState } from '@/components/states';
import { findCustomers } from '@/lib/admin';
import { accountsCopy } from '@/lib/accounts-copy';
import { href, localeFrom, type SearchParams } from '@/lib/i18n';
import { orderDate } from '@/lib/orders-copy';
import { accessToken } from '@/lib/session';

/** Staff find a customer by email to see the account or delete it. */
export default async function AdminCustomers({ searchParams }: { readonly searchParams: Promise<SearchParams> }) {
  const query = await searchParams;
  const locale = localeFrom(query.lang);
  const t = accountsCopy[locale];
  const token = await accessToken();
  if (!token) redirect(href('/login', locale));
  const email = typeof query.email === 'string' ? query.email.trim() : '';
  const result =
    email.length >= 3
      ? await findCustomers(token, email)
          .then((data) => ({ items: data.items, error: undefined }))
          .catch((error: unknown) => ({ items: undefined, error }))
      : null;
  return (
    <Shell locale={locale} currentPath="/admin/customers" signedIn>
      <div className="page-heading">
        <div>
          <h1>{t.customers}</h1>
          <p>{t.customersBody}</p>
        </div>
      </div>
      <form className="panel panel--pad" action="/admin/customers" method="get" role="search">
        <input type="hidden" name="lang" value={locale} />
        <label htmlFor="customer-email">{t.email}</label>
        <input id="customer-email" name="email" type="search" minLength={3} maxLength={254} defaultValue={email} required />
        <button className="button small" type="submit">{t.search}</button>
      </form>
      {result &&
        (result.items ? (
          <section className="panel" aria-live="polite">
            {result.items.length === 0 ? (
              <p className="panel-empty">{t.none}</p>
            ) : (
              <ul className="plain-list panel-list">
                {result.items.map((customer) => (
                  <li key={customer.userId}>
                    <span>
                      {customer.email}
                      <small>
                        {orderDate(customer.createdAt, locale)} · {customer.status} · {customer.orders} {t.orders.toLowerCase()}
                        {customer.openOrders > 0 ? ` (${customer.openOrders} ${t.openOrders})` : ''}
                      </small>
                    </span>
                    <AccountActionForm action="close-customer" id={customer.userId} label={t.closeCustomer} locale={locale} danger warning={t.closeCustomerWarn} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <ServiceState error={result.error} locale={locale} retryPath="/admin/customers" />
        ))}
    </Shell>
  );
}
