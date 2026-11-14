import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Photo } from '@/components/photo';
import { Badge, Button, Card, Empty, LoadState, Notice, Screen, text } from '@/components/ui';
import { errorCode } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { imageUri } from '@/lib/config';
import { formatMoney, localized } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { errorMessage } from '@/lib/strings';
import { colors, radius } from '@/lib/theme';
import type { CartLine, CustomerCart } from '@/lib/types';
import { useRequest } from '@/lib/use-request';

export default function CartScreen() {
  const { t, locale } = useI18n();
  const session = useSession();
  const badge = useCart();
  const signedIn = session.status === 'signedIn';
  const cart = useRequest(signedIn ? 'cart' : null, () =>
    session.request<CustomerCart>('/api/v1/cart'),
  );
  const { reload } = cart;
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function setQuantity(line: CartLine, quantity: number) {
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

  if (!signedIn) {
    return (
      <Screen>
        <Empty
          icon="cart-outline"
          text={t.common.signInNeeded}
          action={<Button label={t.common.signIn} onPress={() => router.push('/login')} />}
        />
      </Screen>
    );
  }

  const data = cart.data;
  return (
    <Screen refreshing={cart.loading && !!data} onRefresh={() => void reload()}>
      <LoadState
        loading={cart.loading && !data}
        error={data ? undefined : cart.error}
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
      {data?.items.map((line) => (
        <Card key={line.offerId}>
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
        </Card>
      ))}
      {data && data.items.length > 0 ? (
        <Card>
          <View style={styles.total}>
            <Text style={text.heading}>{t.cart.subtotal}</Text>
            <Text style={text.price}>{formatMoney(data.availableSubtotalMinor, locale)}</Text>
          </View>
          <Text style={text.muted}>{t.cart.shippingNote}</Text>
          <Button
            label={t.cart.checkout}
            disabled={!data.items.some((line) => line.state === 'AVAILABLE')}
            onPress={() => router.push('/checkout')}
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
  total: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
