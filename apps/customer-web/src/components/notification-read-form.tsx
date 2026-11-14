'use client';
import { useActionState } from 'react';
import type { NotificationReadInput } from '@atlas/contracts';
import { readNotificationAction } from '@/app/notifications/actions';
import type { Locale } from '@/lib/i18n';

export function NotificationReadForm({
  input,
  locale,
}: {
  readonly input: NotificationReadInput;
  readonly locale: Locale;
}) {
  const [state, action, pending] = useActionState(readNotificationAction, {});
  const ar = locale === 'ar';
  return (
    <form action={action}>
      <input type="hidden" name="sellerOrderId" value={input.sellerOrderId} />
      <input type="hidden" name="version" value={input.version} />
      <button type="submit" className="button button--secondary" disabled={pending || state.saved}>
        {pending
          ? ar
            ? 'جارٍ الحفظ…'
            : 'Enregistrement…'
          : state.saved
            ? ar
              ? 'مقروء'
              : 'Lu'
            : ar
              ? 'تحديد كمقروء'
              : 'Marquer comme lu'}
      </button>
      {state.error && (
        <p role="alert">
          {ar
            ? 'تعذر الحفظ. أعد تحميل الصفحة وسجل الدخول إذا لزم الأمر، ثم حاول مجدداً.'
            : 'Enregistrement impossible. Rechargez la page, reconnectez-vous si nécessaire et réessayez.'}
        </p>
      )}
    </form>
  );
}
