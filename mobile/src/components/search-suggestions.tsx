import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { api } from '@/lib/api';
import { formatMoney, localized } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { colors } from '@/lib/theme';
import type { CatalogProductList } from '@/lib/types';
import { useRequest } from '@/lib/use-request';

/** Products matching the text being typed (shown until the search is submitted). */
export function SearchSuggestions({
  text,
  visible,
}: {
  readonly text: string;
  readonly visible: boolean;
}) {
  const { t, locale } = useI18n();
  const [settled, setSettled] = useState('');
  useEffect(() => {
    // Ask once typing pauses, not on every key.
    const timer = setTimeout(() => setSettled(text.trim()), 250);
    return () => clearTimeout(timer);
  }, [text]);
  const query = visible && settled.length >= 2 ? settled : null;
  const found = useRequest(query ? `suggest:${query}` : null, () =>
    api<CatalogProductList>(
      `/api/v1/catalog/products?limit=5&query=${encodeURIComponent(query ?? '')}`,
    ),
  );
  const items = query && found.data ? found.data.items : [];
  if (items.length === 0) return null;
  return (
    <View style={styles.list} accessibilityLabel={t.home.suggestions}>
      {items.map((item) => (
        <Pressable
          key={item.slug}
          accessibilityRole="link"
          onPress={() => router.push(`/product/${item.slug}`)}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <Text style={styles.title} numberOfLines={1}>
            {localized(item.title, locale)}
          </Text>
          <Text style={styles.price}>
            {formatMoney(Math.min(...item.offers.map((offer) => offer.priceMinor)), locale)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    marginTop: -4,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 44,
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  pressed: { backgroundColor: colors.soft },
  title: { flex: 1, fontSize: 15, color: colors.ink },
  price: { fontSize: 14, fontWeight: '700', color: colors.primary },
});
