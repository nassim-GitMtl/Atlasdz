import { useState } from 'react';
import { PlacePicker } from './place-picker';
import { LoadState, Notice } from './ui';
import { api } from '@/lib/api';
import { destinationGroup } from '@/lib/cart-delivery';
import { localized } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { DeliveryDestination } from '@/lib/types';
import { useRequest } from '@/lib/use-request';

export function CartDestination({
  value,
  onChange,
}: {
  readonly value: string | null;
  readonly onChange: (id: string | null) => void;
}) {
  const { t, locale } = useI18n();
  const [wilayaId, setWilayaId] = useState<string | null>(null);
  const destinations = useRequest('cart-destinations', () =>
    api<{ items: DeliveryDestination[] }>('/api/v1/delivery/destinations'),
  );
  const items = destinations.data?.items ?? [];
  const wilayas = [
    ...new Map(
      items
        .filter((item) => item.wilaya)
        .map((item) => [
          item.wilaya!.id,
          {
            id: item.wilaya!.id,
            label: `${item.wilaya!.code} — ${localized(item.wilaya!.name, locale)}`,
          },
        ]),
    ).values(),
  ].sort((a, b) => a.label.localeCompare(b.label, locale));
  if (items.some((item) => !item.wilaya))
    wilayas.push({ id: 'test', label: t.checkout.testPlaces });
  const communes = items
    .filter((item) => destinationGroup(item) === wilayaId)
    .map((item) => ({ id: item.id, label: localized(item.name, locale) }))
    .sort((a, b) => a.label.localeCompare(b.label, locale));
  return (
    <>
      <LoadState
        loading={destinations.loading && !destinations.data}
        error={destinations.error}
        onRetry={() => void destinations.reload()}
      />
      {destinations.data && !items.length && <Notice>{t.checkout.noPlaces}</Notice>}
      <PlacePicker
        label={t.checkout.wilaya}
        value={wilayas.find((item) => item.id === wilayaId) ?? null}
        places={wilayas}
        onChange={(place) => {
          setWilayaId(place.id);
          onChange(null);
        }}
      />
      <PlacePicker
        label={t.checkout.commune}
        value={communes.find((item) => item.id === value) ?? null}
        places={communes}
        disabled={!wilayaId}
        onChange={(place) => onChange(place.id)}
      />
    </>
  );
}
