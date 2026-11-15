import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { colors } from '@/lib/theme';

/** − value + control (quantities). */
export function Stepper({
  value,
  min,
  max,
  disabled = false,
  decreaseLabel,
  increaseLabel,
  onChange,
}: {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly disabled?: boolean;
  readonly decreaseLabel: string;
  readonly increaseLabel: string;
  readonly onChange: (value: number) => void;
}) {
  return (
    <View style={styles.row}>
      <Step
        label={decreaseLabel}
        icon="remove"
        disabled={disabled || value <= min}
        onPress={() => onChange(Math.max(min, value - 1))}
      />
      <Text style={styles.value} accessibilityLiveRegion="polite">
        {value}
      </Text>
      <Step
        label={increaseLabel}
        icon="add"
        disabled={disabled || value >= max}
        onPress={() => onChange(Math.min(max, value + 1))}
      />
    </View>
  );
}

function Step({
  label,
  icon,
  disabled,
  onPress,
}: {
  readonly label: string;
  readonly icon: 'add' | 'remove';
  readonly disabled: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && { opacity: 0.4 }]}
    >
      <Ionicons name={icon} size={22} color={colors.olive} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  value: { minWidth: 28, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.ink },
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
