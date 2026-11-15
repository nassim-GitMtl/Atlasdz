import { reloadAppAsync } from 'expo';
import { getLocales } from 'expo-localization';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { I18nManager, Platform } from 'react-native';

import { readValue, writeValue } from './storage';
import { strings, type Strings } from './strings';
import type { Locale } from './types';

const KEY = 'atlas.locale';

interface I18n {
  readonly locale: Locale;
  readonly t: Strings;
  readonly rtl: boolean;
  readonly setLocale: (next: Locale) => Promise<void>;
}

const I18nContext = createContext<I18n | null>(null);

const deviceLocale = (): Locale => {
  const code = getLocales()[0]?.languageCode;
  return code === 'ar' || code === 'en' ? code : 'fr';
};

/** French, Arabic or English: the saved choice, else the phone's language. */
export function I18nProvider({ children }: { readonly children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(deviceLocale);

  useEffect(() => {
    void readValue(KEY).then((saved) => {
      if (saved === 'fr' || saved === 'ar' || saved === 'en') setLocaleState(saved);
    });
  }, []);

  const setLocale = useCallback(async (next: Locale) => {
    await writeValue(KEY, next);
    setLocaleState(next);
    const rtl = next === 'ar';
    // React Native flips the layout direction only after a restart.
    if (Platform.OS !== 'web' && I18nManager.isRTL !== rtl) {
      I18nManager.allowRTL(rtl);
      I18nManager.forceRTL(rtl);
      await reloadAppAsync('language changed');
    }
  }, []);

  const value = useMemo(
    () => ({ locale, t: strings[locale], rtl: locale === 'ar', setLocale }),
    [locale, setLocale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (value === null) throw new Error('useI18n outside I18nProvider');
  return value;
}
