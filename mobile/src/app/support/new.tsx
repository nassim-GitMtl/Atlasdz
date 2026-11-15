import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from '@/components/text';

import { Button, Field, Notice, Screen, Segmented, text } from '@/components/ui';
import { errorCode } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { errorMessage } from '@/lib/strings';

type Category = 'RETURN_REQUEST' | 'DELIVERY_ISSUE' | 'OTHER';

/** Opens a help or return request about one seller's part of an order. */
export default function NewSupportScreen() {
  const { sellerOrderId } = useLocalSearchParams<{ sellerOrderId: string }>();
  const { t } = useI18n();
  const session = useSession();
  const [category, setCategory] = useState<Category>('RETURN_REQUEST');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setFailure(null);
    try {
      const created = await session.request<{ case?: { id: string }; id?: string }>(
        '/api/v1/support',
        { body: { sellerOrderId, category, body: body.trim() } },
      );
      const id = created.case?.id ?? created.id;
      if (id) router.replace(`/support/${id}`);
      else router.back();
    } catch (error) {
      setFailure(errorCode(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Text style={text.body}>{t.support.intro}</Text>
      <Text style={text.heading}>{t.support.category}</Text>
      <Segmented<Category>
        options={[
          ['RETURN_REQUEST', t.support.RETURN_REQUEST],
          ['DELIVERY_ISSUE', t.support.DELIVERY_ISSUE],
          ['OTHER', t.support.OTHER],
        ]}
        value={category}
        onChange={setCategory}
      />
      <Field
        label={t.support.message}
        hint={t.support.messageHint}
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={2000}
        style={{ minHeight: 140, textAlignVertical: 'top', paddingTop: 12 }}
      />
      {failure ? <Notice tone="error">{errorMessage(t, failure)}</Notice> : null}
      <Button
        label={t.support.send}
        busy={busy}
        disabled={body.trim().length < 5}
        onPress={() => void send()}
      />
    </Screen>
  );
}
