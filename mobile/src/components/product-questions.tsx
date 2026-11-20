import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { Button, Card, Field, Notice, text } from '@/components/ui';
import { api, errorCode } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { errorMessage } from '@/lib/strings';
import { colors } from '@/lib/theme';
import type { ProductQuestionList } from '@/lib/types';
import { useRequest } from '@/lib/use-request';

/** Questions before buying, with the sellers' answers; signed-in customers ask (anonymously). */
export function ProductQuestions({ slug }: { readonly slug: string }) {
  const { t, locale } = useI18n();
  const session = useSession();
  const path = `/api/v1/catalog/products/${encodeURIComponent(slug)}/questions`;
  const questions = useRequest(`questions:${slug}`, () => api<ProductQuestionList>(path));
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const customer = session.status === 'signedIn' && session.actor === 'customer';

  async function ask() {
    setBusy(true);
    setFailure(null);
    try {
      await session.request(path, { body: { body: draft.trim() } });
      setDraft('');
      setSent(true);
      await questions.reload();
    } catch (error) {
      setFailure(errorCode(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Text style={text.heading}>{t.questions.title}</Text>
      {(questions.data?.items ?? []).length === 0 ? (
        <Text style={text.muted}>{t.questions.none}</Text>
      ) : null}
      {(questions.data?.items ?? []).map((question) => (
        <Card key={question.id}>
          <Text style={text.body}>{question.body}</Text>
          <Text style={text.muted}>
            {t.questions.customer} · {formatDate(question.createdAt, locale)}
          </Text>
          {question.answers.length === 0 ? (
            <Text style={text.muted}>{t.questions.waiting}</Text>
          ) : (
            question.answers.map((answer) => (
              <View key={`${answer.sellerName}-${answer.createdAt}`} style={styles.answer}>
                <Text style={text.body}>
                  <Text style={styles.seller}>{answer.sellerName} : </Text>
                  {answer.body}
                </Text>
              </View>
            ))
          )}
        </Card>
      ))}
      {customer ? (
        <Card>
          <Field
            label={t.questions.ask}
            hint={t.questions.privacy}
            value={draft}
            onChangeText={(value) => {
              setDraft(value);
              setSent(false);
            }}
            multiline
            maxLength={500}
          />
          {sent ? <Notice tone="success">{t.questions.sent}</Notice> : null}
          {failure ? <Notice tone="error">{errorMessage(t, failure)}</Notice> : null}
          <Button
            label={t.questions.send}
            variant="secondary"
            busy={busy}
            disabled={draft.trim().length < 5}
            onPress={() => void ask()}
          />
        </Card>
      ) : session.status === 'signedOut' ? (
        <Button
          label={t.questions.signIn}
          variant="secondary"
          onPress={() => router.push('/login')}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  answer: { borderStartWidth: 3, borderStartColor: colors.primary, paddingStart: 10 },
  seller: { fontWeight: '700' },
});
