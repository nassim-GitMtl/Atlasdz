'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { stockAlertAction } from '@/app/product/stock-alert-actions';
import { lang, localizedHref, type Locale } from '@/lib/i18n';

/** Sold out everywhere: a signed-in shopper can ask for one email when it is back. */
export function StockAlert({
  slug,
  locale,
  signedIn,
  waiting,
}: {
  readonly slug: string;
  readonly locale: Locale;
  readonly signedIn: boolean;
  readonly waiting: boolean;
}) {
  const [state, action, pending] = useActionState(stockAlertAction, {});
  const isWaiting = state.waiting ?? waiting;
  if (!signedIn)
    return (
      <div className="stock-alert">
        <p>{lang(locale, 'Épuisé chez tous les vendeurs.', 'نفد لدى جميع البائعين.', 'Sold out at every seller.')}</p>
        <Link
          className="button button--secondary"
          href={localizedHref('/login', locale, { next: `/product/${slug}` })}
        >
          {lang(locale, 'Se connecter pour être averti du retour', 'سجّل الدخول ليصلك إشعار بعودته', 'Sign in to hear when it is back')}
        </Link>
      </div>
    );
  return (
    <form action={action} className="stock-alert">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="waiting" value={isWaiting ? 'false' : 'true'} />
      <p role="status">
        {isWaiting
          ? lang(locale, 'Nous vous écrirons une fois, dès qu’il sera de nouveau disponible.', 'سنراسلك مرة واحدة فور توفره من جديد.', 'We will email you once, as soon as it is available again.')
          : lang(locale, 'Épuisé chez tous les vendeurs.', 'نفد لدى جميع البائعين.', 'Sold out at every seller.')}
      </p>
      {state.result && state.result !== 'ok' && (
        <p className="notice error" role="alert">
          {state.result === 'inStock'
            ? lang(locale, 'Il est de nouveau en stock : rechargez la page.', 'عاد إلى المخزون: أعد تحميل الصفحة.', 'It is back in stock: reload the page.')
            : state.result === 'auth'
              ? lang(locale, 'Reconnectez-vous pour continuer.', 'سجّل الدخول من جديد للمتابعة.', 'Sign in again to continue.')
              : lang(locale, 'Le service ne répond pas. Réessayez.', 'الخدمة لا تستجيب. حاول مجددًا.', 'The service is not responding. Try again.')}
        </p>
      )}
      <button className={isWaiting ? 'button button--secondary' : 'button'} type="submit" disabled={pending}>
        {isWaiting
          ? lang(locale, 'Ne plus m’avertir', 'إلغاء الإشعار', 'Stop the alert')
          : lang(locale, 'M’avertir du retour en stock', 'أعلمني عند عودته', 'Tell me when it is back')}
      </button>
    </form>
  );
}
