import { Manrope_400Regular } from '@expo-google-fonts/manrope/400Regular';
import { Manrope_600SemiBold } from '@expo-google-fonts/manrope/600SemiBold';
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';
import { Manrope_800ExtraBold } from '@expo-google-fonts/manrope/800ExtraBold';
import { NotoSansArabic_400Regular } from '@expo-google-fonts/noto-sans-arabic/400Regular';
import { NotoSansArabic_600SemiBold } from '@expo-google-fonts/noto-sans-arabic/600SemiBold';
import { NotoSansArabic_700Bold } from '@expo-google-fonts/noto-sans-arabic/700Bold';
import { NotoSansArabic_800ExtraBold } from '@expo-google-fonts/noto-sans-arabic/800ExtraBold';

/** Brand fonts, as on the websites: Manrope, and Noto Sans Arabic for Arabic. */
export const fontFiles = {
  Manrope_400Regular,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  NotoSansArabic_400Regular,
  NotoSansArabic_600SemiBold,
  NotoSansArabic_700Bold,
  NotoSansArabic_800ExtraBold,
};

type Weight = 400 | 600 | 700 | 800;
const latin: Record<Weight, keyof typeof fontFiles> = {
  400: 'Manrope_400Regular',
  600: 'Manrope_600SemiBold',
  700: 'Manrope_700Bold',
  800: 'Manrope_800ExtraBold',
};
const arabic: Record<Weight, keyof typeof fontFiles> = {
  400: 'NotoSansArabic_400Regular',
  600: 'NotoSansArabic_600SemiBold',
  700: 'NotoSansArabic_700Bold',
  800: 'NotoSansArabic_800ExtraBold',
};

/** Each weight is its own font file: map a style's fontWeight to the nearest one. */
export function fontFor(weight: string | number | undefined, rtl: boolean): string {
  const value = weight === 'bold' ? 700 : Number(weight) || 400;
  const nearest: Weight = value >= 800 ? 800 : value >= 700 ? 700 : value >= 550 ? 600 : 400;
  return (rtl ? arabic : latin)[nearest];
}
