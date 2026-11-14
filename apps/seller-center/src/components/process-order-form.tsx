'use client';
import { useActionState } from 'react';
import type { SellerOrder } from '@atlas/contracts';
import { processOrderAction } from '@/app/orders/actions';
import { copy, href, type Locale } from '@/lib/i18n';
import { orderText } from '@/lib/orders-copy';
export function ProcessOrderForm({
  order,
  locale,
}: {
  readonly order: SellerOrder;
  readonly locale: Locale;
}) {
  const [state, action, pending] = useActionState(processOrderAction, {});
  const live = order.dataClass === 'live';
  const t = orderText(locale, live);
  const next =
    order.status === 'AWAITING_SELLER'
      ? 'ACCEPT'
      : order.status === 'ACCEPTED'
        ? 'PREPARE'
        : order.status === 'PREPARING'
          ? 'SHIP'
          : order.status === 'SHIPPED'
            ? 'REPORT_DELIVERY'
            : null;
  if (!next) return null;
  return (
    <form action={action} className="order-reject-form">
      <input name="sellerOrderId" type="hidden" value={order.id} />
      <input name="version" type="hidden" value={order.version} />
      <input name="dataClass" type="hidden" value={order.dataClass} />
      {next === 'SHIP' && (
        <>
          <p>{t.shippingHint}</p>
          <label htmlFor="test-carrier">{t.carrier}</label>
          <input
            id="test-carrier"
            name="carrier"
            required
            minLength={2}
            maxLength={80}
            placeholder={live ? undefined : 'TEST Carrier'}
          />
          <label htmlFor="test-tracking">{t.tracking}</label>
          <input
            id="test-tracking"
            name="trackingReference"
            required
            minLength={3}
            maxLength={80}
            pattern="[A-Za-z0-9_\-]+"
            placeholder={live ? undefined : 'TEST-001'}
          />
        </>
      )}
      <label>
        <input type="checkbox" name="confirm" value="yes" required /> {t.processConfirm}
      </label>
      <button className="button" name="action" value={next} type="submit" disabled={pending}>
        {pending ? t.busy : t[next]}
      </button>
      {next === 'REPORT_DELIVERY' && (
        <button
          className="button secondary"
          name="action"
          value="REPORT_DELIVERY_FAILED"
          type="submit"
          disabled={pending}
        >
          {t.REPORT_DELIVERY_FAILED}
        </button>
      )}
      {state.error && (
        <div className="notice error" role="alert">
          <p>{copy[locale][state.error]}</p>
          <a href={href(state.error === 'unauthorized' ? '/login' : `/orders/${order.id}`, locale)}>
            {state.error === 'unauthorized' ? copy[locale].reconnect : copy[locale].retry}
          </a>
        </div>
      )}
    </form>
  );
}
