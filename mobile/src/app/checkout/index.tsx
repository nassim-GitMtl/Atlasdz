import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { PlacePicker, type Place } from '@/components/place-picker';
import { Button, Card, Checkbox, Field, LoadState, Notice, Screen, text } from '@/components/ui';
import { api, errorCode } from '@/lib/api';
import { useCart } from '@/lib/cart';
import type { SavedAddress } from '@/lib/collections';
import { contactErrors, emptyContact } from '@/lib/contact';
import { fill, formatDeliveryDays, formatMoney, localized, normalizePhone } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useLibrary } from '@/lib/library';
import { useSession } from '@/lib/session';
import { errorMessage } from '@/lib/strings';
import { colors, radius } from '@/lib/theme';
import type {
  CatalogProduct,
  CheckoutQuote,
  CustomerCart,
  DeliveryContact,
  DeliveryDestination,
} from '@/lib/types';
import { useDeliveryFees } from '@/lib/use-delivery-fees';
import { useRequest } from '@/lib/use-request';

const TEST_GROUP = 'test';

export default function CheckoutScreen() {
  const { t, locale } = useI18n();
  const session = useSession();
  const library = useLibrary();
  const cartState = useCart();
  const params = useLocalSearchParams<{
    preorderMin?: string;
    preorderMax?: string;
    destinationId?: string;
  }>();
  const preorder =
    params.preorderMin && params.preorderMax
      ? { min: Number(params.preorderMin), max: Number(params.preorderMax) }
      : null;
  const [acceptPreorder, setAcceptPreorder] = useState(false);
  // Signed out: the email comes with the delivery details and creates the account.
  const guest = session.status !== 'signedIn';
  const [email, setEmail] = useState('');
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const destinations = useRequest('destinations', () =>
    session.request<{ items: DeliveryDestination[] }>('/api/v1/delivery/destinations'),
  );
  const [selectedWilaya, setWilaya] = useState<Place | null>();
  const [selectedCommune, setCommune] = useState<Place | null>();
  const [contact, setContact] = useState<DeliveryContact>(emptyContact);
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const items = useMemo(() => destinations.data?.items ?? [], [destinations.data]);
  // Sellers in the cart, to show each one's delivery fee for the chosen commune.
  const sellerList = useRequest(`checkout-sellers-${guest ? 'guest' : 'account'}`, async () => {
    const found = new Map<string, string>();
    if (!guest) {
      const cart = await session.request<CustomerCart>('/api/v1/cart');
      for (const line of cart.items)
        if (line.offer) found.set(line.offer.seller.id, line.offer.seller.name);
    } else {
      const slugs = [...new Set(cartState.guestLines.map((line) => line.slug))];
      const products = await Promise.all(
        slugs.map((slug) =>
          api<CatalogProduct>(`/api/v1/catalog/products/${encodeURIComponent(slug)}`).catch(
            () => null,
          ),
        ),
      );
      for (const offer of products.flatMap((product) => product?.offers ?? []))
        if (cartState.guestLines.some((line) => line.offerId === offer.id))
          found.set(offer.seller.id, offer.seller.name);
    }
    return [...found].map(([id, name]) => ({ id, name }));
  });

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
  // Resolve the cart's initial selection from the live register. Once edited, even a null
  // selection belongs to the user and must not be overwritten when data reloads.
  const initialDestination = items.find((item) => item.id === params.destinationId);
  const wilaya =
    selectedWilaya !== undefined
      ? selectedWilaya
      : initialDestination
        ? (wilayas.find((item) => item.id === (initialDestination.wilaya?.id ?? TEST_GROUP)) ??
          null)
        : null;
  const commune =
    selectedCommune !== undefined
      ? selectedCommune
      : initialDestination
        ? { id: initialDestination.id, label: localized(initialDestination.name, locale) }
        : null;
  const communes = useMemo(
    () =>
      items
        .filter((d) => (wilaya?.id === TEST_GROUP ? !d.wilaya : d.wilaya?.id === wilaya?.id))
        .map((d) => ({ id: d.id, label: localized(d.name, locale) }))
        .sort((a, b) => a.label.localeCompare(b.label, locale)),
    [items, wilaya, locale],
  );
  const sellerIds = useMemo(
    () => (sellerList.data ?? []).map((seller) => seller.id),
    [sellerList.data],
  );
  const fees = useDeliveryFees(commune?.id ?? null, sellerIds, sellerIds.join(','), 0);
  const currentFees = commune ? fees.items : undefined;
  const blocked = currentFees?.some((fee) => !fee.available) ?? false;

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
    if (errors.size > 0 || commune === null || wilaya === null || (guest && !emailValid)) return;
    if (preorder && !acceptPreorder) {
      setFailure('PREORDER_ACCEPTANCE_REQUIRED');
      return;
    }
    setSubmitting(true);
    setFailure(null);
    try {
      let cart: CustomerCart | null = null;
      if (guest) {
        try {
          await session.signInGuest(email.trim(), locale);
        } catch (error) {
          setFailure(errorCode(error) === 'ACCOUNT_CONFLICT' ? 'GUEST_EXISTS' : errorCode(error));
          return;
        }
        cart = await cartState.mergeGuest();
      }
      cart ??= await session.request<CustomerCart>('/api/v1/cart');
      const deliveryContact = {
        recipientName: contact.recipientName.trim(),
        phone: normalizePhone(contact.phone),
        addressLine: contact.addressLine.trim(),
        city: contact.city.trim(),
      };
      const quote = await session.request<CheckoutQuote>('/api/v1/checkout/quotes', {
        body: {
          expectedCartVersion: cart.version,
          destinationId: commune.id,
          deliveryContact,
          ...(acceptPreorder ? { acceptPreorder: true } : {}),
        },
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
          {commune && currentFees ? (
            <Card>
              <Text style={text.heading}>{t.checkout.fees}</Text>
              {(sellerList.data ?? []).map((seller) => {
                const fee = currentFees.find((item) => item.sellerId === seller.id);
                return (
                  <View key={seller.id} style={styles.feeRow}>
                    <Text style={styles.feeSeller}>{seller.name}</Text>
                    <Text style={[styles.feeValue, !fee?.available && styles.feeNone]}>
                      {fee?.available && fee.shippingFeeMinor !== null
                        ? formatMoney(fee.shippingFeeMinor, locale)
                        : t.checkout.notDelivered}
                      {fee?.available && fee.deliveryDays
                        ? ` · ${formatDeliveryDays(fee.deliveryDays, locale)}`
                        : ''}
                    </Text>
                  </View>
                );
              })}
              {blocked ? <Notice tone="error">{t.checkout.blocked}</Notice> : null}
            </Card>
          ) : null}
          <Text style={text.heading}>{t.checkout.contact}</Text>
          {guest ? (
            <Field
              label={t.checkout.email}
              hint={t.checkout.emailHint}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              error={showErrors && !emailValid}
            />
          ) : null}
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
          {preorder ? (
            <Checkbox
              checked={acceptPreorder}
              label={fill(t.preorder.accept, { min: preorder.min, max: preorder.max })}
              onToggle={() => setAcceptPreorder((value) => !value)}
            />
          ) : null}
          {showErrors && (errors.size > 0 || commune === null || (guest && !emailValid)) ? (
            <Notice tone="error">{t.checkout.invalid}</Notice>
          ) : null}
          {failure === 'GUEST_EXISTS' ? (
            <>
              <Notice tone="error">{t.checkout.guestExists}</Notice>
              <Button
                label={t.common.signIn}
                variant="secondary"
                onPress={() => router.push('/login')}
              />
            </>
          ) : failure ? (
            <Notice tone="error">{errorMessage(t, failure)}</Notice>
          ) : null}
          <Button
            label={t.checkout.continue}
            busy={submitting}
            disabled={blocked}
            onPress={() => void submit()}
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 28,
    alignItems: 'center',
  },
  feeSeller: { flex: 1, fontSize: 15, color: colors.ink },
  feeValue: { fontSize: 15, fontWeight: '800', color: colors.ink },
  feeNone: { color: colors.danger },
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
