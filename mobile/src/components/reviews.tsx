import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, Card, text } from '@/components/ui';
import { fill, formatDate, localized } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { formatRating, sharePercent, starIcons } from '@/lib/reviews';
import { colors, radius } from '@/lib/theme';
import type { PublicReview, ReviewSummary } from '@/lib/types';

const STAR = colors.warning;

/** Read-only stars, announced as "4,5 sur 5". */
export function Stars({ value, size = 16 }: { readonly value: number; readonly size?: number }) {
  const { t, locale, rtl } = useI18n();
  return (
    <View
      style={styles.stars}
      accessible
      accessibilityRole="image"
      accessibilityLabel={fill(t.reviews.outOf, { value: formatRating(value, locale) })}
    >
      {starIcons(value).map((icon, index) => (
        <Ionicons
          key={index}
          name={icon}
          size={size}
          color={STAR}
          // The half star fills from the reading start.
          style={rtl && icon === 'star-half' ? styles.mirror : undefined}
        />
      ))}
    </View>
  );
}

/** Five large stars to choose a rating (a radio group for screen readers). */
export function StarPicker({
  value,
  label,
  onChange,
}: {
  readonly value: number;
  readonly label: string;
  readonly onChange: (value: number) => void;
}) {
  const { t } = useI18n();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.picker}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable
          key={star}
          accessibilityRole="radio"
          aria-checked={value === star}
          accessibilityLabel={fill(t.reviews.starLabel, { n: star })}
          onPress={() => onChange(star)}
          style={styles.pick}
        >
          <Ionicons name={star <= value ? 'star' : 'star-outline'} size={32} color={STAR} />
        </Pressable>
      ))}
    </View>
  );
}

/** Average, number of reviews and the 5→1 star distribution. */
export function RatingSummary({ summary }: { readonly summary: ReviewSummary }) {
  const { t, locale } = useI18n();
  if (summary.count === 0 || summary.average === null) {
    return <Text style={text.muted}>{t.reviews.none}</Text>;
  }
  return (
    <View style={styles.summary}>
      <View style={styles.average}>
        <Text style={styles.averageValue}>{formatRating(summary.average, locale)}</Text>
        <Stars value={summary.average} />
        <Text style={text.muted}>{fill(t.reviews.count, { n: summary.count })}</Text>
      </View>
      {/* The bars repeat the counts visually; the average and total are read out above. */}
      <View style={styles.bars} aria-hidden>
        {[5, 4, 3, 2, 1].map((star) => {
          const n = summary.stars[star - 1] ?? 0;
          return (
            <View key={star} style={styles.barRow}>
              <Text style={styles.barLabel}>{star}</Text>
              <Ionicons name="star" size={12} color={STAR} />
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${sharePercent(n, summary.count)}%` }]} />
              </View>
              <Text style={styles.barCount}>{n}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Compact "★ 4,5 · 12 avis" line for headers. */
export function RatingLine({ summary }: { readonly summary: ReviewSummary }) {
  const { t, locale } = useI18n();
  if (summary.count === 0 || summary.average === null) return null;
  return (
    <View style={styles.line}>
      <Stars value={summary.average} size={14} />
      <Text style={styles.lineText}>
        {formatRating(summary.average, locale)} · {fill(t.reviews.count, { n: summary.count })}
      </Text>
    </View>
  );
}

/** One review: stars, date, "verified purchase", the words and the seller's answer. */
export function ReviewItem({
  review,
  showProduct = false,
  children,
}: {
  readonly review: PublicReview;
  readonly showProduct?: boolean;
  readonly children?: ReactNode;
}) {
  const { t, locale } = useI18n();
  return (
    <Card>
      <View style={styles.head}>
        <Stars value={review.rating} />
        <Text style={text.muted}>{formatDate(review.createdAt, locale)}</Text>
      </View>
      <View style={styles.badges}>
        <Badge label={t.reviews.verified} tone="good" />
      </View>
      {showProduct ? (
        <Text style={text.muted}>
          {fill(t.reviews.product, { title: localized(review.productTitle, locale) })}
        </Text>
      ) : null}
      {review.body ? <Text style={text.body}>{review.body}</Text> : null}
      {review.reply ? (
        <View style={styles.reply}>
          <Text style={styles.replyTitle}>
            {t.reviews.sellerReply} · {review.sellerName}
          </Text>
          <Text style={text.body}>{review.reply}</Text>
        </View>
      ) : null}
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  stars: { flexDirection: 'row', gap: 2, alignItems: 'center' },
  mirror: { transform: [{ scaleX: -1 }] },
  picker: { flexDirection: 'row', gap: 4 },
  pick: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  summary: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  average: { alignItems: 'center', gap: 4, minWidth: 96 },
  averageValue: { fontSize: 36, fontWeight: '800', color: colors.ink },
  bars: { flex: 1, gap: 4 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  barLabel: { width: 12, textAlign: 'center', color: colors.muted, fontSize: 13 },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.soft,
    overflow: 'hidden',
  },
  barFill: { height: 8, borderRadius: 4, backgroundColor: STAR },
  barCount: { minWidth: 24, textAlign: 'right', color: colors.muted, fontSize: 13 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lineText: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  badges: { flexDirection: 'row' },
  reply: { backgroundColor: colors.soft, borderRadius: radius, padding: 12, gap: 4 },
  replyTitle: { fontWeight: '700', color: colors.olive },
});
