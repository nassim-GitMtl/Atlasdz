import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Photo } from '@/components/photo';
import { ProductCard, SummaryCard } from '@/components/product-card';
import { Button, Empty, LoadState, Segmented } from '@/components/ui';
import { api } from '@/lib/api';
import { categoryImage, type SortMode } from '@/lib/collections';
import { imageUri } from '@/lib/config';
import { fill, localized } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useLibrary } from '@/lib/library';
import { colors, gap, radius } from '@/lib/theme';
import type { CatalogCategoryList, CatalogProduct, CatalogProductList } from '@/lib/types';
import { usePaged } from '@/lib/use-paged';
import { useRequest } from '@/lib/use-request';

const SERVER_SORT: Record<SortMode, string> = {
  relevance: 'recommended',
  priceAsc: 'price-asc',
  priceDesc: 'price-desc',
};
type ProductPage = CatalogProductList & { readonly nextCursor: string | null };

export default function HomeScreen() {
  const { t, locale } = useI18n();
  const library = useLibrary();
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>('relevance');

  // Every category with products on sale, and pages of products sorted by the API across the
  // whole catalogue (more load as the shopper scrolls).
  const categoryList = useRequest('categories', () =>
    api<CatalogCategoryList>('/api/v1/catalog/categories'),
  );
  const categories = (categoryList.data?.items ?? []).map(
    (item) => [item.slug, localized(item.title, locale)] as const,
  );
  const params = new URLSearchParams({ limit: '24', sort: SERVER_SORT[sort] });
  if (query) params.set('query', query);
  if (category) params.set('category', category);
  const shown = usePaged<CatalogProduct, ProductPage>(params.toString(), async (cursor) => {
    const page = Number(cursor ?? '1');
    const list = await api<CatalogProductList>(
      `/api/v1/catalog/products?${params.toString()}&page=${page}`,
    );
    const total = list.total ?? list.items.length;
    return { ...list, nextCursor: page * (list.pageSize ?? 24) < total ? String(page + 1) : null };
  });
  const products = shown.items;

  const header = (
    <View style={styles.header}>
      <Text style={styles.tagline}>{t.home.tagline}</Text>
      <View style={styles.search}>
        <Ionicons name="search" size={20} color={colors.muted} />
        <TextInput
          accessibilityLabel={t.home.search}
          placeholder={t.home.search}
          placeholderTextColor={colors.muted}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => setQuery(draft.trim())}
          returnKeyType="search"
          style={styles.searchInput}
        />
        {draft ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.common.close}
            onPress={() => {
              setDraft('');
              setQuery('');
            }}
            hitSlop={10}
          >
            <Ionicons name="close-circle" size={20} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      {categories.length > 0 ? (
        <>
          <Text style={styles.section}>{t.home.categories}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tiles}
          >
            {[[null, t.home.all] as const, ...categories].map(([slug, title]) => {
              const active = category === slug;
              return (
                <Pressable
                  key={slug ?? 'all'}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={title}
                  onPress={() => setCategory(slug)}
                  style={styles.tile}
                >
                  {slug ? (
                    <Photo
                      uri={imageUri(categoryImage(slug))}
                      style={[styles.tileImage, active && styles.tileImageActive]}
                    />
                  ) : (
                    <View
                      style={[styles.tileImage, styles.allTile, active && styles.tileImageActive]}
                    >
                      <Ionicons name="grid-outline" size={26} color={colors.olive} />
                    </View>
                  )}
                  <Text
                    style={[styles.tileText, active && styles.tileTextActive]}
                    numberOfLines={1}
                  >
                    {title}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      ) : null}
      {!query && !category && library.recent.length > 0 ? (
        <>
          <Text style={styles.section}>{t.home.recent}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.recent}
          >
            {library.recent.map((item) => (
              <SummaryCard key={item.slug} item={item} compact />
            ))}
          </ScrollView>
        </>
      ) : null}
      <Segmented<SortMode>
        options={[
          ['relevance', t.home.sortRelevance],
          ['priceAsc', t.home.sortPriceAsc],
          ['priceDesc', t.home.sortPriceDesc],
        ]}
        value={sort}
        onChange={setSort}
      />
      {shown.data ? (
        <Text style={styles.count}>
          {fill(t.home.results, { n: shown.data.total ?? products.length })}
        </Text>
      ) : null}
      <LoadState
        loading={shown.loading && !shown.data}
        error={shown.data ? undefined : shown.error}
        onRetry={() => void shown.reload()}
      />
    </View>
  );

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      columnWrapperStyle={styles.row}
      data={products}
      keyExtractor={(product) => product.id}
      numColumns={2}
      ListHeaderComponent={header}
      ListEmptyComponent={
        shown.data ? <Empty icon="search-outline" text={t.home.empty} /> : undefined
      }
      renderItem={({ item }) => <ProductCard product={item} />}
      onEndReached={() => void shown.loadMore()}
      onEndReachedThreshold={0.5}
      ListFooterComponent={
        shown.hasMore ? (
          <Button
            label={t.home.more}
            variant="secondary"
            busy={shown.loadingMore}
            onPress={() => void shown.loadMore()}
          />
        ) : undefined
      }
      refreshControl={
        <RefreshControl
          refreshing={shown.loading && !!shown.data}
          onRefresh={() => void shown.reload()}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.cream },
  content: { padding: gap, gap: 12, paddingBottom: 40 },
  row: { gap: 12 },
  header: { gap: 12 },
  tagline: { fontSize: 15, color: colors.muted },
  section: { fontSize: 18, fontWeight: '800', color: colors.ink, marginTop: 4 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 50,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, fontSize: 16, color: colors.ink, minHeight: 48 },
  tiles: { gap: 12, paddingVertical: 2 },
  tile: { width: 76, alignItems: 'center', gap: 6 },
  tileImage: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.soft },
  tileImageActive: { borderWidth: 3, borderColor: colors.olive },
  allTile: { alignItems: 'center', justifyContent: 'center' },
  tileText: { fontSize: 12, fontWeight: '600', color: colors.muted, textAlign: 'center' },
  tileTextActive: { color: colors.olive, fontWeight: '800' },
  recent: { gap: 12, paddingVertical: 2 },
  count: { fontSize: 13, color: colors.muted },
});
