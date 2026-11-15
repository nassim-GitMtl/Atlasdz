import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { Badge, Card, Empty, LoadState, Screen, text } from '@/components/ui';
import { fill, formatDate } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import type { SupportCase } from '@/lib/types';
import { useRequest } from '@/lib/use-request';

/** Help and return requests (customers open them from an order; sellers answer them). */
export default function SupportListScreen() {
  const { t, locale } = useI18n();
  const session = useSession();
  const cases = useRequest('support', () =>
    session.request<{ items: SupportCase[] }>('/api/v1/support'),
  );
  const { reload } = cases;
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  return (
    <Screen refreshing={cases.loading && !!cases.data} onRefresh={() => void reload()}>
      <LoadState
        loading={cases.loading && !cases.data}
        error={cases.data ? undefined : cases.error}
        onRetry={() => void reload()}
      />
      {cases.data && cases.data.items.length === 0 ? (
        <Empty icon="chatbubbles-outline" text={t.support.empty} />
      ) : null}
      {cases.data?.items.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="link"
          onPress={() => router.push(`/support/${item.id}`)}
          style={({ pressed }) => pressed && { opacity: 0.85 }}
        >
          <Card>
            <View style={styles.row}>
              <Text style={[text.heading, styles.grow]}>{t.support[item.category]}</Text>
              <Badge
                label={t.support[item.status]}
                tone={
                  item.status === 'RESOLVED' ? 'good' : item.status === 'ESCALATED' ? 'bad' : 'wait'
                }
              />
            </View>
            <Text style={text.body}>{fill(t.support.order, { seller: item.sellerName })}</Text>
            <Text style={text.muted}>{formatDate(item.updatedAt, locale, true)}</Text>
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
