import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, TextInput } from '@/components/text';

import { Photo } from '@/components/photo';
import { ProductCard, SummaryCard } from '@/components/product-card';
import { Button, Checkbox, Empty, Field, LoadState, Segmented } from '@/components/ui';
import { filterParams, parsePriceBound } from '@/lib/price-filter';
import { CommuneFilter } from '@/components/commune-filter';
import type { Place } from '@/components/place-picker';
import { SearchSuggestions } from '@/components/search-suggestions';
import { api } from '@/lib/api';
import { categoryImage, type SortMode } from '@/lib/collections';
import { imageUri } from '@/lib/config';
import { fill, localized } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useLibrary } from '@/lib/library';
import { fontFor } from '@/lib/fonts';
import { colors, gap } from '@/lib/theme';
import type { CatalogCategoryList, CatalogProduct, CatalogProductList, Locale } from '@/lib/types';
import { usePaged } from '@/lib/use-paged';
import { useRequest } from '@/lib/use-request';

const SERVER_SORT: Record<SortMode, string> = {
  relevance: 'recommended',
  priceAsc: 'price-asc',
  priceDesc: 'price-desc',
};
type ProductPage = CatalogProductList & { readonly nextCursor: string | null };

/** Language switch on the home screen: short label, full name for screen readers. */
const LANGUAGES: readonly (readonly [Locale, string, string])[] = [
  ['fr', 'FR', 'Français'],
  ['ar', 'ع', 'العربية'],
  ['en', 'EN', 'English'],
];

