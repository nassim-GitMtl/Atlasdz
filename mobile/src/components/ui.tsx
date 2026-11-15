import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  I18nManager,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { useI18n } from '@/lib/i18n';
import { errorMessage } from '@/lib/strings';
import { colors, gap, radius } from '@/lib/theme';

/** Scrollable page with pull-to-refresh when `onRefresh` is given. */
export function Screen({
  children,
  refreshing = false,
  onRefresh,
}: {
  readonly children: ReactNode;
  readonly refreshing?: boolean;
  readonly onRefresh?: () => void;
}) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: 'primary' | 'secondary' | 'danger';
  readonly disabled?: boolean;
  readonly busy?: boolean;
}) {
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      // Keeps its name while the spinner replaces the text (busy is announced by the state).
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'danger' && styles.dangerButton,
        inactive && styles.inactive,
        pressed && styles.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator
          aria-hidden
          color={variant === 'secondary' ? colors.olive : colors.card}
        />
      ) : (
        <Text style={[styles.buttonText, variant === 'secondary' && styles.secondaryText]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  error,
  style,
  ...input
}: TextInputProps & {
  readonly label: string;
  readonly hint?: string;
  readonly error?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={colors.muted}
        {...input}
        // Merged, not replaced: a screen's style adds to the field's border and background.
        style={[
          styles.input,
          input.multiline && styles.multiline,
          error && styles.inputError,
          style,
        ]}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Notice({
  children,
  tone = 'info',
}: {
  readonly children: ReactNode;
  readonly tone?: 'info' | 'error' | 'success';
}) {
  return (
    <View
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      style={[
        styles.notice,
        tone === 'error' && styles.noticeError,
        tone === 'success' && styles.noticeSuccess,
      ]}
    >
      <Text style={styles.noticeText}>{children}</Text>
    </View>
  );
}

/** Loading, error (with retry) or nothing. */
export function LoadState({
  loading,
  error,
  onRetry,
}: {
  readonly loading: boolean;
  readonly error?: string;
  readonly onRetry: () => void;
}) {
  const { t } = useI18n();
  if (error) {
    return (
      <View style={styles.center}>
        <Notice tone="error">{errorMessage(t, error)}</Notice>
        <Button label={t.common.retry} variant="secondary" onPress={onRetry} />
      </View>
    );
  }
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.olive} accessibilityLabel={t.common.loading} />
      </View>
    );
  }
  return null;
}

export function Empty({
  icon,
  text,
  action,
}: {
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly text: string;
  readonly action?: ReactNode;
}) {
  return (
    <View style={styles.center}>
      <Ionicons name={icon} size={44} color={colors.muted} />
      <Text style={styles.emptyText}>{text}</Text>
      {action}
    </View>
  );
}

export function Badge({
  label,
  tone = 'neutral',
}: {
  readonly label: string;
  readonly tone?: 'neutral' | 'good' | 'bad' | 'wait';
}) {
  return (
    <View
      style={[
        styles.badge,
        tone === 'good' && { backgroundColor: colors.successSoft },
        tone === 'bad' && { backgroundColor: colors.dangerSoft },
        tone === 'wait' && { backgroundColor: colors.warningSoft },
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          tone === 'good' && { color: colors.success },
          tone === 'bad' && { color: colors.danger },
          tone === 'wait' && { color: colors.warning },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export function Checkbox({
  checked,
  label,
  onToggle,
}: {
  readonly checked: boolean;
  readonly label: string;
  readonly onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      aria-checked={checked}
      onPress={onToggle}
      style={styles.checkRow}
    >
      <Ionicons
        name={checked ? 'checkbox' : 'square-outline'}
        size={26}
        color={checked ? colors.olive : colors.muted}
      />
      <Text style={styles.checkLabel}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children }: { readonly children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

/** A menu row: icon, label, optional detail or badge, and a direction-aware arrow. */
export function ListRow({
  icon,
  label,
  detail,
  badge,
  onPress,
}: {
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly label: string;
  readonly detail?: string;
  readonly badge?: number;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label} (${badge})` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.soft }]}
    >
      <Ionicons name={icon} size={22} color={colors.olive} />
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel}>{label}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      {badge ? (
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
      <Ionicons
        name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'}
        size={18}
        color={colors.muted}
      />
    </Pressable>
  );
}

/** Two to four mutually exclusive choices shown side by side. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  readonly options: readonly (readonly [T, string])[];
  readonly value: T;
  readonly onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segments} accessibilityRole="tablist">
      {options.map(([option, label]) => (
        <Pressable
          key={option}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === option }}
          onPress={() => onChange(option)}
          style={[styles.segment, value === option && styles.segmentActive]}
        >
          <Text
            style={[styles.segmentText, value === option && styles.segmentTextActive]}
            numberOfLines={2}
          >
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export const text = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '800', color: colors.ink },
  heading: { fontSize: 18, fontWeight: '700', color: colors.ink },
  body: { fontSize: 15, lineHeight: 22, color: colors.ink },
  muted: { fontSize: 14, lineHeight: 20, color: colors.muted },
  price: { fontSize: 17, fontWeight: '800', color: colors.ink },
  link: { fontSize: 15, fontWeight: '700', color: colors.olive },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: gap, gap, paddingBottom: 40 },
  button: {
    minHeight: 50,
    borderRadius: radius,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.olive },
  secondary: { backgroundColor: colors.soft },
  dangerButton: { backgroundColor: colors.danger },
  inactive: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  buttonText: { color: colors.card, fontSize: 16, fontWeight: '700' },
  secondaryText: { color: colors.olive },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '700', color: colors.ink },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.ink,
  },
  multiline: { minHeight: 110, textAlignVertical: 'top', paddingTop: 12, paddingBottom: 12 },
  inputError: { borderColor: colors.danger, borderWidth: 2 },
  hint: { fontSize: 13, color: colors.muted },
  notice: { borderRadius: radius, padding: 14, backgroundColor: colors.soft },
  noticeError: { backgroundColor: colors.dangerSoft },
  noticeSuccess: { backgroundColor: colors.successSoft },
  noticeText: { fontSize: 15, lineHeight: 21, color: colors.ink },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap },
  emptyText: { fontSize: 16, color: colors.muted, textAlign: 'center' },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.soft,
  },
  badgeText: { fontSize: 13, fontWeight: '700', color: colors.ink },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  checkLabel: { flex: 1, fontSize: 15, color: colors.ink },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 54,
    paddingVertical: 8,
  },
  rowBody: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 16, color: colors.ink, fontWeight: '600' },
  rowDetail: { fontSize: 13, color: colors.muted },
  countBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.coral,
  },
  countText: { color: colors.card, fontSize: 12, fontWeight: '800' },
  segments: { flexDirection: 'row', gap: 8 },
  segment: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.soft,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  segmentActive: { backgroundColor: colors.olive },
  segmentText: { fontSize: 14, fontWeight: '700', color: colors.olive, textAlign: 'center' },
  segmentTextActive: { color: colors.card },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    padding: gap,
    gap: 10,
  },
});
