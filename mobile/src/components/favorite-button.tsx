import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

import type { ProductSummary } from '@/lib/collections';
import { useI18n } from '@/lib/i18n';
import { useLibrary } from '@/lib/library';
import { colors } from '@/lib/theme';

/** Heart toggle; favorites stay on this phone. */
export function FavoriteButton({
  item,
  floating = false,
}: {
  readonly item: ProductSummary;
  readonly floating?: boolean;
}) {
  const { t } = useI18n();
  const library = useLibrary();
  const active = library.isFavorite(item.slug);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={active ? t.product.favoriteRemove : t.product.favoriteAdd}
      accessibilityState={{ selected: active }}
      hitSlop={10}
      onPress={() => library.toggle(item)}
      style={floating ? styles.floating : styles.plain}
    >
      <Ionicons
        name={active ? 'heart' : 'heart-outline'}
        size={floating ? 20 : 24}
        color={active ? colors.coral : floating ? colors.ink : colors.olive}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  floating: {
    position: 'absolute',
    top: 8,
    end: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  plain: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
