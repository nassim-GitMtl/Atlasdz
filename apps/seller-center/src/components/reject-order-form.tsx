'use client';
import { useActionState } from 'react';
import { rejectOrderAction } from '@/app/orders/actions';
import { copy, type Locale } from '@/lib/i18n';
import { orderText } from '@/lib/orders-copy';
export function RejectOrderForm({
  id,
  version,
  locale,
  live = false,
}: {
  readonly id: string;
  readonly version: number;
  readonly locale: Locale;
  readonly live?: boolean;
}) {
  const [state, action, pending] = useActionState(rejectOrderAction, {});
  const t = orderText(locale, live);
  return (
    <form action={action} className="order-reject-form">
      <input type="hidden" name="sellerOrderId" value={id} />
      <input type="hidden" name="version" value={version} />
      <label htmlFor="rejection-reason">{t.reason}</label>
      <select id="rejection-reason" name="reasonCode" required defaultValue="">
        <option value="" disabled>
          {t.chooseReason}
        </option>
        {(['OUT_OF_STOCK', 'DELIVERY_UNAVAILABLE', 'UNABLE_TO_FULFILL'] as const).map((reason) => (
          <option key={reason} value={reason}>
            {t[reason]}
          </option>
        ))}
      </select>
      <label>
        <input type="checkbox" name="confirm" value="yes" required /> {t.confirm}
      </label>
      <button type="submit" className="button secondary" disabled={pending || state.rejected}>
        {pending ? t.busy : t.reject}
      </button>
      {state.error && (
        <p className="notice error" role="alert">
          {copy[locale][state.error]}
        </p>
      )}
      {state.rejected && <p role="status">{t.rejected}</p>}
    </form>
  );
}
