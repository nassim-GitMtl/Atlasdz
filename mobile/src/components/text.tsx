import type { ComponentProps } from 'react';
import {
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  type TextProps,
} from 'react-native';

import { fontFor } from '@/lib/fonts';
import { useI18n } from '@/lib/i18n';

/** Text in the brand font for the current language and weight. */
export function Text({ style, ...props }: TextProps) {
  const { rtl } = useI18n();
  const weight = StyleSheet.flatten(style)?.fontWeight;
  return <NativeText {...props} style={[style, { fontFamily: fontFor(weight, rtl), fontWeight: 'normal' }]} />;
}

/** React 19 passes `ref` as a normal prop, so focus calls still reach the native input. */
export function TextInput({ style, ...props }: ComponentProps<typeof NativeTextInput>) {
  const { rtl } = useI18n();
  const weight = StyleSheet.flatten(style)?.fontWeight;
  return <NativeTextInput {...props} style={[style, { fontFamily: fontFor(weight, rtl), fontWeight: 'normal' }]} />;
}
