import { FlatList, StyleSheet } from 'react-native';

import { SummaryCard } from '@/components/product-card';
import { Empty } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { useLibrary } from '@/lib/library';
import { colors, gap } from '@/lib/theme';

/** Favorites kept on this phone; prices refresh when the product page is opened. */
export default function FavoritesScreen() {
  const { t } = useI18n();
  const { favorites } = useLibrary();
  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      columnWrapperStyle={styles.row}
      numColumns={2}
      data={favorites}
      keyExtractor={(item) => item.slug}
      renderItem={({ item }) => <SummaryCard item={item} />}
      ListEmptyComponent={<Empty icon="heart-outline" text={t.favorites.empty} />}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.cream },
  content: { padding: gap, gap: 12, paddingBottom: 40 },
  row: { gap: 12 },
});
