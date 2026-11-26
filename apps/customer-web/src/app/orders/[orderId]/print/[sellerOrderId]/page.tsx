import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { UuidSchema } from '@atlas/contracts';
import { OrderDocument } from '@/components/order-document';
import { PrintButton } from '@/components/print-button';
import { customerToken } from '@/lib/cart-api';
import { getOrder } from '@/lib/orders-api';
import { lang, localizedHref, resolveLocale, type SearchParams } from '@/lib/i18n';

export const metadata = { robots: { index: false } };

/** Printable order summary for one seller's part of the customer's order (no site chrome). */
export default async function PrintOrder({
  params,
  searchParams,
}: {
  readonly params: Promise<{ orderId: string; sellerOrderId: string }>;
  readonly searchParams: Promise<SearchParams>;
}) {
  const { orderId, sellerOrderId } = await params;
  const locale = resolveLocale((await searchParams).lang);
  const back = localizedHref(`/orders/${orderId}`, locale);
  const token = await customerToken();
  if (!token) redirect(localizedHref('/login', locale, { next: `/orders/${orderId}` }));
  if (!UuidSchema.safeParse(orderId).success || !UuidSchema.safeParse(sellerOrderId).success) notFound();
  const order = await getOrder(token, orderId).catch(() => null);
  const sellerOrder = order?.sellerOrders.find((item) => item.id === sellerOrderId);
  if (!order || !sellerOrder) notFound();
  return (
    <main className="print-page" dir={locale === 'ar' ? 'rtl' : 'ltr'} lang={locale}>
      <div className="print-page__bar no-print">
        <Link href={back}>{lang(locale, 'Retour à la commande', 'العودة إلى الطلب', 'Back to the order')}</Link>
        <PrintButton label={lang(locale, 'Imprimer / enregistrer en PDF', 'طباعة / حفظ PDF', 'Print / save as PDF')} />
      </div>
      <p className="print-page__brand" dir="ltr">atlas dz</p>
      <OrderDocument order={order} sellerOrder={sellerOrder} locale={locale} />
    </main>
  );
}
