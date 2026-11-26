import { router, Stack, useLocalSearchParams } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { ProductCard } from '@/components/product-card';
import { RatingLine, ReviewItem } from '@/components/reviews';
import { SellerLegal } from '@/components/seller-legal';
import { Button, Card, Empty, LoadState, Notice, text } from '@/components/ui';
import { api } from '@/lib/api';
import { fill, formatDate, localized } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { colors, gap } from '@/lib/theme';
import type { CatalogProductList, CatalogSeller, ReviewPage } from '@/lib/types';
import { useRequest } from '@/lib/use-request';

/** A seller's shop: presentation and the products they offer. */
export default function StoreScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t, locale } = useI18n();
  const seller = useRequest(`seller:${slug}`, () =>
    api<CatalogSeller>(`/api/v1/catalog/sellers/${encodeURIComponent(slug)}`),
  );
  const products = useRequest(`seller-products:${slug}`, () =>
    api<CatalogProductList>(
      `/api/v1/catalog/products?seller=${encodeURIComponent(slug)}&limit=100`,
    ),
  );
  const reviews = useRequest(`reviews:seller:${slug}`, () =>
    api<ReviewPage>(`/api/v1/catalog/sellers/${encodeURIComponent(slug)}/reviews`),
  );
  const reload = () => {
    void seller.reload();
    void products.reload();
    void reviews.reload();
  };

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      columnWrapperStyle={styles.row}
      numColumns={2}
      data={products.data?.items ?? []}
      keyExtractor={(product) => product.id}
      renderItem={({ item }) => <ProductCard product={item} />}
      refreshControl={
        <RefreshControl refreshing={seller.loading && !!seller.data} onRefresh={reload} />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <Stack.Screen options={{ title: seller.data?.name ?? '' }} />
          <LoadState
            loading={seller.loading && !seller.data}
            error={seller.data ? undefined : seller.error}
            onRetry={reload}
          />
          {seller.data ? (
            <Card>
              <Text style={text.title}>{seller.data.name}</Text>
              {reviews.data ? <RatingLine summary={reviews.data.summary} /> : null}
              <Text style={text.muted}>{t.store.about}</Text>
              <Text style={text.body}>{localized(seller.data.description, locale)}</Text>
              {seller.data.legal ? (
                <SellerLegal legal={seller.data.legal} note={t.register.legalShown} />
              ) : null}
              {seller.data.holidayUntil ? (
                <Notice tone="info">
                  {fill(t.store.holiday, { date: formatDate(seller.data.holidayUntil, locale) })}
                </Notice>
              ) : null}
            </Card>
          ) : null}
          {reviews.data && reviews.data.summary.count > 0 ? (
            <>
              <Text style={text.heading}>{t.reviews.title}</Text>
              {reviews.data.items.slice(0, 2).map((review) => (
                <ReviewItem key={review.id} review={review} showProduct />
              ))}
              <Button
                label={fill(t.reviews.seeAll, { n: reviews.data.summary.count })}
                variant="secondary"
                onPress={() => router.push(`/reviews/${slug}?kind=seller`)}
              />
            </>
          ) : null}
          {products.data ? <Text style={text.heading}>{t.store.products}</Text> : null}
        </View>
      }
      ListEmptyComponent={
        products.data ? <Empty icon="storefront-outline" text={t.store.empty} /> : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.cream },
  content: { padding: gap, gap: 12, paddingBottom: 40 },
  row: { gap: 12 },
  header: { gap: 12 },
});
