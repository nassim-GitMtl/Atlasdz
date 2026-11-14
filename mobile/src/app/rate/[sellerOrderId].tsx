import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Photo } from '@/components/photo';
import { StarPicker } from '@/components/reviews';
import { Button, Card, Field, LoadState, Notice, Screen, text } from '@/components/ui';
import { errorCode } from '@/lib/api';
import { imageUri } from '@/lib/config';
import { localized } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { cleanComment, reviewChanged } from '@/lib/reviews';
import { useSession } from '@/lib/session';
import { errorMessage } from '@/lib/strings';
import { colors, radius } from '@/lib/theme';
import type { OrderReviews, OwnReview } from '@/lib/types';
import { useRequest } from '@/lib/use-request';

type Item = OrderReviews['items'][number];

/** The buyer rates each item of a delivered seller order (and can edit or delete it later). */
export default function RateScreen() {
  const { sellerOrderId } = useLocalSearchParams<{ sellerOrderId: string }>();
  const { t } = useI18n();
  const session = useSession();
  const order = useRequest(session.status === 'signedIn' ? `rate:${sellerOrderId}` : null, () =>
    session.request<OrderReviews>(`/api/v1/reviews/order/${sellerOrderId}`),
  );
  const data = order.data;

  return (
    <Screen refreshing={order.loading && !!data} onRefresh={() => void order.reload()}>
      <LoadState
        loading={order.loading && !data}
        error={data ? undefined : order.error}
        onRetry={() => void order.reload()}
      />
      {data ? (
        <>
          <Text style={text.muted}>{t.reviews.rateHint}</Text>
          {data.canReview ? null : <Notice>{t.reviews.notYet}</Notice>}
          {data.items.map((item) => (
            // A reload with a newer saved review starts that form again.
            <ItemReview
              key={`${item.productId}:${item.review?.version ?? 0}`}
              sellerOrderId={data.sellerOrderId}
              item={item}
              canReview={data.canReview}
            />
          ))}
        </>
      ) : null}
    </Screen>
  );
}

function ItemReview({
  sellerOrderId,
  item,
  canReview,
}: {
  readonly sellerOrderId: string;
  readonly item: Item;
  readonly canReview: boolean;
}) {
  const { t, locale } = useI18n();
  const session = useSession();
  const [saved, setSaved] = useState<OwnReview | null>(item.review);
  const [rating, setRating] = useState(item.review?.rating ?? 0);
  const [comment, setComment] = useState(item.review?.body ?? '');
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const title = localized(item.title, locale);
  const path = `/api/v1/reviews/order/${sellerOrderId}/${item.productId}`;

  async function save() {
    if (rating < 1) {
      setMessage({ tone: 'error', text: t.reviews.pickRating });
      return;
    }
    setBusy('save');
    setMessage(null);
    try {
      const review = await session.request<OwnReview>(path, {
        method: 'PUT',
        body: { rating, body: cleanComment(comment), expectedVersion: saved?.version ?? 0 },
      });
      setSaved(review);
      setComment(review.body ?? '');
      setMessage({ tone: 'success', text: t.reviews.saved });
    } catch (error) {
      setMessage({ tone: 'error', text: errorMessage(t, errorCode(error)) });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (saved === null) return;
    setBusy('remove');
    setMessage(null);
    try {
      await session.request(`${path}?version=${saved.version}`, { method: 'DELETE' });
      setSaved(null);
      setRating(0);
      setComment('');
      setMessage({ tone: 'success', text: t.reviews.removed });
    } catch (error) {
      setMessage({ tone: 'error', text: errorMessage(t, errorCode(error)) });
    } finally {
      setBusy(null);
      setConfirming(false);
    }
  }

  return (
    <Card>
      <View style={styles.item}>
        <Photo uri={imageUri(item.imageUrl, 'small')} label={title} style={styles.thumb} />
        <Text style={[text.body, styles.title]}>{title}</Text>
      </View>
      {item.slug === null ? <Text style={text.muted}>{t.reviews.notListed}</Text> : null}
      {saved?.status === 'HIDDEN' ? (
        <Notice tone="error">
          {t.reviews.hidden}. {t.reviews.hiddenNote}
        </Notice>
      ) : null}
      {canReview ? (
        <>
          <Text style={styles.label}>{t.reviews.yourRating}</Text>
          <StarPicker
            value={rating}
            label={`${t.reviews.yourRating} : ${title}`}
            onChange={setRating}
          />
          <Field
            label={t.reviews.comment}
            value={comment}
            onChangeText={setComment}
            multiline
            maxLength={1000}
          />
          {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
          <Button
            label={saved ? t.reviews.save : t.reviews.publish}
            busy={busy === 'save'}
            disabled={busy !== null || !reviewChanged(saved, rating, comment)}
            onPress={() => void save()}
          />
          {saved === null ? null : confirming ? (
            <>
              <Notice>{t.reviews.removeConfirm}</Notice>
              <Button
                label={t.common.confirm}
                variant="danger"
                busy={busy === 'remove'}
                onPress={() => void remove()}
              />
              <Button
                label={t.common.cancel}
                variant="secondary"
                onPress={() => setConfirming(false)}
              />
            </>
          ) : (
            <Button
              label={t.reviews.remove}
              variant="secondary"
              disabled={busy !== null}
              onPress={() => setConfirming(true)}
            />
          )}
        </>
      ) : null}
      {saved?.reply ? (
        <View style={styles.reply}>
          <Text style={styles.replyTitle}>{t.reviews.sellerReply}</Text>
          <Text style={text.body}>{saved.reply}</Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 56, height: 56, borderRadius: radius, backgroundColor: colors.soft },
  title: { flex: 1, fontWeight: '700' },
  label: { fontSize: 14, fontWeight: '700', color: colors.ink },
  reply: { backgroundColor: colors.soft, borderRadius: radius, padding: 12, gap: 4 },
  replyTitle: { fontWeight: '700', color: colors.olive },
});
