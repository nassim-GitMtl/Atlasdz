import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useI18n } from '@/lib/i18n';
import { colors, gap, radius } from '@/lib/theme';

export interface Place {
  readonly id: string;
  readonly label: string;
}

/** A field that opens a searchable list (69 wilayas, up to ~60 communes each). */
export function PlacePicker({
  label,
  value,
  places,
  disabled = false,
  onChange,
}: {
  readonly label: string;
  readonly value: Place | null;
  readonly places: readonly Place[];
  readonly disabled?: boolean;
  readonly onChange: (place: Place) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return needle ? places.filter((p) => p.label.toLowerCase().includes(needle)) : places;
  }, [filter, places]);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value?.label ?? t.checkout.choose}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[styles.select, disabled && { opacity: 0.5 }]}
      >
        <Text style={[styles.value, !value && { color: colors.muted }]} numberOfLines={1}>
          {value?.label ?? t.checkout.choose}
        </Text>
        <Ionicons name="chevron-down" size={20} color={colors.muted} />
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{label}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.common.close}
              onPress={() => setOpen(false)}
              hitSlop={12}
            >
              <Ionicons name="close" size={28} color={colors.ink} />
            </Pressable>
          </View>
          <TextInput
            accessibilityLabel={t.checkout.filter}
            placeholder={t.checkout.filter}
            placeholderTextColor={colors.muted}
            value={filter}
            onChangeText={setFilter}
            style={styles.search}
            autoCorrect={false}
          />
          <FlatList
            data={shown}
            keyExtractor={(place) => place.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onChange(item);
                  setFilter('');
                  setOpen(false);
                }}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.soft }]}
              >
                <Text style={styles.rowText}>{item.label}</Text>
                {item.id === value?.id ? (
                  <Ionicons name="checkmark" size={22} color={colors.olive} />
                ) : null}
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '700', color: colors.ink },
  select: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  value: { flex: 1, fontSize: 16, color: colors.ink },
  modal: { flex: 1, backgroundColor: colors.cream },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: gap,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: colors.ink },
  search: {
    marginHorizontal: gap,
    marginBottom: 8,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.ink,
  },
  row: {
    minHeight: 52,
    paddingHorizontal: gap,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  rowText: { flex: 1, fontSize: 16, color: colors.ink },
});