export default function HomeScreen() {
  const { t, locale, setLocale } = useI18n();
  const insets = useSafeAreaInsets();
  const library = useLibrary();
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>('relevance');
  // Stock and price filters: typed in the panel, applied together.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [priceDraft, setPriceDraft] = useState({ min: '', max: '' });
  const [filters, setFilters] = useState<{
    inStock: boolean;
    min?: number;
    max?: number;
    commune?: Place;
  }>({
    inStock: false,
  });
  const activeFilters =
    Number(filters.inStock) +
    Number(filters.min !== undefined) +
    Number(filters.max !== undefined) +
    Number(filters.commune !== undefined);

  // Every category with products on sale, and pages of products sorted by the API across the
  // whole catalogue (more load as the shopper scrolls).
  const categoryList = useRequest('categories', () =>
    api<CatalogCategoryList>('/api/v1/catalog/categories'),
  );
  const categoryItems = categoryList.data?.items ?? [];
  const categories = categoryItems.map(
    (item) => [item.slug, localized(item.title, locale)] as const,
  );
  // The category with the most products leads, with its real product count.
  const lead = [...categoryItems].sort((a, b) => b.productCount - a.productCount)[0];
  const params = new URLSearchParams({ limit: '24', sort: SERVER_SORT[sort] });
  if (query) params.set('query', query);
  if (category) params.set('category', category);
  for (const [key, value] of Object.entries(filterParams(filters))) params.set(key, value);
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
      <View style={styles.topBar}>
        <View
          style={styles.brand}
          accessible
          accessibilityRole="header"
          accessibilityLabel="atlas dz"
        >
          <Image source={require('../../../assets/mark.png')} style={styles.mark} />
          <Text style={styles.wordmark}>atlas dz</Text>
        </View>
        <View style={styles.languages} accessibilityRole="radiogroup">
          {LANGUAGES.map(([code, short, name]) => (
            <Pressable
              key={code}
              accessibilityRole="radio"
              accessibilityLabel={name}
              accessibilityLanguage={code}
              accessibilityState={{ checked: locale === code }}
              // react-native-web does not map `checked` to aria-checked for radios.
              aria-checked={locale === code}
              onPress={() => void setLocale(code)}
              style={[styles.language, locale === code && styles.languageActive]}
            >
              <Text
                style={[
                  styles.languageText,
                  locale === code && styles.languageTextActive,
                  { fontFamily: fontFor(800, code === 'ar') },
                ]}
              >
                {short}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
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
      <SearchSuggestions text={draft} visible={draft.trim() !== query} />
      {categories.length > 0 ? (
        <>
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
      {!query && !category && lead ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setCategory(lead.slug)}
          style={styles.hero}
        >
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>{fill(t.home.results, { n: lead.productCount })}</Text>
            <Text style={styles.heroTitle}>{localized(lead.title, locale)}</Text>
          </View>
          <Photo uri={imageUri(categoryImage(lead.slug))} style={styles.heroImage} />
        </Pressable>
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
      <Text style={styles.section} accessibilityRole="header">
        {category
          ? (categories.find(([slug]) => slug === category)?.[1] ?? t.home.catalog)
          : t.home.catalog}
        {shown.data ? (
          <Text style={styles.sectionCount}> · {shown.data.total ?? products.length}</Text>
        ) : null}
      </Text>
      <Segmented<SortMode>
        options={[
          ['relevance', t.home.sortRelevance],
          ['priceAsc', t.home.sortPriceAsc],
          ['priceDesc', t.home.sortPriceDesc],
        ]}
        value={sort}
        onChange={setSort}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t.home.filters}${activeFilters ? ` · ${activeFilters}` : ''}`}
        accessibilityState={{ expanded: filtersOpen }}
        onPress={() => setFiltersOpen((open) => !open)}
        style={styles.filterToggle}
      >
        <Ionicons name="options-outline" size={18} color={colors.primary} />
        <Text style={styles.filterToggleText}>
          {t.home.filters}
          {activeFilters ? ` · ${activeFilters}` : ''}
        </Text>
      </Pressable>
      {filtersOpen ? (
        <View style={styles.filterPanel}>
          <Checkbox
            checked={filters.inStock}
            label={t.home.inStock}
            onToggle={() => setFilters((current) => ({ ...current, inStock: !current.inStock }))}
          />
          <CommuneFilter
            value={filters.commune ?? null}
            onChange={(commune) =>
              setFilters(({ commune: _previous, ...current }) =>
                commune ? { ...current, commune } : current,
              )
            }
          />
          <View style={styles.priceRow}>
            <View style={styles.priceField}>
              <Field
                label={t.home.priceMin}
                value={priceDraft.min}
                onChangeText={(min) => setPriceDraft((current) => ({ ...current, min }))}
                keyboardType="number-pad"
                maxLength={8}
              />
            </View>
            <View style={styles.priceField}>
              <Field
                label={t.home.priceMax}
                value={priceDraft.max}
                onChangeText={(max) => setPriceDraft((current) => ({ ...current, max }))}
                keyboardType="number-pad"
                maxLength={8}
              />
            </View>
          </View>
          <Button
            label={t.home.applyFilters}
            variant="secondary"
            onPress={() =>
              setFilters((current) => ({
                ...current,
                min: parsePriceBound(priceDraft.min),
                max: parsePriceBound(priceDraft.max),
              }))
            }
          />
          {activeFilters ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setPriceDraft({ min: '', max: '' });
                setFilters({ inStock: false });
              }}
            >
              <Text style={styles.clearFilters}>{t.home.clearFilters}</Text>
            </Pressable>
          ) : null}
        </View>
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
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}
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
  filterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    alignSelf: 'flex-start',
  },
  filterToggleText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  filterPanel: {
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  priceRow: { flexDirection: 'row', gap: 10 },
  priceField: { flex: 1 },
  clearFilters: { color: colors.primary, textDecorationLine: 'underline', paddingVertical: 6 },
  list: { flex: 1, backgroundColor: colors.card },
  content: { padding: gap, gap: 14, paddingBottom: 40 },
  row: { gap: 12 },
  header: { gap: 14 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mark: { width: 34, height: 30, resizeMode: 'contain' },
  wordmark: { fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -1 },
  languages: {
    flexDirection: 'row',
    gap: 2,
    padding: 2,
    borderRadius: 999,
    backgroundColor: colors.surface,
  },
  language: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  languageActive: { backgroundColor: colors.card },
  languageText: { fontSize: 14, color: colors.muted },
  languageTextActive: { color: colors.primary },
  tagline: { fontSize: 15, color: colors.muted, marginTop: -4 },
  section: { fontSize: 20, fontWeight: '800', color: colors.ink, marginTop: 4 },
  sectionCount: { color: colors.muted, fontWeight: '700' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, fontSize: 16, color: colors.ink, minHeight: 48 },
  tiles: { gap: 10, paddingVertical: 2 },
  tile: { width: 76, alignItems: 'center', gap: 6 },
  tileImage: { width: 68, height: 68, borderRadius: 18, backgroundColor: colors.soft },
  tileImageActive: { borderWidth: 3, borderColor: colors.primary },
  allTile: { alignItems: 'center', justifyContent: 'center' },
  tileText: { fontSize: 13, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  tileTextActive: { color: colors.primary, fontWeight: '800' },
  hero: {
    flexDirection: 'row',
    height: 132,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: colors.primary,
  },
  heroCopy: { flex: 1, padding: 18, justifyContent: 'space-between' },
  heroEyebrow: { fontSize: 13, fontWeight: '800', color: colors.card },
  heroTitle: { fontSize: 24, fontWeight: '800', color: colors.card, letterSpacing: -0.5 },
  heroImage: { width: '44%', height: '100%' },
  recent: { gap: 12, paddingVertical: 2 },
});
