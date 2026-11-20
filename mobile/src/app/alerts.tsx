import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { Button, Card, Empty, LoadState, Notice, Screen, text } from '@/components/ui';
import { errorCode } from '@/lib/api';
import { localized } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { errorMessage } from '@/lib/strings';
import type { StockAlertList } from '@/lib/types';
import { useRequest } from '@/lib/use-request';

/** Products the customer waits for (one email each when back in stock). */
export default function AlertsScreen() {
  const { t, locale } = useI18n();
  const session = useSession();
  const alerts = useRequest('stock-alerts', () =>
    session.request<StockAlertList>('/api/v1/stock-alerts'),
  );
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function stop(slug: string) {
    setBusy(slug);
    setFailure(null);
    try {
      await session.request(`/api/v1/stock-alerts/${encodeURIComponent(slug)}`, {
        method: 'DELETE',
      });
      await alerts.reload();
    } catch (error) {
      setFailure(errorCode(error));
    } finally {
      setBusy(null);
    }
  }

  const items = alerts.data?.items ?? [];
  return (
    <Screen refreshing={alerts.loading && !!alerts.data} onRefresh={() => void alerts.reload()}>
      <LoadState
        loading={alerts.loading && !alerts.data}
        error={alerts.data ? undefined : alerts.error}
        onRetry={() => void alerts.reload()}
      />
      {failure ? <Notice tone="error">{errorMessage(t, failure)}</Notice> : null}
      {alerts.data && items.length === 0 ? (
        <Empty icon="alarm-outline" text={t.stockAlert.empty} />
      ) : null}
      {items.length > 0 ? <Text style={text.muted}>{t.stockAlert.note}</Text> : null}
      {items.map((item) => (
        <Card key={item.slug}>
          <Text style={text.heading} numberOfLines={2}>
            {localized(item.title, locale)}
          </Text>
          <View style={styles.actions}>
            <View style={styles.action}>
              <Button
                label={t.common.view}
                variant="secondary"
                onPress={() => router.push(`/product/${item.slug}`)}
              />
            </View>
            <View style={styles.action}>
              <Button
                label={t.stockAlert.stop}
                variant="secondary"
                busy={busy === item.slug}
                onPress={() => void stop(item.slug)}
              />
            </View>
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1 },
});
