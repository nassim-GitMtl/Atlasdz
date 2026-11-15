import { router, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { Badge, Button, Card, Empty, ListRow, Notice, Screen, text } from '@/components/ui';
import { errorCode } from '@/lib/api';
import { webPage } from '@/lib/config';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { errorMessage } from '@/lib/strings';
import { colors } from '@/lib/theme';
import type { Locale, NotificationPage, PhoneStatus } from '@/lib/types';
import { useRequest } from '@/lib/use-request';

export default function AccountScreen() {
  const { t, locale, setLocale } = useI18n();
  const session = useSession();
  const signedIn = session.status === 'signedIn';
  const phone = useRequest(signedIn ? 'phone' : null, () =>
    session.request<PhoneStatus>('/api/v1/account/phone'),
  );
  const notifications = useRequest(signedIn ? 'notification-count' : null, () =>
    session.request<NotificationPage>('/api/v1/notifications'),
  );
  const { refreshAccount } = session;
  const reloadPhone = phone.reload;
  const reloadNotifications = notifications.reload;
  useFocusEffect(
    useCallback(() => {
      void refreshAccount();
      void reloadPhone();
      void reloadNotifications();
    }, [refreshAccount, reloadPhone, reloadNotifications]),
  );
  const [resent, setResent] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const open = (path: string) => void WebBrowser.openBrowserAsync(webPage(path, locale));

  async function resend() {
    if (!session.account) return;
    try {
      await session.request('/api/v1/auth/email/resend', {
        body: { email: session.account.email },
      });
      setResent(true);
    } catch (error) {
      setFailure(errorCode(error));
    }
  }

  const languages: [Locale, string][] = [
    ['fr', 'Français'],
    ['ar', 'العربية'],
  ];

  return (
    <Screen>
      {!signedIn ? (
        <Empty
          icon="person-circle-outline"
          text={t.account.signedOut}
          action={<Button label={t.account.signIn} onPress={() => router.push('/login')} />}
        />
      ) : null}
      {failure ? <Notice tone="error">{errorMessage(t, failure)}</Notice> : null}
      {signedIn && session.account ? (
        <Card>
          <Text style={text.muted}>{t.account.email}</Text>
          <Text style={text.heading}>{session.account.email}</Text>
          <Badge
            label={session.account.emailVerified ? t.account.verified : t.account.unverified}
            tone={session.account.emailVerified ? 'good' : 'wait'}
          />
          {!session.account.emailVerified ? (
            resent ? (
              <Notice tone="success">{t.account.resent}</Notice>
            ) : (
              <Button label={t.account.resend} variant="secondary" onPress={() => void resend()} />
            )
          ) : null}
        </Card>
      ) : null}
      {signedIn && phone.data && (phone.data.required || phone.data.verified) ? (
        <Card>
          <Text style={text.muted}>{t.account.phone}</Text>
          <Text style={text.heading}>{phone.data.phone ?? t.account.phoneMissing}</Text>
          {phone.data.verified ? (
            <Badge label={t.account.verified} tone="good" />
          ) : (
            <Button
              label={t.account.phoneVerify}
              variant="secondary"
              onPress={() => router.push('/phone')}
            />
          )}
        </Card>
      ) : null}
      {signedIn ? (
        <Card>
          <ListRow
            icon="notifications-outline"
            label={t.account.notifications}
            badge={notifications.data?.unreadCount}
            onPress={() => router.push('/notifications')}
          />
          <ListRow
            icon="location-outline"
            label={t.account.addresses}
            onPress={() => router.push('/addresses')}
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
      ) : (
        <Card>
          <Text style={text.heading}>{t.account.sell}</Text>
          <Text style={text.muted}>{t.account.sellHint}</Text>
          <Button
            label={t.login.sellerRegister}
            variant="secondary"
            onPress={() => router.push('/seller-register')}
          />
        </Card>
      )}
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
        <Text style={text.muted}>{t.account.restartNote}</Text>
      </Card>
      <Card>
        <Text style={text.heading}>{t.account.legal}</Text>
        <ListRow
          icon="document-text-outline"
          label={t.account.notice}
          onPress={() => open('/legal/mentions-legales')}
        />
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
        {signedIn ? (
          <ListRow
            icon="download-outline"
            label={t.account.data}
            onPress={() => open('/account')}
          />
        ) : null}
      </Card>
      {signedIn ? (
        <>
          <Button
            label={t.account.signOut}
            variant="secondary"
            onPress={() => void session.signOut()}
          />
          <Button
            label={t.account.delete}
            variant="secondary"
            onPress={() => router.push('/delete-account')}
          />
        </>
      ) : null}
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
