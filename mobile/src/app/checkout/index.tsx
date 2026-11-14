import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { PlacePicker, type Place } from '@/components/place-picker';
import { Button, Field, LoadState, Notice, Screen, text } from '@/components/ui';
import { errorCode } from '@/lib/api';
import type { SavedAddress } from '@/lib/collections';
import { contactErrors, emptyContact } from '@/lib/contact';
import { localized, normalizePhone } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useLibrary } from '@/lib/library';
import { useSession } from '@/lib/session';
import { errorMessage } from '@/lib/strings';
import { colors, radius } from '@/lib/theme';
import type {
  CheckoutQuote,
  CustomerCart,
  DeliveryContact,
  DeliveryDestination,
} from '@/lib/types';
import { useRequest } from '@/lib/use-request';

const TEST_GROUP = 'test';

export default function CheckoutScreen() {
  const { t, locale } = useI18n();
  const session = useSession();
  const library = useLibrary();
  const destinations = useRequest('destinations', () =>
    session.request<{ items: DeliveryDestination[] }>('/api/v1/delivery/destinations'),
  );
  const [wilaya, setWilaya] = useState<Place | null>(null);
  const [commune, setCommune] = useState<Place | null>(null);
  const [contact, setContact] = useState<DeliveryContact>(emptyContact);
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

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
  const communes = useMemo(
    () =>
      items
        .filter((d) => (wilaya?.id === TEST_GROUP ? !d.wilaya : d.wilaya?.id === wilaya?.id))
        .map((d) => ({ id: d.id, label: localized(d.name, locale) }))
        .sort((a, b) => a.label.localeCompare(b.label, locale)),
    [items, wilaya, locale],
  );

  // Only addresses whose commune still exists are offered.
  const saved = library.addresses.filter((address) =>
    items.some((d) => d.id === address.destinationId),
  );
  function applyAddress(address: SavedAddress) {
    setContact(address.contact);
    setWilaya(wilayas.find((w) => w.id === address.wilayaId) ?? null);
    setCommune({ id: address.destinationId, label: address.destinationLabel });
  }

  const errors = contactErrors(contact);
  const set = (key: keyof DeliveryContact) => (value: string) =>
    setContact((current) => ({ ...current, [key]: value }));

  async function submit() {
    setShowErrors(true);
    if (errors.size > 0 || commune === null || wilaya === null) return;
    setSubmitting(true);
    setFailure(null);
    try {
      const cart = await session.request<CustomerCart>('/api/v1/cart');
      const deliveryContact = {
        recipientName: contact.recipientName.trim(),
        phone: normalizePhone(contact.phone),
        addressLine: contact.addressLine.trim(),
        city: contact.city.trim(),
      };
      const quote = await session.request<CheckoutQuote>('/api/v1/checkout/quotes', {
        body: { expectedCartVersion: cart.version, destinationId: commune.id, deliveryContact },
      });
      library.rememberAddress({
        contact: deliveryContact,
        destinationId: commune.id,
        destinationLabel: commune.label,
        wilayaId: wilaya.id,
      });
      router.replace(`/checkout/${quote.id}`);
    } catch (error) {
      setFailure(errorCode(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <LoadState
        loading={destinations.loading && !destinations.data}
        error={destinations.data ? undefined : destinations.error}
        onRetry={() => void destinations.reload()}
      />
      {destinations.data ? (
        <>
          {items.length === 0 ? <Notice>{t.checkout.noPlaces}</Notice> : null}
          {saved.length > 0 ? (
            <>
              <Text style={text.heading}>{t.checkout.saved}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}
              >
                {saved.map((address) => (
                  <Pressable
                    key={`${address.destinationId}-${address.contact.phone}-${address.contact.addressLine}`}
                    accessibilityRole="button"
                    onPress={() => applyAddress(address)}
                    style={styles.chip}
                  >
                    <Text style={styles.chipTitle} numberOfLines={1}>
                      {address.contact.recipientName}
                    </Text>
                    <Text style={styles.chipText} numberOfLines={1}>
                      {address.contact.addressLine}, {address.destinationLabel}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          ) : null}
          <PlacePicker
            label={t.checkout.wilaya}
            value={wilaya}
            places={wilayas}
            onChange={(place) => {
              setWilaya(place);
              setCommune(null);
            }}
          />
          <PlacePicker
            label={t.checkout.commune}
            value={commune}
            places={communes}
            disabled={wilaya === null}
            onChange={setCommune}
          />
          <Text style={text.heading}>{t.checkout.contact}</Text>
          <Field
            label={t.checkout.name}
            value={contact.recipientName}
            onChangeText={set('recipientName')}
            autoComplete="name"
            error={showErrors && errors.has('recipientName')}
          />
          <Field
            label={t.checkout.phone}
            hint={t.checkout.phoneHint}
            value={contact.phone}
            onChangeText={set('phone')}
            keyboardType="phone-pad"
            autoComplete="tel"
            error={showErrors && errors.has('phone')}
          />
          <Field
            label={t.checkout.address}
            value={contact.addressLine}
            onChangeText={set('addressLine')}
            autoComplete="street-address"
            error={showErrors && errors.has('addressLine')}
          />
          <Field
            label={t.checkout.city}
            value={contact.city}
            onChangeText={set('city')}
            error={showErrors && errors.has('city')}
          />
          {showErrors && (errors.size > 0 || commune === null) ? (
            <Notice tone="error">{t.checkout.invalid}</Notice>
          ) : null}
          {failure ? <Notice tone="error">{errorMessage(t, failure)}</Notice> : null}
          <Button label={t.checkout.continue} busy={submitting} onPress={() => void submit()} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { gap: 10, paddingVertical: 2 },
  chip: {
    width: 220,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    padding: 12,
    gap: 2,
  },
  chipTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  chipText: { fontSize: 13, color: colors.muted },
});
