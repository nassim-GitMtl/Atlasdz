import { Ionicons } from '@expo/vector-icons';
import type { ColorValue } from 'react-native';

export function TabIcon({
  name,
  color,
  size,
}: {
  readonly name: keyof typeof Ionicons.glyphMap;
  readonly color: ColorValue;
  readonly size: number;
}) {
  // Tab tint colours are plain strings (theme.ts).
  return <Ionicons name={name} color={String(color)} size={size} />;
}
