import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, Button, Card, Empty, LoadState, Screen, text } from '@/components/ui';
import { fill, formatDate, formatMoney } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { statusTone } from '@/lib/order-status';
import { useSession } from '@/lib/session';
import type { CustomerOrder } from '@/lib/types';
import { useRequest } from '@/lib/use-request';

export default function OrdersScreen() {
  const { t, locale } = useI18n();
  const session = useSession();
  const signedIn = session.status === 'signedIn';
  const orders = useRequest(signedIn ? 'orders' : null, () =>
    session.request<{ items: CustomerOrder[] }>('/api/v1/orders'),
  );
  const { reload } = orders;
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  if (!signedIn) {
    return (
      <Screen>
        <Empty
          icon="receipt-outline"
          text={t.common.signInNeeded}
          action={<Button label={t.common.signIn} onPress={() => router.push('/login')} />}
        />
      </Screen>
    );
  }

  const list = [...(orders.data?.items ?? [])].sort((a, b) =>
    b.quote.createdAt.localeCompare(a.quote.createdAt),
  );
  return (
    <Screen refreshing={orders.loading && !!orders.data} onRefresh={() => void reload()}>
      <LoadState
        loading={orders.loading && !orders.data}
        error={orders.data ? undefined : orders.error}
        onRetry={() => void reload()}
      />
      {orders.data && list.length === 0 ? (
        <Empty icon="receipt-outline" text={t.orders.empty} />
      ) : null}
      {list.map((order) => (
        <Pressable
          key={order.id}
          accessibilityRole="link"
          onPress={() => router.push(`/order/${order.id}`)}
          style={({ pressed }) => pressed && { opacity: 0.85 }}
        >
          <Card>
            <View style={styles.row}>
              <Text style={[text.heading, styles.grow]}>
                {fill(t.orders.placedOn, { date: formatDate(order.quote.createdAt, locale) })}
              </Text>
              <Text style={text.price}>{formatMoney(order.quote.totalMinor, locale)}</Text>
            </View>
            {order.sellerOrders.map((sellerOrder) => (
              <View key={sellerOrder.id} style={styles.row}>
                <Text style={[text.muted, styles.grow]} numberOfLines={1}>
                  {sellerOrder.snapshot.sellerName}
                </Text>
                <Badge label={t.status[sellerOrder.status]} tone={statusTone(sellerOrder.status)} />
              </View>
            ))}
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1 },
});
