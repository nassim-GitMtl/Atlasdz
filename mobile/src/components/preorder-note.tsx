import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { Badge } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { preorderDates, preorderText } from '@/lib/preorder';
import { colors } from '@/lib/theme';
import type { Preorder } from '@/lib/types';

/** "Précommande" badge with the estimated delivery (dates once the order exists). */
export function PreorderNote({
  preorder,
  placedAt,
}: {
  readonly preorder: Preorder;
  readonly placedAt?: string;
}) {
  const { t, locale } = useI18n();
  return (
    <View style={styles.note}>
      <Badge label={t.preorder.badge} tone="wait" />
      <Text style={styles.text}>
        {placedAt
          ? preorderDates(placedAt, preorder, t.preorder, locale)
          : preorderText(preorder, t.preorder)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  note: { gap: 4, alignItems: 'flex-start' },
  text: { color: colors.warning, fontWeight: '600' },
});
