import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { PlacePicker, type Place } from '@/components/place-picker';
import { Text } from '@/components/text';
import { text } from '@/components/ui';
import { api } from '@/lib/api';
import { localized } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { colors } from '@/lib/theme';
import type { DeliveryDestination } from '@/lib/types';
import { useRequest } from '@/lib/use-request';

const TEST_GROUP = 'test';

/** Catalogue filter: keep products a seller delivers to the chosen commune. */
export function CommuneFilter({
  value,
  onChange,
}: {
  readonly value: Place | null;
  readonly onChange: (commune: Place | null) => void;
}) {
  const { t, locale } = useI18n();
  const destinations = useRequest('delivery-destinations', () =>
    api<{ items: DeliveryDestination[] }>('/api/v1/delivery/destinations'),
  );
  const items = useMemo(() => destinations.data?.items ?? [], [destinations.data]);
  const current = value ? items.find((d) => d.id === value.id) : undefined;
  const [picked, setPicked] = useState<Place | null | undefined>(undefined);
  const wilayas = useMemo(() => {
    const byId = new Map<string, Place & { code: string }>();
    for (const d of items)
      if (d.wilaya)
        byId.set(d.wilaya.id, {
          id: d.wilaya.id,
          code: d.wilaya.code,
          label: `${d.wilaya.code} — ${localized(d.wilaya.name, locale)}`,
        });
    const list: Place[] = [...byId.values()].sort((a, b) => a.code.localeCompare(b.code));
    if (items.some((d) => !d.wilaya)) list.push({ id: TEST_GROUP, label: t.checkout.testPlaces });
    return list;
  }, [items, locale, t]);
  const wilaya =
    picked !== undefined
      ? picked
      : current
        ? (wilayas.find((w) => w.id === (current.wilaya?.id ?? TEST_GROUP)) ?? null)
        : null;
  const communes = useMemo(
    () =>
      items
        .filter((d) => (wilaya?.id === TEST_GROUP ? !d.wilaya : d.wilaya?.id === wilaya?.id))
        .map((d) => ({ id: d.id, label: localized(d.name, locale) }))
        .sort((a, b) => a.label.localeCompare(b.label, locale)),
    [items, wilaya, locale],
  );
  return (
    <View style={styles.box}>
      <Text style={text.muted}>{t.home.deliversTo}</Text>
      <PlacePicker
        label={t.checkout.wilaya}
        value={wilaya}
        places={wilayas}
        onChange={(place) => {
          setPicked(place);
          onChange(null);
        }}
      />
      <PlacePicker
        label={t.checkout.commune}
        value={value}
        places={communes}
        disabled={wilaya === null}
        onChange={onChange}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setPicked(null);
            onChange(null);
          }}
        >
          <Text style={styles.clear}>{t.home.anyCommune}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 6 },
  clear: { color: colors.primary, fontWeight: '600', paddingVertical: 8 },
});
