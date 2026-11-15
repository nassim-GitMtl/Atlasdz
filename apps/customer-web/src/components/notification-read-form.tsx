'use client';
import { useActionState } from 'react';
import type { NotificationReadInput } from '@atlas/contracts';
import { readNotificationAction } from '@/app/notifications/actions';
import type { Locale } from '@/lib/i18n';
import { lang } from '@/lib/i18n';

export function NotificationReadForm({
  input,
  locale,
}: {
  readonly input: NotificationReadInput;
  readonly locale: Locale;
}) {
  const [state, action, pending] = useActionState(readNotificationAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="sellerOrderId" value={input.sellerOrderId} />
      <input type="hidden" name="version" value={input.version} />
      <button type="submit" className="button button--secondary" disabled={pending || state.saved}>
        {pending
          ? lang(locale, 'Enregistrement…', 'جارٍ الحفظ…', 'Saving…')
          : state.saved
            ? lang(locale, 'Lu', 'مقروء', 'Read')
            : lang(locale, 'Marquer comme lu', 'تحديد كمقروء', 'Mark as read')}
      </button>
      {state.error && (
        <p role="alert">
          {lang(
            locale,
            'Enregistrement impossible. Rechargez la page, reconnectez-vous si nécessaire et réessayez.',
            'تعذر الحفظ. أعد تحميل الصفحة وسجل الدخول إذا لزم الأمر، ثم حاول مجدداً.',
            'Could not save. Reload the page, sign in again if needed, and try again.',
          )}
        </p>
      )}
    </form>
  );
}
