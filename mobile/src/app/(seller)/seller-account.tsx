import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { Badge, Button, Card, ListRow, Screen, text } from '@/components/ui';
import { webPage } from '@/lib/config';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';
import type { Locale } from '@/lib/types';

export default function SellerAccountScreen() {
  const { t, locale, setLocale } = useI18n();
  const session = useSession();
  const status = session.seller?.status;
  const open = (path: string) => void WebBrowser.openBrowserAsync(webPage(path, locale));
  const languages: [Locale, string][] = [
    ['fr', 'Français'],
    ['ar', 'العربية'],
  ];
  return (
    <Screen>
      {status ? (
        <Card>
          <Badge
            label={t.seller[status]}
            tone={status === 'APPROVED' ? 'good' : status === 'PENDING_REVIEW' ? 'wait' : 'bad'}
          />
          {status === 'PENDING_REVIEW' ? (
            <Text style={text.muted}>{t.seller.pendingNote}</Text>
          ) : null}
        </Card>
      ) : null}
      <Card>
        <ListRow
          icon="car-outline"
          label={t.seller.delivery}
          onPress={() => router.push('/seller/delivery')}
        />
        <ListRow
          icon="notifications-outline"
          label={t.account.notifications}
          onPress={() => router.push('/notifications')}
        />
        <ListRow
          icon="chatbubbles-outline"
          label={t.account.help}
          onPress={() => router.push('/support')}
        />
        <ListRow
          icon="phone-portrait-outline"
          label={t.account.devices}
          onPress={() => router.push('/sessions')}
        />
      </Card>
      <Card>
        <Text style={text.heading}>{t.account.language}</Text>
        <View style={styles.languages}>
          {languages.map(([code, label]) => (
            <Pressable
              key={code}
              accessibilityRole="button"
              accessibilityState={{ selected: locale === code }}
              onPress={() => void setLocale(code)}
              style={[styles.language, locale === code && styles.languageActive]}
            >
              <Text style={[text.link, locale === code && styles.languageTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </Card>
      <Card>
        <Text style={text.heading}>{t.account.legal}</Text>
        <ListRow
          icon="reader-outline"
          label={t.account.terms}
          onPress={() => open('/legal/conditions')}
        />
        <ListRow
          icon="shield-checkmark-outline"
          label={t.account.privacy}
          onPress={() => open('/legal/confidentialite')}
        />
      </Card>
      <Button
        label={t.account.signOut}
        variant="secondary"
        onPress={() => void session.signOut()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  languages: { flexDirection: 'row', gap: 10 },
  language: {
    flex: 1,
    minHeight: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.soft,
  },
  languageActive: { backgroundColor: colors.olive },
  languageTextActive: { color: colors.card },
});
