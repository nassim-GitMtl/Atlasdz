import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { MfaStep } from '@/components/mfa-step';
import { Button, Field, Notice, Screen, Segmented, text } from '@/components/ui';
import { api, errorCode } from '@/lib/api';
import { SHOP_URL } from '@/lib/config';
import { useI18n } from '@/lib/i18n';
import { useSession, type Actor, type SignInStep } from '@/lib/session';
import { afterSignIn } from '@/lib/navigation';
import { errorMessage } from '@/lib/strings';
import { colors } from '@/lib/theme';

export default function LoginScreen() {
  const { t, locale } = useI18n();
  const session = useSession();
  const [mode, setMode] = useState<'signIn' | 'register'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<SignInStep | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function finish(next: SignInStep, actorHint: Actor) {
    if (next.step === 'done') afterSignIn(actorHint);
    else setStep(next);
  }

  async function submit(code?: string) {
    setBusy(true);
    setFailure(null);
    try {
      if (mode === 'register') {
        await session.register(email.trim(), password, locale);
        afterSignIn('customer');
        return;
      }
      const next = await session.signIn(email.trim(), password, code);
      // A code step only happens for sellers; a direct sign-in is a customer.
      await finish(next, code ? 'seller' : 'customer');
    } catch (error) {
      setFailure(errorCode(error));
    } finally {
      setBusy(false);
    }
  }

  async function demo(actor: Actor) {
    setBusy(true);
    setFailure(null);
    try {
      await session.signInDemo(actor);
      afterSignIn(actor);
    } catch (error) {
      setFailure(errorCode(error));
    } finally {
      setBusy(false);
    }
  }

  async function forgot() {
    setFailure(null);
    try {
      // The reset link opens the shop website, the only page that sets a new password.
      await api('/api/v1/auth/password/forgot', {
        body: { email: email.trim(), locale, origin: SHOP_URL },
      });
      setNotice(t.login.forgotSent);
    } catch (error) {
      setFailure(errorCode(error));
    }
  }

  if (step && step.step !== 'done') {
    return (
      <Screen>
        <MfaStep step={step} busy={busy} failure={failure} onSubmit={(code) => void submit(code)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Segmented
        options={[
          ['signIn', t.login.signInTab],
          ['register', t.login.registerTab],
        ]}
        value={mode}
        onChange={(next) => {
          setMode(next);
          setFailure(null);
        }}
      />
      <Field
        label={t.login.email}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
      />
      <Field
        label={t.login.password}
        hint={mode === 'register' ? t.login.passwordHint : undefined}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
        textContentType={mode === 'register' ? 'newPassword' : 'password'}
      />
      {failure ? <Notice tone="error">{errorMessage(t, failure)}</Notice> : null}
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      <Button
        label={mode === 'signIn' ? t.login.submitSignIn : t.login.submitRegister}
        busy={busy}
        disabled={!email.trim() || !password}
        onPress={() => void submit()}
      />
      {mode === 'signIn' ? (
        <Pressable
          accessibilityRole="button"
          disabled={!email.trim()}
          onPress={() => void forgot()}
          style={styles.link}
        >
          <Text style={[text.link, !email.trim() && { color: colors.muted }]}>
            {t.login.forgot}
          </Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.replace('/seller-register')}
        style={styles.link}
      >
        <Text style={text.link}>{t.login.sellerRegister}</Text>
      </Pressable>
      {__DEV__ ? (
        // Local testing only: hidden in release builds; the endpoint exists only on a local API.
        <>
          <Button
            label={t.login.demo}
            variant="secondary"
            busy={busy}
            onPress={() => void demo('customer')}
          />
          <Button
            label={t.login.demoSeller}
            variant="secondary"
            busy={busy}
            onPress={() => void demo('seller')}
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  link: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
});
