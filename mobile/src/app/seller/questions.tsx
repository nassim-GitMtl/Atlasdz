import { useState } from 'react';
import { Text } from '@/components/text';
import { Button, Card, Empty, Field, LoadState, Notice, Screen, text } from '@/components/ui';
import { errorCode } from '@/lib/api';
import { formatDate, localized } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { errorMessage } from '@/lib/strings';
import type { SellerQuestion } from '@/lib/types';
import { useRequest } from '@/lib/use-request';

/** Customers' questions on the seller's products; the answer is public on the product page. */
export default function SellerQuestionsScreen() {
  const { t } = useI18n();
  const session = useSession();
  const questions = useRequest('seller-questions', () =>
    session.request<{ items: SellerQuestion[] }>('/api/v1/seller/questions'),
  );
  const items = questions.data?.items ?? [];
  return (
    <Screen
      refreshing={questions.loading && !!questions.data}
      onRefresh={() => void questions.reload()}
    >
      <LoadState
        loading={questions.loading && !questions.data}
        error={questions.data ? undefined : questions.error}
        onRetry={() => void questions.reload()}
      />
      {questions.data && items.length === 0 ? (
        <Empty icon="help-circle-outline" text={t.seller.noQuestions} />
      ) : null}
      {items.map((question) => (
        <QuestionCard
          key={question.id}
          question={question}
          onDone={() => void questions.reload()}
        />
      ))}
    </Screen>
  );
}

function QuestionCard({
  question,
  onDone,
}: {
  readonly question: SellerQuestion;
  readonly onDone: () => void;
}) {
  const { t, locale } = useI18n();
  const session = useSession();
  const [draft, setDraft] = useState(question.answer ?? '');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setFailure(null);
    try {
      await session.request(`/api/v1/seller/questions/${question.id}/answer`, {
        body: { body: draft.trim() },
      });
      setDone(true);
      onDone();
    } catch (error) {
      setFailure(errorCode(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Text style={text.heading} numberOfLines={2}>
        {localized(question.product.title, locale)}
      </Text>
      <Text style={text.body}>{question.body}</Text>
      <Text style={text.muted}>{formatDate(question.createdAt, locale)}</Text>
      <Field
        label={t.seller.answerLabel}
        value={draft}
        onChangeText={(value) => {
          setDraft(value);
          setDone(false);
        }}
        multiline
        maxLength={1000}
      />
      {done ? <Notice tone="success">{t.seller.answered}</Notice> : null}
      {failure ? <Notice tone="error">{errorMessage(t, failure)}</Notice> : null}
      <Button
        label={question.answer ? t.seller.answerUpdate : t.seller.answer}
        variant="secondary"
        busy={busy}
        disabled={draft.trim().length < 2}
        onPress={() => void send()}
      />
    </Card>
  );
}
