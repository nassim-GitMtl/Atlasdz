import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FavoriteButton } from '@/components/favorite-button';
import { Photo } from '@/components/photo';
import { summarize, type ProductSummary } from '@/lib/collections';
import { imageUri } from '@/lib/config';
import { fill, formatMoney, localized } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { colors, radius } from '@/lib/theme';
import type { CatalogProduct } from '@/lib/types';

/** Catalogue card: lowest price, number of sellers, stock, favorite heart. */
export function ProductCard({ product }: { readonly product: CatalogProduct }) {
  const { t } = useI18n();
  const inStock = product.offers.some((offer) => offer.availableQuantity > 0);
  return (
    <SummaryCard
      item={summarize(product)}
      meta={inStock ? fill(t.home.sellers, { n: product.offers.length }) : t.home.outOfStock}
    />
  );
}

/** Card from what the phone remembers (favorites, recently viewed) or from the catalogue. */
export function SummaryCard({
  item,
  meta,
  compact = false,
}: {
  readonly item: ProductSummary;
  readonly meta?: string;
  readonly compact?: boolean;
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
          <Text style={styles.price}>
            {fill(t.home.from, { price: formatMoney(item.priceMinor, locale) })}
          </Text>
          {meta ? <Text style={styles.meta}>{meta}</Text> : null}
        </View>
      </Pressable>
      <FavoriteButton item={item} floating />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  compact: { width: 150, flex: 0 },
  image: { width: '100%', aspectRatio: 1, backgroundColor: colors.soft },
  body: { padding: 10, gap: 4 },
  title: { fontSize: 14, fontWeight: '700', color: colors.ink, minHeight: 38 },
  price: { fontSize: 15, fontWeight: '800', color: colors.ink },
  meta: { fontSize: 12, color: colors.muted },
});
