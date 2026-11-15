import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { Badge, Button, Card, LoadState, Notice, Screen, text } from '@/components/ui';
import { errorCode } from '@/lib/api';
import { fill, formatDate } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { errorMessage } from '@/lib/strings';
import type { SessionSummary } from '@/lib/types';
import { useRequest } from '@/lib/use-request';

/** Where this account is signed in; other devices can be signed out remotely. */
export default function SessionsScreen() {
  const { t, locale } = useI18n();
  const session = useSession();
  const list = useRequest('sessions', () =>
    session.request<{ sessions: SessionSummary[] }>('/api/v1/auth/sessions'),
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function revoke(id: string | null) {
    setFailure(null);
    setNotice(null);
    try {
      if (id === null) {
        const result = await session.request<{ revokedCount: number }>('/api/v1/auth/sessions', {
          method: 'DELETE',
        });
        setNotice(fill(t.sessions.revoked, { n: result.revokedCount }));
      } else {
        await session.request(`/api/v1/auth/sessions/${id}`, { method: 'DELETE' });
        setNotice(fill(t.sessions.revoked, { n: 1 }));
      }
      await list.reload();
    } catch (error) {
      setFailure(errorCode(error));
    }
  }

  const others = list.data?.sessions.filter((item) => !item.current) ?? [];
  return (
    <Screen refreshing={list.loading && !!list.data} onRefresh={() => void list.reload()}>
      <LoadState
        loading={list.loading && !list.data}
        error={list.data ? undefined : list.error}
        onRetry={() => void list.reload()}
      />
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      {failure ? <Notice tone="error">{errorMessage(t, failure)}</Notice> : null}
      {list.data?.sessions.map((item) => (
        <Card key={item.id}>
          <View style={styles.row}>
            <Text style={[text.heading, styles.grow]}>{item.deviceLabel ?? t.sessions.device}</Text>
            {item.current ? <Badge label={t.sessions.current} tone="good" /> : null}
          </View>
          <Text style={text.muted}>
            {fill(t.sessions.since, { date: formatDate(item.issuedAt, locale, true) })}
          </Text>
          {!item.current ? (
            <Button
              label={t.sessions.revoke}
              variant="secondary"
              onPress={() => void revoke(item.id)}
            />
          ) : null}
        </Card>
      ))}
      {others.length > 1 ? (
        <Button
          label={t.sessions.revokeOthers}
          variant="danger"
          onPress={() => void revoke(null)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1 },
});
