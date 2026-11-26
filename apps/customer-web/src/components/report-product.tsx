'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { REPORT_REASONS } from '@atlas/contracts';
import { reportProductAction } from '@/app/product/report-actions';
import { lang, localizedHref, type Locale } from '@/lib/i18n';

const reasonLabels = {
  COUNTERFEIT: ['Contrefaçon', 'منتج مقلَّد', 'Counterfeit'],
  PROHIBITED: ['Produit interdit à la vente', 'منتج ممنوع بيعه', 'Prohibited item'],
  MISLEADING: ['Description ou photos trompeuses', 'وصف أو صور مضلِّلة', 'Misleading description or photos'],
  OFFENSIVE: ['Contenu choquant', 'محتوى مسيء', 'Offensive content'],
  OTHER: ['Autre problème', 'مشكلة أخرى', 'Another problem'],
} as const;

/** A discreet way to tell the Atlas DZ team about a problem with a listing. */
export function ReportProduct({
  slug,
  locale,
  signedIn,
}: {
  readonly slug: string;
  readonly locale: Locale;
  readonly signedIn: boolean;
}) {
  const [state, action, pending] = useActionState(reportProductAction, {});
  const message = {
    sent: lang(locale, 'Merci. L’équipe Atlas DZ va examiner ce produit.', 'شكرًا. سيراجع فريق Atlas DZ هذا المنتج.', 'Thank you. The Atlas DZ team will review this product.'),
    invalid: lang(locale, 'Choisissez un motif (500 caractères au plus pour les détails).', 'اختر سببًا (500 حرف كحد أقصى للتفاصيل).', 'Choose a reason (500 characters at most for details).'),
    auth: lang(locale, 'Reconnectez-vous pour continuer.', 'سجّل الدخول من جديد للمتابعة.', 'Sign in again to continue.'),
    limit: lang(locale, 'Trop de signalements aujourd’hui. Réessayez demain.', 'بلاغات كثيرة اليوم. حاول غدًا.', 'Too many reports today. Try again tomorrow.'),
    csrf: lang(locale, 'Rechargez la page et réessayez.', 'أعد تحميل الصفحة وحاول مجددًا.', 'Reload the page and try again.'),
    unavailable: lang(locale, 'Le service ne répond pas. Réessayez.', 'الخدمة لا تستجيب. حاول مجددًا.', 'The service is not responding. Try again.'),
  };
  const index = locale === 'fr' ? 0 : locale === 'ar' ? 1 : 2;
  return (
    <details className="report-product">
      <summary>{lang(locale, 'Signaler un problème avec ce produit', 'الإبلاغ عن مشكلة في هذا المنتج', 'Report a problem with this product')}</summary>
      {!signedIn ? (
        <Link href={localizedHref('/login', locale, { next: `/product/${slug}` })}>
          {lang(locale, 'Se connecter pour signaler ce produit', 'سجّل الدخول للإبلاغ عن هذا المنتج', 'Sign in to report this product')}
        </Link>
      ) : state.result === 'sent' ? (
        <p className="notice success" role="status">{message.sent}</p>
      ) : (
        <form action={action} className="ask-question">
          <input type="hidden" name="slug" value={slug} />
          <label htmlFor="report-reason">{lang(locale, 'Motif', 'السبب', 'Reason')}</label>
          <select id="report-reason" name="reason" required defaultValue="">
            <option value="" disabled>
              {lang(locale, 'Choisir…', 'اختر…', 'Choose…')}
            </option>
            {REPORT_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {reasonLabels[reason][index]}
              </option>
            ))}
          </select>
          <label htmlFor="report-details">{lang(locale, 'Détails (facultatif)', 'تفاصيل (اختياري)', 'Details (optional)')}</label>
          <textarea id="report-details" name="details" maxLength={500} rows={3} />
          <small>
            {lang(
              locale,
              'Votre signalement est lu par l’équipe Atlas DZ ; le vendeur ne voit pas votre nom.',
              'يقرأ فريق Atlas DZ بلاغك، ولا يرى البائع اسمك.',
              'Your report is read by the Atlas DZ team; the seller does not see your name.',
            )}
          </small>
          {state.result && (
            <p className="notice error" role="alert">
              {message[state.result]}
            </p>
          )}
          <button className="button button--secondary" type="submit" disabled={pending}>
            {lang(locale, 'Envoyer le signalement', 'إرسال البلاغ', 'Send the report')}
          </button>
        </form>
      )}
    </details>
  );
}
