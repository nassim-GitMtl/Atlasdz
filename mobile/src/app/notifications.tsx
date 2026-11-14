import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, Button, Card, Empty, LoadState, Screen, text } from '@/components/ui';
import { fill, formatDate } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';
import type { NotificationPage, OrderNotification } from '@/lib/types';
import { useRequest } from '@/lib/use-request';

/** Order updates for customers and sellers; opening one marks it read. */
export default function NotificationsScreen() {
  const { t, locale } = useI18n();
  const session = useSession();
  const first = useRequest('notifications', () =>
    session.request<NotificationPage>('/api/v1/notifications'),
  );
  const { reload } = first;
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  const [more, setMore] = useState<{ items: OrderNotification[]; cursor: string | null }>({
    items: [],
    cursor: null,
  });
  const cursor = more.cursor ?? first.data?.nextCursor ?? null;
  const items = [...(first.data?.items ?? []), ...more.items];

  async function loadMore() {
    if (cursor === null) return;
    const page = await session.request<NotificationPage>(
      `/api/v1/notifications?cursor=${encodeURIComponent(cursor)}`,
    );
    setMore((current) => ({ items: [...current.items, ...page.items], cursor: page.nextCursor }));
  }

  async function open(item: OrderNotification) {
    if (item.readAt === null) {
      try {
        await session.request('/api/v1/notifications/read', {
          body: { sellerOrderId: item.sellerOrderId, version: item.version },
        });
      } catch {
        // Opening the order matters more than the read marker.
      }
    }
    if (session.actor === 'seller') router.push(`/seller/order/${item.sellerOrderId}`);
    else router.push(`/order/${item.orderId}`);
  }

  return (
    <Screen refreshing={first.loading && !!first.data} onRefresh={() => void reload()}>
      <LoadState
        loading={first.loading && !first.data}
        error={first.data ? undefined : first.error}
        onRetry={() => void reload()}
      />
      {first.data && items.length === 0 ? (
        <Empty icon="notifications-outline" text={t.notifications.empty} />
      ) : null}
      {items.map((item) => (
        <Pressable
          key={`${item.sellerOrderId}-${item.version}`}
          accessibilityRole="link"
          onPress={() => void open(item)}
          style={({ pressed }) => pressed && { opacity: 0.85 }}
        >
          <Card>
            <View style={styles.row}>
              {item.readAt === null ? <View style={styles.unread} /> : null}
              <Text style={[text.body, styles.grow]}>
                {fill(t.notifications.item, {
                  seller: item.sellerName,
                  status: t.status[item.status],
                })}
              </Text>
            </View>
            <Text style={text.muted}>{formatDate(item.occurredAt, locale, true)}</Text>
            {item.readAt === null ? <Badge label={t.notifications.unread} tone="wait" /> : null}
          </Card>
        </Pressable>
      ))}
      {cursor !== null ? (
        <Button label={t.common.more} variant="secondary" onPress={() => void loadMore()} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1 },
  unread: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.coral },
});
