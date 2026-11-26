import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { PlacePicker, type Place } from '@/components/place-picker';
import {
  Button,
  Card,
  Checkbox,
  Field,
  LoadState,
  Notice,
  Screen,
  Segmented,
  text,
} from '@/components/ui';
import { errorCode } from '@/lib/api';
import { dinarsText, parseDinars } from '@/lib/collections';
import { formatMoney, localized } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { errorMessage } from '@/lib/strings';
import { colors } from '@/lib/theme';
import type { DeliveryDestination, SellerDeliveryRate } from '@/lib/types';
import { useRequest } from '@/lib/use-request';

const TEST_GROUP = 'test';
type Collector = 'SELLER' | 'SELLER_COURIER';
type Mode = 'inherit' | 'custom' | 'off';

/** Where the seller delivers: a rate per wilaya, with optional per-commune exceptions. */
export default function DeliveryScreen() {
  const { t, locale } = useI18n();
  const session = useSession();
  const destinations = useRequest('destinations', () =>
    session.request<{ items: DeliveryDestination[] }>('/api/v1/delivery/destinations'),
  );
  const rates = useRequest('seller-rates', () =>
    session.request<{ items: SellerDeliveryRate[] }>('/api/v1/seller/delivery'),
  );
  const [wilaya, setWilaya] = useState<Place | null>(null);

  const items = useMemo(() => destinations.data?.items ?? [], [destinations.data]);
  const wilayas = useMemo(() => {
    const byId = new Map<string, Place & { code: string }>();
    for (const d of items) {
      if (d.wilaya) {
        byId.set(d.wilaya.id, {
          id: d.wilaya.id,
          code: d.wilaya.code,
          label: `${d.wilaya.code} — ${localized(d.wilaya.name, locale)}`,
        });
      }
    }
    const list: Place[] = [...byId.values()].sort((a, b) => a.code.localeCompare(b.code));
    if (items.some((d) => !d.wilaya)) list.push({ id: TEST_GROUP, label: t.checkout.testPlaces });
    return list;
  }, [items, locale, t]);
  const test = wilaya?.id === TEST_GROUP;
  const communes = items
    .filter((d) => (test ? !d.wilaya : d.wilaya?.id === wilaya?.id))
    .sort((a, b) => localized(a.name, locale).localeCompare(localized(b.name, locale), locale));
  const rateFor = (destinationId: string) =>
    rates.data?.items.find((rate) => rate.destination.id === destinationId);
  const base = wilaya && !test ? rateFor(wilaya.id) : undefined;
  const reload = () => void rates.reload();

  return (
    <Screen refreshing={rates.loading && !!rates.data} onRefresh={reload}>
      <Text style={text.muted}>{t.delivery.intro}</Text>
      <LoadState
        loading={(destinations.loading && !destinations.data) || (rates.loading && !rates.data)}
        error={destinations.error ?? rates.error}
        onRetry={() => {
          void destinations.reload();
          reload();
        }}
      />
      {destinations.data && rates.data ? (
        <>
          <PlacePicker
            label={t.checkout.wilaya}
            value={wilaya}
            places={wilayas}
            onChange={setWilaya}
          />
          {wilaya && !test ? (
            <WilayaRate
              key={`${wilaya.id}-${base?.version ?? 0}`}
              wilayaId={wilaya.id}
              base={base}
              onSaved={reload}
            />
          ) : null}
          {wilaya ? <Text style={text.heading}>{t.delivery.communes}</Text> : null}
          {wilaya
            ? communes.map((commune) => {
                const rate = rateFor(commune.id);
                return (
                  <CommuneRate
                    key={`${commune.id}-${rate?.version ?? 0}`}
                    commune={commune}
                    rate={rate}
                    base={base}
                    canInherit={!test}
                    onSaved={reload}
                  />
                );
              })
            : null}
        </>
      ) : null}
    </Screen>
  );
}

/** Both empty: no stated time (null); a valid 1–30 range; anything else is invalid (undefined). */
function parseDays(min: string, max: string): { min: number; max: number } | null | undefined {
  if (min.trim() === '' && max.trim() === '') return null;
  const low = Number(min);
  const high = Number(max);
  if (!Number.isInteger(low) || !Number.isInteger(high)) return undefined;
  return low >= 1 && high <= 30 && high >= low ? { min: low, max: high } : undefined;
}

