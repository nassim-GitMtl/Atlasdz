import { useLocalSearchParams } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { RatingSummary, ReviewItem } from '@/components/reviews';
import { Button, Card, LoadState, Notice } from '@/components/ui';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { errorMessage } from '@/lib/strings';
import { colors, gap } from '@/lib/theme';
import type { PublicReview, ReviewPage } from '@/lib/types';
import { usePaged } from '@/lib/use-paged';

/** All published reviews of a product, or of a seller's shop (`?kind=seller`). */
export default function ReviewsScreen() {
  const { slug, kind } = useLocalSearchParams<{ slug: string; kind?: string }>();
  const { t } = useI18n();
  const seller = kind === 'seller';
  const path = `/api/v1/catalog/${seller ? 'sellers' : 'products'}/${encodeURIComponent(slug)}/reviews`;
  const reviews = usePaged<PublicReview, ReviewPage>(
    `reviews:${kind ?? 'product'}:${slug}`,
    (cursor) =>
      api<ReviewPage>(cursor === null ? path : `${path}?cursor=${encodeURIComponent(cursor)}`),
  );

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={reviews.items}
      keyExtractor={(review) => review.id}
      renderItem={({ item }) => <ReviewItem review={item} showProduct={seller} />}
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
              <RatingSummary summary={reviews.data.summary} />
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

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.cream },
  content: { padding: gap, gap: 12, paddingBottom: 40 },
  header: { gap: 12 },
});
