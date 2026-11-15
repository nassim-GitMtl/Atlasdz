import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { Badge, Button, Field, LoadState, Notice, Screen, text } from '@/components/ui';
import { errorCode } from '@/lib/api';
import { fill, formatDate } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { errorMessage } from '@/lib/strings';
import { colors, radius } from '@/lib/theme';
import type { SupportDetail } from '@/lib/types';
import { useRequest } from '@/lib/use-request';
import { newRequestId } from '@/lib/uuid';

type Action = 'REPLY' | 'ESCALATE' | 'CONFIRM_RESOLUTION';

/** One request: the conversation, a reply box, and the customer's escalate / resolve choices. */
export default function SupportCaseScreen() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const { t, locale } = useI18n();
  const session = useSession();
  const detail = useRequest(`case:${caseId}`, () =>
    session.request<SupportDetail>(`/api/v1/support/${encodeURIComponent(caseId)}`),
  );
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState<Action | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const mine = session.actor === 'seller' ? 'SELLER' : 'CUSTOMER';

  async function act(action: Action) {
    if (!detail.data) return;
    // Every action carries a message; escalation and resolution have a default one.
    const message =
      body.trim() ||
      (action === 'ESCALATE'
        ? t.support.escalate
        : action === 'CONFIRM_RESOLUTION'
          ? t.support.resolve
          : '');
    setBusy(action);
    setFailure(null);
    try {
      await session.request(`/api/v1/support/${detail.data.case.id}`, {
        body: {
          requestId: newRequestId(),
          expectedVersion: detail.data.case.version,
          action,
          body: message,
        },
      });
      setBody('');
      await detail.reload();
    } catch (error) {
      setFailure(errorCode(error));
    } finally {
      setBusy(null);
    }
  }

  const data = detail.data;
  const open = data && data.case.status !== 'RESOLVED';
  return (
    <Screen refreshing={detail.loading && !!data} onRefresh={() => void detail.reload()}>
      <LoadState
        loading={detail.loading && !data}
        error={data ? undefined : detail.error}
        onRetry={() => void detail.reload()}
      />
      {data ? (
        <>
          <View style={styles.row}>
            <Text style={[text.heading, styles.grow]}>{t.support[data.case.category]}</Text>
            <Badge
              label={t.support[data.case.status]}
              tone={data.case.status === 'RESOLVED' ? 'good' : 'wait'}
            />
          </View>
          <Text style={text.muted}>{fill(t.support.order, { seller: data.case.sellerName })}</Text>
          {[...data.messages]
            .sort((a, b) => a.version - b.version)
            .map((message) => {
              const own = message.attribution === mine;
              return (
                <View
                  key={message.version}
                  style={[styles.bubble, own ? styles.own : styles.other]}
                >
                  <Text style={styles.author}>{t.attribution[message.attribution]}</Text>
                  <Text style={text.body}>{message.body}</Text>
                  <Text style={styles.time}>{formatDate(message.createdAt, locale, true)}</Text>
                </View>
              );
            })}
          {failure ? <Notice tone="error">{errorMessage(t, failure)}</Notice> : null}
          {open ? (
            <>
              <Field
                label={t.support.message}
                hint={t.support.messageHint}
                value={body}
                onChangeText={setBody}
                multiline
                maxLength={2000}
                style={{ minHeight: 110, textAlignVertical: 'top', paddingTop: 12 }}
              />
              <Button
                label={t.support.reply}
                busy={busy === 'REPLY'}
                disabled={body.trim().length < 5 || busy !== null}
                onPress={() => void act('REPLY')}
              />
              {session.actor === 'customer' ? (
                <>
                  {data.case.status !== 'ESCALATED' ? (
                    <Button
                      label={t.support.escalate}
                      variant="secondary"
                      busy={busy === 'ESCALATE'}
                      disabled={busy !== null}
                      onPress={() => void act('ESCALATE')}
                    />
                  ) : null}
                  <Button
                    label={t.support.resolve}
                    variant="secondary"
                    busy={busy === 'CONFIRM_RESOLUTION'}
                    disabled={busy !== null}
                    onPress={() => void act('CONFIRM_RESOLUTION')}
                  />
                </>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1 },
  bubble: { borderRadius: radius, padding: 12, gap: 4, maxWidth: '88%' },
  own: { alignSelf: 'flex-end', backgroundColor: colors.soft },
  other: {
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  author: { fontSize: 13, fontWeight: '700', color: colors.olive },
  time: { fontSize: 12, color: colors.muted },
});
