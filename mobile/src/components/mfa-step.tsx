import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { Button, Field, Notice, text } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import type { SignInStep } from '@/lib/session';
import { errorMessage } from '@/lib/strings';
import { colors, radius } from '@/lib/theme';

/**
 * Seller sign-in second step: the authenticator code, or on first sign-in the setup key (and a
 * link that opens the authenticator app on the phone with the key filled in).
 */
export function MfaStep({
  step,
  busy,
  failure,
  onSubmit,
}: {
  readonly step: Exclude<SignInStep, { step: 'done' }>;
  readonly busy: boolean;
  readonly failure: string | null;
  readonly onSubmit: (code: string) => void;
}) {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  return (
    <View style={styles.box}>
      {step.step === 'enroll' ? (
        <>
          <Text style={text.body}>{t.login.enrollIntro}</Text>
          <Text style={text.muted}>{t.login.enrollKey}</Text>
          <Text selectable style={styles.key} accessibilityLabel={t.login.enrollKey}>
            {step.secret}
          </Text>
          <Button
            label={t.login.openAuthenticator}
            variant="secondary"
            onPress={() => void Linking.openURL(step.otpauthUri).catch(() => undefined)}
          />
        </>
      ) : (
        <Text style={text.body}>{t.login.codeIntro}</Text>
      )}
      <Field
        label={t.login.code}
        value={code}
        onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
      />
      {failure ? <Notice tone="error">{errorMessage(t, failure)}</Notice> : null}
      <Button
        label={t.login.verify}
        busy={busy}
        disabled={code.length !== 6}
        onPress={() => onSubmit(code)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 16 },
  key: {
    fontFamily: 'monospace',
    fontSize: 18,
    letterSpacing: 2,
    color: colors.ink,
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    textAlign: 'center',
  },
});
