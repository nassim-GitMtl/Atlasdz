import { StyleSheet, Text, View } from 'react-native';

import { text } from '@/components/ui';
import { formatDate, formatMoney } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { colors } from '@/lib/theme';

/** Bars of delivered sales per day; read out as one sentence with the period total. */
export function SalesChart({
  days,
}: {
  readonly days: readonly { readonly day: string; readonly totalMinor: number }[];
}) {
  const { t, locale } = useI18n();
  const total = days.reduce((sum, day) => sum + day.totalMinor, 0);
  const highest = Math.max(1, ...days.map((day) => day.totalMinor));
  const first = days[0];
  const last = days.at(-1);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${t.seller.salesChart} : ${formatMoney(total, locale)}`}
      style={styles.chart}
    >
      <Text style={text.muted}>{t.seller.salesChart}</Text>
      <Text style={text.heading}>{formatMoney(total, locale)}</Text>
      {total === 0 ? (
        <Text style={text.muted}>{t.seller.salesChartEmpty}</Text>
      ) : (
        <View style={styles.bars}>
          {days.map((day) => (
            <View key={day.day} style={styles.slot}>
              <View
                style={[
                  styles.bar,
                  {
                    height: `${Math.max(day.totalMinor > 0 ? 6 : 2, (day.totalMinor / highest) * 100)}%`,
                  },
                  day.totalMinor === 0 && styles.empty,
                ]}
              />
            </View>
          ))}
        </View>
      )}
      {first && last ? (
        <View style={styles.axis}>
          <Text style={styles.axisText}>{formatDate(`${first.day}T12:00:00`, locale)}</Text>
          <Text style={styles.axisText}>{formatDate(`${last.day}T12:00:00`, locale)}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { gap: 6 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: 90, gap: 4 },
  slot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 3, backgroundColor: colors.olive },
  empty: { backgroundColor: colors.line },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  axisText: { color: colors.muted, fontSize: 12 },
});
