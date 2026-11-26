import { useState } from 'react';
import { Text } from '@/components/text';
import { Button, Field, Notice, Screen, text } from '@/components/ui';
import { errorCode } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { errorMessage } from '@/lib/strings';

/** Customers and sellers change their password; the API signs out their other devices. */
export default function ChangePasswordScreen() {
  const { t } = useI18n();
  const session = useSession();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function change() {
    if (next !== confirm) return setFailure(t.changePassword.mismatch);
    if (next === current) return setFailure(t.changePassword.same);
    setBusy(true);
    setFailure(null);
    try {
      await session.request('/api/v1/auth/password/change', {
        body: { currentPassword: current, password: next },
      });
      setDone(true);
    } catch (error) {
      const code = errorCode(error);
      setFailure(
        code === 'INVALID_CREDENTIALS'
          ? t.changePassword.wrong
          : code === 'VALIDATION_FAILED'
            ? t.changePassword.weak
            : errorMessage(t, code),
      );
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <Screen>
        <Notice tone="success">{t.changePassword.done}</Notice>
      </Screen>
    );
  return (
    <Screen>
      <Text style={text.body}>{t.changePassword.intro}</Text>
      <Field
        label={t.changePassword.current}
        value={current}
        onChangeText={setCurrent}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        maxLength={128}
      />
      <Field
        label={t.changePassword.next}
        hint={t.login.passwordHint}
        value={next}
        onChangeText={setNext}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        maxLength={128}
      />
      <Field
        label={t.changePassword.confirm}
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        maxLength={128}
      />
      {failure ? <Notice tone="error">{failure}</Notice> : null}
      <Button
        label={t.changePassword.submit}
        busy={busy}
        disabled={!current || next.length < 10 || !confirm}
        onPress={() => void change()}
      />
    </Screen>
  );
}
