import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { MfaStep } from '@/components/mfa-step';
import { Button, Field, Notice, Screen, text } from '@/components/ui';
import { errorCode } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useSession, type SignInStep } from '@/lib/session';
import { afterSignIn } from '@/lib/navigation';
import { errorMessage } from '@/lib/strings';
import { colors } from '@/lib/theme';
import type { SellerLegal } from '@/lib/types';

const KINDS = ['COMMERCE', 'ARTISAN', 'AUTO_ENTREPRENEUR'] as const;
/** Digits (and a leading +) of a number typed with spaces, dots or dashes. */
const digits = (value: string) => value.replace(/[\s.-]/g, '');

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
    legalName: '',
    registerNumber: '',
    taxId: '',
    address: '',
    phone: '',
    contactEmail: '',
  });
  const [registerKind, setRegisterKind] = useState<SellerLegal['registerKind']>('COMMERCE');
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
        legal: {
          legalName: form.legalName.trim(),
          registerKind,
          registerNumber: form.registerNumber.trim(),
          taxId: digits(form.taxId),
          address: form.address.trim(),
          phone: digits(form.phone),
          email: form.contactEmail.trim(),
        },
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
    Object.values(form).every((value) => value.trim().length > 0) &&
    /^[0-9]{15,20}$/.test(digits(form.taxId)) &&
    /^\+?[0-9]{9,15}$/.test(digits(form.phone));
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
      <Text style={text.heading}>{t.register.legalTitle}</Text>
      <Text style={text.muted}>{t.register.legalNote}</Text>
      <Field
        label={t.register.legalName}
        value={form.legalName}
        onChangeText={set('legalName')}
        maxLength={160}
      />
      <View style={styles.kinds} accessibilityRole="radiogroup">
        {KINDS.map((kind) => (
          <Pressable
            key={kind}
            accessibilityRole="radio"
            aria-checked={registerKind === kind}
            accessibilityState={{ checked: registerKind === kind }}
            onPress={() => setRegisterKind(kind)}
            style={[styles.kind, registerKind === kind && styles.kindActive]}
          >
            <Text style={[styles.kindText, registerKind === kind && styles.kindTextActive]}>
              {t.register[`kind${kind}`]}
            </Text>
          </Pressable>
        ))}
      </View>
      <Field
        label={t.register.registerNumber}
        value={form.registerNumber}
        onChangeText={set('registerNumber')}
        autoCapitalize="characters"
        maxLength={40}
      />
      <Field
        label={t.register.taxId}
        value={form.taxId}
        onChangeText={set('taxId')}
        keyboardType="number-pad"
        maxLength={30}
      />
      <Field
        label={t.register.address}
        value={form.address}
        onChangeText={set('address')}
        maxLength={240}
      />
      <Field
        label={t.register.phone}
        value={form.phone}
        onChangeText={set('phone')}
        keyboardType="phone-pad"
        autoComplete="tel"
        maxLength={20}
      />
      <Field
        label={t.register.contactEmail}
        value={form.contactEmail}
        onChangeText={set('contactEmail')}
        keyboardType="email-address"
        autoCapitalize="none"
        maxLength={254}
      />
      {failure ? (
        <Notice tone="error">
          {failure === 'VALIDATION_FAILED' ? t.register.legalInvalid : errorMessage(t, failure)}
        </Notice>
      ) : null}
      <Button
        label={t.register.submit}
        busy={busy}
        disabled={!complete}
        onPress={() => void register()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kind: {
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  kindActive: { borderColor: colors.primary, backgroundColor: colors.soft },
  kindText: { fontSize: 14, color: colors.ink },
  kindTextActive: { color: colors.primary, fontWeight: '700' },
});
