'use client';
import { useActionState, useState } from 'react';
import type { DeliveryDestination, SellerDeliveryRate } from '@atlas/contracts';
import { saveDeliveryAction } from '@/app/delivery/actions';
import { copy, href, type Locale } from '@/lib/i18n';
import { deliveryCopy } from '@/lib/delivery-copy';
export function DeliveryRateForm({
  destination,
  rate,
  locale,
}: {
  readonly destination: DeliveryDestination;
  readonly rate: SellerDeliveryRate | undefined;
  readonly locale: Locale;
}) {
  const [state, action, pending] = useActionState(saveDeliveryAction, {});
  const t = deliveryCopy[locale];
  const suffix = destination.id;
  const [inherited, setInherited] = useState(
    Boolean(destination.wilaya && (!rate || rate.useWilayaRate)),
  );
  const [enabled, setEnabled] = useState(rate?.enabled ?? false);
  const [fee, setFee] = useState(rate ? (rate.shippingFeeMinor / 100).toFixed(2) : '');
  const [collector, setCollector] = useState(rate?.codCollector ?? '');
  return (
    <form action={action} className="order-reject-form">
      <input type="hidden" name="destinationId" value={destination.id} />
      <input type="hidden" name="version" value={rate?.version ?? 0} />
      {destination.wilaya && (
        <label>
          <input
            type="checkbox"
            name="useWilayaRate"
            value="yes"
            checked={inherited}
            onChange={(e) => setInherited(e.target.checked)}
          />
          {t.useWilaya}
        </label>
      )}
      <fieldset disabled={inherited || pending}>
        <legend>{destination.kind === 'WILAYA' ? t.baseRate : t.custom}</legend>
        <label>
          <input
            type="checkbox"
            name="enabled"
            value="yes"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />{' '}
          {t.enabled}
        </label>
        <label htmlFor={`fee-${suffix}`}>{t.fee}</label>
        <input
          id={`fee-${suffix}`}
          name="fee"
          inputMode="decimal"
          required={enabled}
          maxLength={12}
          value={fee}
          onChange={(e) => setFee(e.target.value)}
        />
        <label htmlFor={`collector-${suffix}`}>{t.collector}</label>
        <select
          id={`collector-${suffix}`}
          name="collector"
          required={enabled}
          value={collector}
          onChange={(e) => setCollector(e.target.value as typeof collector)}
        >
          <option value="" disabled>
            —
          </option>
          <option value="SELLER">{t.SELLER}</option>
          <option value="SELLER_COURIER">{t.SELLER_COURIER}</option>
        </select>
      </fieldset>
      <label>
        <input type="checkbox" name="confirm" value="yes" required /> {t.confirm}
      </label>
      <button className="button" disabled={pending} type="submit">
        {pending ? '…' : t.save}
      </button>
      {state.saved && <p role="status">{t.saved}</p>}
      {state.error && (
        <div role="alert" className="notice error">
          <p>{copy[locale][state.error]}</p>
          <a
            href={
              state.error === 'unauthorized'
                ? href('/login', locale)
                : `${href('/delivery', locale)}&wilaya=${destination.wilaya?.id ?? (destination.kind === 'WILAYA' ? destination.id : 'test')}`
            }
          >
            {copy[locale].retry}
          </a>
        </div>
      )}
    </form>
  );
}
