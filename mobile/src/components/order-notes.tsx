import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { Button, Card, Field, Notice, text } from '@/components/ui';
import { errorCode } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { errorMessage } from '@/lib/strings';
import type { SellerOrderNote } from '@/lib/types';
import { useRequest } from '@/lib/use-request';

const QUICK = ['CALL_CONFIRMED', 'CALL_NO_ANSWER', 'CALL_CALLBACK'] as const;

/** The team's private follow-up on one order (calls, notes); never shown to the buyer. */
export function OrderNotes({ sellerOrderId }: { readonly sellerOrderId: string }) {
  const { t, locale } = useI18n();
  const session = useSession();
  const path = `/api/v1/seller/orders/${sellerOrderId}/notes`;
  const notes = useRequest(`order-notes:${sellerOrderId}`, () =>
    session.request<{ items: SellerOrderNote[] }>(path),
  );
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function add(kind: SellerOrderNote['kind']) {
    setBusy(true);
    setFailure(null);
    try {
      const text = body.trim();
      await session.request(path, { body: text ? { kind, body: text } : { kind } });
      setBody('');
      await notes.reload();
    } catch (error) {
      setFailure(errorCode(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Text style={text.heading}>{t.seller.notesTitle}</Text>
      <Text style={text.muted}>{t.seller.notesHint}</Text>
      {(notes.data?.items ?? []).map((note) => (
        <View key={note.id} style={styles.note}>
          <Text style={text.body}>
            <Text style={styles.kind}>{note.kind === 'NOTE' ? t.seller.noteKind : t.seller[note.kind]}</Text>
            {note.body ? ` — ${note.body}` : ''}
          </Text>
          <Text style={text.muted}>
            {formatDate(note.createdAt, locale, true)}
            {note.author ? ` · ${note.author}` : ''}
          </Text>
        </View>
      ))}
      <Field label={t.seller.noteField} value={body} onChangeText={setBody} multiline maxLength={500} />
      {failure ? <Notice tone="error">{errorMessage(t, failure)}</Notice> : null}
      <View style={styles.row}>
        {QUICK.map((kind) => (
          <Button
            key={kind}
            label={t.seller[kind]}
            variant="secondary"
            disabled={busy}
            onPress={() => void add(kind)}
          />
        ))}
      </View>
      <Button
        label={t.seller.NOTE}
        busy={busy}
        disabled={body.trim().length === 0}
        onPress={() => void add('NOTE')}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  note: { gap: 2 },
  kind: { fontWeight: '700' },
  row: { gap: 8 },
});
