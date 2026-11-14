import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, Card, Empty, Field, LoadState, Screen, Segmented, text } from '@/components/ui';
import { sellerOrderFilter, type SellerOrderFilter } from '@/lib/collections';
import { fill, formatDate, formatMoney } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { statusTone } from '@/lib/order-status';
import { matchesOrder } from '@/lib/seller-tools';
import { useSession } from '@/lib/session';
import type { SellerOrder } from '@/lib/types';
import { useRequest } from '@/lib/use-request';

export default function SellerOrdersScreen() {
  const { t, locale } = useI18n();
  const session = useSession();
  const orders = useRequest('seller-orders-list', () =>
    session.request<{ items: SellerOrder[] }>('/api/v1/seller/orders'),
  );
  const { reload } = orders;
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  const [filter, setFilter] = useState<SellerOrderFilter>('active');
  const [query, setQuery] = useState('');
  // A search looks through every order; otherwise the selected group is shown.
  const searching = query.trim() !== '';
  const list = (orders.data?.items ?? [])
    .filter((order) =>
      searching ? matchesOrder(order, query) : sellerOrderFilter(order.status) === filter,
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <Screen refreshing={orders.loading && !!orders.data} onRefresh={() => void reload()}>
      <Field
        label={t.seller.search}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        returnKeyType="search"
      />
      <Segmented<SellerOrderFilter>
        options={[
          ['active', t.seller.filterActive],
          ['shipping', t.seller.filterShipping],
          ['done', t.seller.filterDone],
        ]}
        value={filter}
        onChange={setFilter}
      />
      <LoadState
        loading={orders.loading && !orders.data}
        error={orders.data ? undefined : orders.error}
        onRetry={() => void reload()}
      />
      {orders.data && list.length === 0 ? (
        <Empty
          icon={searching ? 'search-outline' : 'receipt-outline'}
          text={searching ? t.seller.noMatch : t.seller.ordersEmpty}
        />
      ) : null}
      {list.map((order) => (
        <Pressable
          key={order.id}
          accessibilityRole="link"
          onPress={() => router.push(`/seller/order/${order.id}`)}
          style={({ pressed }) => pressed && { opacity: 0.85 }}
        >
          <Card>
            <View style={styles.row}>
              <Text style={[text.heading, styles.grow]} numberOfLines={1}>
                {order.deliveryContact?.recipientName ?? t.seller.customer}
              </Text>
              <Text style={text.price}>{formatMoney(order.snapshot.totalMinor, locale)}</Text>
            </View>
            <Text style={text.muted}>
              {formatDate(order.createdAt, locale, true)} · {order.snapshot.items.length} ×
            </Text>
            <Badge label={t.status[order.status]} tone={statusTone(order.status)} />
            {order.status === 'AWAITING_SELLER' ? (
              <Text style={text.muted}>
                {fill(t.seller.deadline, {
                  date: formatDate(order.acceptanceDeadline, locale, true),
                })}
              </Text>
            ) : null}
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
