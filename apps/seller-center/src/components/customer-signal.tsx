import type { CustomerSignal } from '@/lib/auth';
import type { Locale } from '@/lib/i18n';

const copy = {
  fr: {
    title: 'Fiabilité du client',
    phoneOk: 'Téléphone de livraison confirmé par SMS',
    phoneNo: 'Téléphone non confirmé — appelez le client avant d’expédier',
    history: (d: number, f: number, c: number) =>
      `${d} livrée(s), ${f} échec(s) de livraison, ${c} annulée(s)`,
    age: (days: number) => `Compte créé il y a ${days} jour(s)`,
    warn: 'Attention : livraisons non abouties récentes',
  },
  ar: {
    title: 'موثوقية العميل',
    phoneOk: 'هاتف التوصيل مؤكد عبر رسالة قصيرة',
    phoneNo: 'الهاتف غير مؤكد — اتصل بالعميل قبل الشحن',
    history: (d: number, f: number, c: number) => `${d} طلب مُسلَّم، ${f} توصيل فاشل، ${c} ملغى`,
    age: (days: number) => `أُنشئ الحساب منذ ${days} يوم`,
    warn: 'تنبيه: عمليات توصيل فاشلة حديثة',
  },
} as const;

/** COD risk hints so the seller can decide to call the customer before shipping. */
export function CustomerSignalPanel({
  signal,
  locale,
}: {
  readonly signal: CustomerSignal;
  readonly locale: Locale;
}) {
  const t = copy[locale];
  return (
    <section className="notice" aria-label={t.title}>
      <strong>{t.title}</strong>
      <p>{signal.deliveryPhoneVerified ? t.phoneOk : t.phoneNo}</p>
      <p>{t.history(signal.deliveredOrders, signal.failedDeliveries, signal.cancelledOrders)}</p>
      <p>{t.age(signal.accountAgeDays)}</p>
      {signal.failedDeliveries > 0 && <p className="notice error">{t.warn}</p>}
    </section>
  );
}
