import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { Photo } from '@/components/photo';
import { CartDestination } from '@/components/cart-destination';
import { cartDeliveryKey, cartDeliveryTotal, sellerCartGroups } from '@/lib/cart-delivery';
import { cartDeliveryCopy } from '@/lib/cart-delivery-copy';
import { useDeliveryFees } from '@/lib/use-delivery-fees';
import { Badge, Button, Card, Empty, LoadState, Notice, Screen, text } from '@/components/ui';
import { api, errorCode } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { imageUri } from '@/lib/config';
import { formatDeliveryDays, formatMoney, localized } from '@/lib/format';
import { buildGuestCart } from '@/lib/guest-cart';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { errorMessage } from '@/lib/strings';
import { colors, radius } from '@/lib/theme';
import type { CartLine, CatalogProduct, CustomerCart } from '@/lib/types';
import { useRequest } from '@/lib/use-request';
import { PreorderNote } from '@/components/preorder-note';
import { preorderSpan } from '@/lib/preorder';

export default function CartScreen() {
  const { t, locale } = useI18n();
  const deliveryCopy = cartDeliveryCopy[locale];
  const [destinationId, setDestinationId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const session = useSession();
  const badge = useCart();
  const signedIn = session.status === 'signedIn';
  const cart = useRequest(signedIn ? 'cart' : null, () =>
    session.request<CustomerCart>('/api/v1/cart'),
  );
  // Signed out: the phone's cart, priced from the live catalogue (no account needed to shop).
  const lines = badge.guestLines;
  const slugs = [...new Set(lines.map((line) => line.slug))].sort();
  const products = useRequest(signedIn ? null : `guest-products:${slugs.join(',')}`, async () => {
    const found = await Promise.all(
      slugs.map(
        async (slug) =>
          [
            slug,
            await api<CatalogProduct>(`/api/v1/catalog/products/${encodeURIComponent(slug)}`).catch(
              () => null,
            ),
          ] as const,
      ),
    );
    return new Map(found);
  });
  const source = signedIn ? cart : products;
  const reload = source.reload;
  useFocusEffect(
    useCallback(() => {
      setRefreshKey((value) => value + 1);
      void reload();
    }, [reload]),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function setQuantity(line: CartLine, quantity: number) {
    if (!signedIn) {
      badge.setGuestQuantity(line.offerId, quantity);
      return;
    }
    if (!cart.data) return;
    setBusy(line.offerId);
    setFailure(null);
    try {
      await session.request(`/api/v1/cart/items/${line.offerId}`, {
        method: 'PUT',
        body: { quantity, expectedVersion: cart.data.version },
      });
    } catch (error) {
      setFailure(errorCode(error));
    } finally {
      setBusy(null);
      await reload();
      await badge.refresh();
    }
  }

  const data = signedIn
    ? cart.data
    : products.data
      ? buildGuestCart(lines, products.data)
      : undefined;
  const groups = sellerCartGroups(data?.items ?? []);
  const fees = useDeliveryFees(
    destinationId,
    groups.flatMap((group) => (group.seller ? [group.id] : [])),
    cartDeliveryKey(data?.items ?? []),
    refreshKey,
  );
  const totalMinor = cartDeliveryTotal(groups, fees.items);
  const valid = groups.length > 0 && groups.every((group) => group.valid);
  const ready =
    totalMinor !== null &&
    valid &&
    !busy &&
    !source.loading &&
    !source.error &&
    !fees.loading &&
    !fees.error;
  return (
    <Screen
      direction={locale === 'ar' ? 'rtl' : 'ltr'}
      refreshing={source.loading && !!data}
      onRefresh={() => {
        fees.reload();
        void reload();
      }}
    >
      <LoadState
        loading={source.loading && !data}
        error={source.error}
        onRetry={() => void reload()}
      />
      {failure ? <Notice tone="error">{errorMessage(t, failure)}</Notice> : null}
      {data && data.items.length === 0 ? (
        <Empty
          icon="cart-outline"
          text={t.cart.empty}
          action={
            <Button
              label={t.cart.browse}
              variant="secondary"
              onPress={() => router.navigate('/')}
            />
          }
        />
      ) : null}
      {data && data.items.length > 0 && (
        <Card>
          <Text style={text.heading}>{deliveryCopy.title}</Text>
          <CartDestination value={destinationId} onChange={setDestinationId} />
          {!destinationId && <Text style={text.muted}>{deliveryCopy.choose}</Text>}
          <LoadState loading={fees.loading} onRetry={fees.reload} />
          {fees.error && <Notice tone="error">{deliveryCopy.unavailable}</Notice>}
          {destinationId && (
            <Button
              label={deliveryCopy.refresh}
              variant="secondary"
              busy={fees.loading}
              onPress={fees.reload}
            />
          )}
        </Card>
      )}
      {groups.map((group) => {
        const fee = fees.items?.find((item) => item.sellerId === group.id);
        return (
          <Card key={group.id}>
            <Text style={text.heading}>
              {group.seller ? `${deliveryCopy.seller} ${group.seller.name}` : t.cart.unavailable}
            </Text>
            {group.items.map((line) => (
              <View style={styles.groupLine} key={line.offerId}>
                <View style={styles.line}>
                  {line.product ? (
                    <Photo uri={imageUri(line.product.imageUrl, 'small')} style={styles.thumb} />
                  ) : null}
                  <View style={styles.lineBody}>
                    <Text style={text.body} numberOfLines={2}>
                      {line.product ? localized(line.product.title, locale) : '—'}
                    </Text>
                    {line.offer ? <Text style={text.muted}>{line.offer.seller.name}</Text> : null}
                    {line.lineSubtotalMinor !== null ? (
                      <Text style={text.price}>{formatMoney(line.lineSubtotalMinor, locale)}</Text>
                    ) : null}
                    {line.offer?.preorder ? <PreorderNote preorder={line.offer.preorder} /> : null}
                    {line.state === 'UNAVAILABLE' ? (
                      <Badge label={t.cart.unavailable} tone="bad" />
                    ) : null}
                    {line.state === 'INSUFFICIENT_STOCK' ? (
                      <Badge label={t.cart.insufficient} tone="wait" />
                    ) : null}
                  </View>
                </View>
                <View style={styles.controls}>
                  <Stepper
                    label={t.cart.decrease}
                    icon="remove"
                    disabled={busy !== null}
                    onPress={() => void setQuantity(line, line.quantity - 1)}
                  />
                  <Text style={styles.quantity} accessibilityLiveRegion="polite">
                    {line.quantity}
                  </Text>
                  <Stepper
                    label={t.cart.increase}
                    icon="add"
                    disabled={busy !== null || line.quantity >= 99}
                    onPress={() => void setQuantity(line, line.quantity + 1)}
                  />
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void setQuantity(line, 0)}
                    disabled={busy !== null}
                    style={styles.remove}
                    hitSlop={8}
                  >
                    <Text style={text.link}>{t.cart.remove}</Text>
                  </Pressable>
                </View>
              </View>
            ))}
            <View style={styles.total}>
              <Text style={text.muted}>{t.cart.subtotal}</Text>
              <Text style={text.body}>{formatMoney(group.subtotalMinor, locale)}</Text>
            </View>
            <View style={styles.total}>
              <Text style={text.muted}>{deliveryCopy.shipping}</Text>
              <Text style={text.body}>
                {fee?.available && fee.shippingFeeMinor !== null
                  ? formatMoney(fee.shippingFeeMinor, locale)
                  : fee?.available === false
                    ? deliveryCopy.invalid
                    : deliveryCopy.unknown}
              </Text>
            </View>
            {fee?.available && fee.deliveryDays ? (
              <View style={styles.total}>
                <Text style={text.muted}>{deliveryCopy.days}</Text>
                <Text style={text.body}>{formatDeliveryDays(fee.deliveryDays, locale)}</Text>
              </View>
            ) : null}
            {fee?.available === false && <Notice tone="error">{deliveryCopy.unsupported}</Notice>}
            {group.valid && fee?.available && fee.shippingFeeMinor !== null && (
              <View style={styles.total}>
                <Text style={text.body}>{deliveryCopy.payable}</Text>
                <Text style={text.price}>
                  {formatMoney(group.subtotalMinor + fee.shippingFeeMinor, locale)}
                </Text>
              </View>
            )}
          </Card>
        );
      })}
      {data && data.items.length > 0 ? (
        <Card>
          <View style={styles.total}>
            <Text style={text.heading}>{deliveryCopy.total}</Text>
            <Text testID="cart-estimated-total" style={text.price}>
              {totalMinor === null ? deliveryCopy.unknown : formatMoney(totalMinor, locale)}
            </Text>
          </View>
          <Text style={text.muted}>{deliveryCopy.estimate}</Text>
          {!valid && <Notice tone="error">{deliveryCopy.incomplete}</Notice>}
          <Button
            label={t.cart.checkout}
            disabled={!ready}
            onPress={() => {
              if (!ready || !destinationId) return;
              if (!fees.isFresh()) {
                fees.reload();
                return;
              }
              // Pre-order items: checkout asks the buyer to accept the widest delivery window.
              const span = preorderSpan(
                data.items.map((line) => ({ preorder: line.offer?.preorder })),
              );
              const query = new URLSearchParams({ destinationId });
              if (span) {
                query.set('preorderMin', String(span.min));
                query.set('preorderMax', String(span.max));
              }
              router.push(`/checkout?${query}`);
            }}
          />
        </Card>
      ) : null}
    </Screen>
  );
}

function Stepper({
  label,
  icon,
  disabled,
  onPress,
}: {
  readonly label: string;
  readonly icon: 'add' | 'remove';
  readonly disabled: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.stepper, disabled && { opacity: 0.4 }]}
    >
      <Ionicons name={icon} size={22} color={colors.olive} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  groupLine: { gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
  line: { flexDirection: 'row', gap: 12 },
  thumb: { width: 76, height: 76, borderRadius: radius, backgroundColor: colors.soft },
  lineBody: { flex: 1, gap: 4 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantity: {
    minWidth: 24,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
  },
  remove: { marginStart: 'auto' },
  total: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
