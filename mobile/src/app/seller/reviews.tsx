import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { RatingSummary, ReviewItem } from '@/components/reviews';
import { Badge, Button, Card, Field, LoadState, Notice, text } from '@/components/ui';
import { errorCode } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { errorMessage } from '@/lib/strings';
import { colors, gap } from '@/lib/theme';
import type { SellerReview, SellerReviewPage } from '@/lib/types';
import { usePaged } from '@/lib/use-paged';

/** The seller's reviews: average, every review (hidden ones marked) and public replies. */
export default function SellerReviewsScreen() {
  const { t } = useI18n();
  const session = useSession();
  const reviews = usePaged<SellerReview, SellerReviewPage>('seller-reviews-list', (cursor) =>
    session.request<SellerReviewPage>(
      cursor === null
        ? '/api/v1/seller/reviews'
        : `/api/v1/seller/reviews?cursor=${encodeURIComponent(cursor)}`,
    ),
  );

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={reviews.items}
      // A reload with a newer version (another device replied) starts that card again.
      keyExtractor={(review) => `${review.id}:${review.version}`}
      renderItem={({ item }) => <SellerReviewCard initial={item} />}
      refreshControl={
        <RefreshControl
          refreshing={reviews.loading && !!reviews.data}
          onRefresh={() => void reviews.reload()}
        />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <LoadState
            loading={reviews.loading && !reviews.data}
            error={reviews.data ? undefined : reviews.error}
            onRetry={() => void reviews.reload()}
          />
          {reviews.data ? (
            <Card>
              {reviews.data.summary.count > 0 ? (
                <RatingSummary summary={reviews.data.summary} />
              ) : (
                <Text style={text.muted}>{t.reviews.sellerNone}</Text>
              )}
            </Card>
          ) : null}
        </View>
      }
      ListFooterComponent={
        <View style={styles.header}>
          {reviews.moreError ? (
            <Notice tone="error">{errorMessage(t, reviews.moreError)}</Notice>
          ) : null}
          {reviews.hasMore ? (
            <Button
              label={t.reviews.more}
              variant="secondary"
              busy={reviews.loadingMore}
              onPress={() => void reviews.loadMore()}
            />
          ) : null}
        </View>
      }
    />
  );
}

function SellerReviewCard({ initial }: { readonly initial: SellerReview }) {
  const { t } = useI18n();
  const session = useSession();
  const [review, setReview] = useState(initial);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(initial.reply ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  async function send() {
    setBusy(true);
    setMessage(null);
    try {
      const updated = await session.request<SellerReview>(
        `/api/v1/seller/reviews/${review.id}/reply`,
        { body: { body: draft.trim(), expectedVersion: review.version } },
      );
      setReview(updated);
      setOpen(false);
      setMessage({ tone: 'success', text: t.reviews.replied });
    } catch (error) {
      setMessage({ tone: 'error', text: errorMessage(t, errorCode(error)) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ReviewItem review={review} showProduct>
      {review.status === 'HIDDEN' ? (
        <View style={styles.row}>
          <Badge label={t.reviews.hidden} tone="bad" />
        </View>
      ) : open ? (
        <>
          <Field
            label={t.reviews.replyLabel}
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={1000}
          />
          <Button
            label={t.reviews.sendReply}
            busy={busy}
            disabled={draft.trim().length < 2 || draft.trim() === review.reply}
            onPress={() => void send()}
          />
          <Button label={t.common.cancel} variant="secondary" onPress={() => setOpen(false)} />
        </>
      ) : (
        <Button
          label={review.reply ? t.reviews.editReply : t.reviews.reply}
          variant="secondary"
          onPress={() => {
            setDraft(review.reply ?? '');
            setMessage(null);
            setOpen(true);
          }}
        />
      )}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
    </ReviewItem>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.cream },
  content: { padding: gap, gap: 12, paddingBottom: 40 },
  header: { gap: 12 },
  row: { flexDirection: 'row' },
});
