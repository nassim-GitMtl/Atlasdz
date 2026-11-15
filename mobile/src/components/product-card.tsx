import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { FavoriteButton } from '@/components/favorite-button';
import { Photo } from '@/components/photo';
import { summarize, type ProductSummary } from '@/lib/collections';
import { imageUri } from '@/lib/config';
import { fill, formatMoney, localized } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { discountPercent } from '@/lib/promotion';
import { colors } from '@/lib/theme';
import type { CatalogProduct } from '@/lib/types';

/** Catalogue card: lowest price, number of sellers, stock, favorite heart. */
export function ProductCard({ product }: { readonly product: CatalogProduct }) {
  const { t } = useI18n();
  const inStock = product.offers.some((offer) => offer.availableQuantity > 0);
  const sellers = new Set(product.offers.map((offer) => offer.seller.id)).size;
  const meta = !inStock
    ? t.home.outOfStock
    : sellers === 1
      ? product.offers[0]?.seller.name
      : fill(t.home.sellers, { n: sellers });
  const item = summarize(product);
  // A running promotion on the cheapest offer shows with the seller's real regular price.
  const promoted = product.offers.find(
    (offer) => offer.priceMinor === item.priceMinor && offer.regularPriceMinor,
  );
  return (
    <SummaryCard
      item={item}
      meta={meta}
      from={product.offers.length > 1}
      regularPriceMinor={promoted?.regularPriceMinor ?? null}
    />
  );
}

/** Card from what the phone remembers (favorites, recently viewed) or from the catalogue. */
export function SummaryCard({
  item,
  meta,
  compact = false,
  from = true,
  regularPriceMinor = null,
}: {
  readonly item: ProductSummary;
  readonly meta?: string | undefined;
  readonly compact?: boolean;
  /** Several offers: the price shown is the lowest one. */
  readonly from?: boolean;
  readonly regularPriceMinor?: number | null;
}) {
  const { t, locale } = useI18n();
  const title = localized(item.title, locale);
  return (
    <View style={[styles.card, compact && styles.compact]}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={title}
        onPress={() => router.push(`/product/${item.slug}`)}
        style={({ pressed }) => pressed && { opacity: 0.85 }}
      >
        <Photo uri={imageUri(item.imageUrl, 'small')} style={styles.image} />
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          {meta ? <Text style={styles.meta}>{meta}</Text> : null}
          <Text style={styles.price}>
            {from
              ? fill(t.home.from, { price: formatMoney(item.priceMinor, locale) })
              : formatMoney(item.priceMinor, locale)}
          </Text>
          {regularPriceMinor && regularPriceMinor > item.priceMinor ? (
            <View style={styles.promoRow}>
              <Text style={styles.promoTag}>
                {fill(t.promo.tag, { n: discountPercent(item.priceMinor, regularPriceMinor) })}
              </Text>
              <Text style={styles.regular}>{formatMoney(regularPriceMinor, locale)}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
      <FavoriteButton item={item} floating />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, backgroundColor: colors.card },
  compact: { width: 150, flex: 0 },
  image: { width: '100%', aspectRatio: 1, borderRadius: 14, backgroundColor: colors.surface },
  body: { paddingTop: 8, gap: 2 },
  title: { fontSize: 15, fontWeight: '800', color: colors.ink, minHeight: 40 },
  price: { fontSize: 17, fontWeight: '800', color: colors.primary },
  meta: { fontSize: 12, fontWeight: '600', color: colors.muted },
  promoRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  promoTag: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  regular: { fontSize: 12, color: colors.muted, textDecorationLine: 'line-through' },
});
