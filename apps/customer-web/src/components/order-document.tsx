import type { CustomerOrder, SellerOrder } from '@atlas/contracts';
import { formatMoney } from '@/lib/catalog-view';
import { deliveryDaysLabel } from '@/lib/delivery-days';
import { lang, text, type Locale } from '@/lib/i18n';
import { orderDate } from '@/lib/orders-copy';

const registerLabel = (kind: string, locale: Locale) =>
  ({
    COMMERCE: lang(locale, 'Registre du commerce', 'السجل التجاري', 'Commerce register'),
    ARTISAN: lang(locale, 'Carte d’artisan', 'بطاقة الحرفي', 'Craftsman card'),
    AUTO_ENTREPRENEUR: lang(locale, 'Carte d’auto-entrepreneur', 'بطاقة المقاول الذاتي', 'Auto-entrepreneur card'),
  })[kind] ?? kind;

/**
 * Printable summary of one seller's part of an order: seller legal identity (law 18-05) as
 * recorded when the order was placed, delivery details, lines and the amount paid on delivery.
 */
export function OrderDocument({
  order,
  sellerOrder,
  locale,
}: {
  readonly order: CustomerOrder;
  readonly sellerOrder: SellerOrder;
  readonly locale: Locale;
}) {
  const snapshot = sellerOrder.snapshot;
  const legal = snapshot.sellerLegal ?? null;
  const contact = sellerOrder.deliveryContact ?? order.quote.deliveryContact ?? null;
  const destination = snapshot.deliveryRate?.destination ?? order.quote.destination ?? null;
  const days = snapshot.deliveryRate?.deliveryDays ?? null;
  const live = sellerOrder.paymentState === 'CASH_ON_DELIVERY';
  return (
    <article className="order-document">
      <h1>{lang(locale, 'Récapitulatif de commande', 'ملخص الطلب', 'Order summary')}</h1>
      <dl className="order-document__meta">
        <dt>{lang(locale, 'N° de commande vendeur', 'رقم طلب البائع', 'Seller order no.')}</dt>
        <dd><bdi>{sellerOrder.id}</bdi></dd>
        <dt>{lang(locale, 'Commande', 'الطلب', 'Order')}</dt>
        <dd><bdi>{order.id}</bdi></dd>
        <dt>{lang(locale, 'Passée le', 'تاريخ الطلب', 'Placed on')}</dt>
        <dd>{orderDate(sellerOrder.createdAt, locale)}</dd>
      </dl>
      <div className="order-document__parties">
        <section>
          <h2>{lang(locale, 'Vendeur', 'البائع', 'Seller')}</h2>
          {legal ? (
            <dl>
              <dt>{lang(locale, 'Nom ou raison sociale', 'الاسم أو التسمية التجارية', 'Name or company name')}</dt>
              <dd>{legal.legalName}</dd>
              <dt>{registerLabel(legal.registerKind, locale)}</dt>
              <dd><bdi>{legal.registerNumber}</bdi></dd>
              <dt>{lang(locale, 'NIF', 'رقم التعريف الجبائي', 'Tax ID (NIF)')}</dt>
              <dd><bdi>{legal.taxId}</bdi></dd>
              <dt>{lang(locale, 'Adresse', 'العنوان', 'Address')}</dt>
              <dd>{legal.address}</dd>
              <dt>{lang(locale, 'Téléphone', 'الهاتف', 'Phone')}</dt>
              <dd><bdi dir="ltr">{legal.phone}</bdi></dd>
              <dt>{lang(locale, 'E-mail', 'البريد الإلكتروني', 'Email')}</dt>
              <dd><bdi dir="ltr">{legal.email}</bdi></dd>
            </dl>
          ) : (
            <p>
              <strong>{snapshot.sellerName}</strong>
              <br />
              {lang(
                locale,
                'Identité légale non renseignée par le vendeur au moment de la commande.',
                'لم يُكمل البائع معلوماته القانونية وقت الطلب.',
                'The seller had not completed its legal identity when the order was placed.',
              )}
            </p>
          )}
          <p className="order-document__shop">
            {lang(locale, 'Boutique', 'المتجر', 'Shop')} : {snapshot.sellerName}
          </p>
        </section>
        <section>
          <h2>{lang(locale, 'Livraison', 'التوصيل', 'Delivery')}</h2>
          {contact ? (
            <dl>
              <dt>{lang(locale, 'Destinataire', 'المستلم', 'Recipient')}</dt>
              <dd>{contact.recipientName}</dd>
              <dt>{lang(locale, 'Téléphone', 'الهاتف', 'Phone')}</dt>
              <dd><bdi dir="ltr">{contact.phone}</bdi></dd>
              <dt>{lang(locale, 'Adresse', 'العنوان', 'Address')}</dt>
              <dd>
                {contact.addressLine}, {contact.city}
              </dd>
              {contact.note && (
                <>
                  <dt>{lang(locale, 'Indications', 'إرشادات', 'Notes')}</dt>
                  <dd>{contact.note}</dd>
                </>
              )}
              {destination && (
                <>
                  <dt>{lang(locale, 'Commune', 'البلدية', 'Commune')}</dt>
                  <dd>
                    {text(destination.name, locale)}
                    {destination.wilaya ? ` (${destination.wilaya.code} — ${text(destination.wilaya.name, locale)})` : ''}
                  </dd>
                </>
              )}
              {days && (
                <>
                  <dt>{lang(locale, 'Délai annoncé', 'المدة المعلنة', 'Stated time')}</dt>
                  <dd>
                    {deliveryDaysLabel(days, locale)}{' '}
                    {lang(locale, 'après expédition (selon le vendeur)', 'بعد الشحن (حسب البائع)', 'after shipping (per the seller)')}
                  </dd>
                </>
              )}
            </dl>
          ) : (
            <p>{lang(locale, 'Coordonnées non disponibles.', 'المعلومات غير متوفرة.', 'Details not available.')}</p>
          )}
        </section>
      </div>
      <table className="order-document__lines">
        <thead>
          <tr>
            <th scope="col">{lang(locale, 'Article', 'المنتج', 'Item')}</th>
            <th scope="col">{lang(locale, 'Qté', 'الكمية', 'Qty')}</th>
            <th scope="col">{lang(locale, 'Prix unitaire', 'سعر الوحدة', 'Unit price')}</th>
            <th scope="col">{lang(locale, 'Total', 'المجموع', 'Total')}</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.items.map((item) => (
            <tr key={item.offerId}>
              <td>{text(item.title, locale)}</td>
              <td>{item.quantity}</td>
              <td><bdi>{formatMoney(item.unitPriceMinor, locale)}</bdi></td>
              <td><bdi>{formatMoney(item.unitPriceMinor * item.quantity, locale)}</bdi></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={3}>{lang(locale, 'Articles', 'المنتجات', 'Items')}</th>
            <td><bdi>{formatMoney(snapshot.itemsSubtotalMinor, locale)}</bdi></td>
          </tr>
          <tr>
            <th scope="row" colSpan={3}>{lang(locale, 'Livraison', 'التوصيل', 'Delivery')}</th>
            <td><bdi>{formatMoney(snapshot.shippingFeeMinor, locale)}</bdi></td>
          </tr>
          <tr className="order-document__total">
            <th scope="row" colSpan={3}>
              {live
                ? lang(locale, 'Total à payer à la livraison', 'المجموع المستحق عند الاستلام', 'Total due on delivery')
                : lang(locale, 'Total (commande de test)', 'المجموع (طلب تجريبي)', 'Total (test order)')}
            </th>
            <td><bdi>{formatMoney(snapshot.totalMinor, locale)}</bdi></td>
          </tr>
        </tfoot>
      </table>
      <p>
        {live
          ? lang(
              locale,
              'Paiement en espèces à la réception, au vendeur ou à son livreur.',
              'الدفع نقدًا عند الاستلام للبائع أو لمندوب التوصيل.',
              'Cash payment on receipt, to the seller or its courier.',
            )
          : lang(locale, 'Commande de test : aucun paiement ni livraison.', 'طلب تجريبي: لا دفع ولا توصيل.', 'Test order: no payment or delivery.')}
      </p>
      <p className="order-document__note">
        {lang(
          locale,
          'Récapitulatif établi par Atlas DZ à partir de la commande. Il ne remplace pas la facture remise par le vendeur. Identité du vendeur telle que déclarée au moment de la commande (loi 18-05).',
          'ملخص أعدّته Atlas DZ انطلاقًا من الطلب، ولا يعوّض الفاتورة التي يسلّمها البائع. هوية البائع كما صرّح بها وقت الطلب (القانون 18-05).',
          'Summary prepared by Atlas DZ from the order. It does not replace the invoice given by the seller. Seller identity as declared when the order was placed (law 18-05).',
        )}
      </p>
    </article>
  );
}
