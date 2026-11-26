import Link from 'next/link';
import { UuidSchema } from '@atlas/contracts';
import { notFound, redirect } from 'next/navigation';
import { OrderDocument } from '@/components/order-document';
import { PrintButton } from '@/components/print-button';
import { getSellerOrder } from '@/lib/api';
import { href, lang, localeFrom, type SearchParams } from '@/lib/i18n';
import { accessToken } from '@/lib/session';

/** Printable order summary to put in the parcel (no workspace chrome). */
export default async function PrintSellerOrder({
  params,
  searchParams,
}: {
  readonly params: Promise<{ sellerOrderId: string }>;
  readonly searchParams: Promise<SearchParams>;
}) {
  const { sellerOrderId } = await params;
  const locale = localeFrom((await searchParams).lang);
  if (!UuidSchema.safeParse(sellerOrderId).success) notFound();
  const token = await accessToken();
  if (!token) redirect(href('/login', locale));
  const order = await getSellerOrder(token, sellerOrderId).catch(() => null);
  if (!order) notFound();
  return (
    <main className="print-page" dir={locale === 'ar' ? 'rtl' : 'ltr'} lang={locale}>
      <div className="print-page__bar no-print">
        <Link href={href(`/orders/${sellerOrderId}`, locale)}>
          {lang(locale, 'Retour à la commande', 'العودة إلى الطلب', 'Back to the order')}
        </Link>
        <PrintButton label={lang(locale, 'Imprimer / enregistrer en PDF', 'طباعة / حفظ PDF', 'Print / save as PDF')} />
      </div>
      <p className="print-page__brand" dir="ltr">atlas dz</p>
      <OrderDocument sellerOrder={order} locale={locale} />
    </main>
  );
}