function WilayaRate({
  wilayaId,
  base,
  onSaved,
}: {
  readonly wilayaId: string;
  readonly base: SellerDeliveryRate | undefined;
  readonly onSaved: () => void;
}) {
  const { t } = useI18n();
  const session = useSession();
  const [enabled, setEnabled] = useState(base?.enabled ?? true);
  const [fee, setFee] = useState(base ? dinarsText(base.shippingFeeMinor) : '');
  const [collector, setCollector] = useState<Collector>(base?.codCollector ?? 'SELLER');
  const [minDays, setMinDays] = useState(base?.deliveryDays ? String(base.deliveryDays.min) : '');
  const [maxDays, setMaxDays] = useState(base?.deliveryDays ? String(base.deliveryDays.max) : '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const feeMinor = parseDinars(fee);
  const days = parseDays(minDays, maxDays);

  async function save() {
    if (feeMinor === null || days === undefined) return;
    setBusy(true);
    setFailure(null);
    setNotice(null);
    try {
      await session.request(`/api/v1/seller/delivery/${wilayaId}`, {
        body: {
          expectedVersion: base?.version ?? 0,
          enabled,
          shippingFeeMinor: feeMinor,
          codCollector: collector,
          deliveryDays: enabled ? days : null,
        },
      });
      setNotice(t.delivery.saved);
      onSaved();
    } catch (error) {
      setFailure(errorCode(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Text style={text.heading}>{t.delivery.wilayaRate}</Text>
      <Checkbox
        checked={enabled}
        label={t.delivery.deliver}
        onToggle={() => setEnabled(!enabled)}
      />
      {enabled ? (
        <>
          <Field
            label={t.delivery.fee}
            value={fee}
            onChangeText={setFee}
            keyboardType="decimal-pad"
            error={fee !== '' && feeMinor === null}
          />
          <Text style={text.muted}>{t.delivery.collector}</Text>
          <Segmented<Collector>
            options={[
              ['SELLER', t.delivery.SELLER],
              ['SELLER_COURIER', t.delivery.SELLER_COURIER],
            ]}
            value={collector}
            onChange={setCollector}
          />
          <Field
            label={t.delivery.daysMin}
            hint={t.delivery.daysHint}
            value={minDays}
            onChangeText={setMinDays}
            keyboardType="number-pad"
            maxLength={2}
            error={enabled && days === undefined}
          />
          <Field
            label={t.delivery.daysMax}
            value={maxDays}
            onChangeText={setMaxDays}
            keyboardType="number-pad"
            maxLength={2}
            error={enabled && days === undefined}
          />
        </>
      ) : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {failure ? <Notice tone="error">{errorMessage(t, failure)}</Notice> : null}
      <Button
        label={t.common.save}
        busy={busy}
        disabled={feeMinor === null || (enabled && days === undefined)}
        onPress={() => void save()}
      />
    </Card>
  );
}

function CommuneRate({
  commune,
  rate,
  base,
  canInherit,
  onSaved,
}: {
  readonly commune: DeliveryDestination;
  readonly rate: SellerDeliveryRate | undefined;
  readonly base: SellerDeliveryRate | undefined;
  readonly canInherit: boolean;
  readonly onSaved: () => void;
}) {
  const { t, locale } = useI18n();
  const session = useSession();
  const initial: Mode = !rate
    ? canInherit
      ? 'inherit'
      : 'off'
    : rate.useWilayaRate
      ? 'inherit'
      : rate.enabled
        ? 'custom'
        : 'off';
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(initial);
  const [fee, setFee] = useState(
    rate && !rate.useWilayaRate ? dinarsText(rate.shippingFeeMinor) : '',
  );
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const feeMinor = parseDinars(fee);

  const summary =
    initial === 'inherit'
      ? base?.enabled
        ? `${t.delivery.inherit} · ${formatMoney(base.shippingFeeMinor, locale)}`
        : t.delivery.off
      : initial === 'custom' && rate
        ? `${t.delivery.custom} · ${formatMoney(rate.shippingFeeMinor, locale)}`
        : t.delivery.off;

  async function save() {
    setBusy(true);
    setFailure(null);
    try {
      await session.request(`/api/v1/seller/delivery/${commune.id}`, {
        body: {
          expectedVersion: rate?.version ?? 0,
          enabled: mode !== 'off',
          shippingFeeMinor: mode === 'custom' ? (feeMinor ?? 0) : (base?.shippingFeeMinor ?? 0),
          codCollector: base?.codCollector ?? rate?.codCollector ?? 'SELLER',
          useWilayaRate: mode === 'inherit',
        },
      });
      setOpen(false);
      onSaved();
    } catch (error) {
      setFailure(errorCode(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.commune}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={styles.communeHeader}
      >
        <Text style={[text.body, styles.grow]}>{localized(commune.name, locale)}</Text>
        <Text style={text.muted}>{summary}</Text>
      </Pressable>
      {open ? (
        <View style={styles.editor}>
          <Segmented<Mode>
            options={[
              ...(canInherit ? [['inherit', t.delivery.inherit] as const] : []),
              ['custom', t.delivery.custom],
              ['off', t.delivery.off],
            ]}
            value={mode}
            onChange={setMode}
          />
          {mode === 'custom' ? (
            <Field
              label={t.delivery.fee}
              value={fee}
              onChangeText={setFee}
              keyboardType="decimal-pad"
              error={fee !== '' && feeMinor === null}
            />
          ) : null}
          {failure ? <Notice tone="error">{errorMessage(t, failure)}</Notice> : null}
          <Button
            label={t.common.save}
            busy={busy}
            disabled={mode === 'custom' && feeMinor === null}
            onPress={() => void save()}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  commune: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  communeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  editor: { padding: 14, paddingTop: 0, gap: 12 },
});
