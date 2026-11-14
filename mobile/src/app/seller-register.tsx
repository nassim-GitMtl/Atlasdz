import { useState } from 'react';
import { Text } from 'react-native';

import { MfaStep } from '@/components/mfa-step';
import { Button, Field, Notice, Screen, text } from '@/components/ui';
import { errorCode } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useSession, type SignInStep } from '@/lib/session';
import { afterSignIn } from '@/lib/navigation';
import { errorMessage } from '@/lib/strings';

/** Opens a shop: account, store name and presentation, then the authenticator setup. */
export default function SellerRegisterScreen() {
  const { t } = useI18n();
  const session = useSession();
  const [form, setForm] = useState({
    storeName: '',
    email: '',
    password: '',
    descriptionFr: '',
    descriptionAr: '',
  });
  const [step, setStep] = useState<SignInStep | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function register() {
    setBusy(true);
    setFailure(null);
    try {
      const next = await session.registerSeller({
        email: form.email.trim(),
        password: form.password,
        storeName: form.storeName.trim(),
        descriptionFr: form.descriptionFr.trim(),
        descriptionAr: form.descriptionAr.trim(),
      });
      if (next.step === 'done') afterSignIn('seller');
      else setStep(next);
    } catch (error) {
      setFailure(errorCode(error));
    } finally {
      setBusy(false);
    }
  }

  async function verify(code: string) {
    setBusy(true);
    setFailure(null);
    try {
      const next = await session.signIn(form.email.trim(), form.password, code);
      if (next.step === 'done') afterSignIn('seller');
    } catch (error) {
      setFailure(errorCode(error));
    } finally {
      setBusy(false);
    }
  }

  if (step && step.step !== 'done') {
    return (
      <Screen>
        <MfaStep step={step} busy={busy} failure={failure} onSubmit={(code) => void verify(code)} />
      </Screen>
    );
  }

  const complete =
    form.storeName.trim() &&
    form.email.trim() &&
    form.password &&
    form.descriptionFr.trim() &&
    form.descriptionAr.trim();
  return (
    <Screen>
      <Text style={text.body}>{t.register.intro}</Text>
      <Field
        label={t.register.store}
        value={form.storeName}
        onChangeText={set('storeName')}
        maxLength={160}
      />
      <Field
        label={t.login.email}
        value={form.email}
        onChangeText={set('email')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <Field
        label={t.login.password}
        hint={t.login.passwordHint}
        value={form.password}
        onChangeText={set('password')}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
      />
      <Field
        label={t.register.descFr}
        value={form.descriptionFr}
        onChangeText={set('descriptionFr')}
        multiline
        style={{ minHeight: 90, textAlignVertical: 'top', paddingTop: 12 }}
      />
      <Field
        label={t.register.descAr}
        value={form.descriptionAr}
        onChangeText={set('descriptionAr')}
        multiline
        style={{ minHeight: 90, textAlignVertical: 'top', paddingTop: 12 }}
      />
      {failure ? <Notice tone="error">{errorMessage(t, failure)}</Notice> : null}
      <Button
        label={t.register.submit}
        busy={busy}
        disabled={!complete}
        onPress={() => void register()}
      />
    </Screen>
  );
}
