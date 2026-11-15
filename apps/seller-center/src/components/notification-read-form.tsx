'use client';
import { useActionState } from 'react';
import type { NotificationReadInput } from '@atlas/contracts';
import { readNotificationAction } from '@/app/notifications/actions';
import { copy, type Locale, lang } from '@/lib/i18n';

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
      <button type="submit" className="button secondary" disabled={pending}>
        {pending ? copy[locale].submitting : lang(locale, 'Marquer comme lu', 'تحديد كمقروء', 'Mark as read')}
      </button>
      {state.error && (
        <p className="notice error" role="alert">
          {copy[locale][state.error]}
        </p>
      )}
    </form>
  );
}
