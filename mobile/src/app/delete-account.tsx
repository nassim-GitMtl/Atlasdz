import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { Button, Field, Notice, Screen, text } from '@/components/ui';
import { errorCode } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { errorMessage } from '@/lib/strings';

export default function DeleteAccountScreen() {
  const { t } = useI18n();
  const session = useSession();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setFailure(null);
    try {
      await session.request('/api/v1/account/delete', { body: { password } });
      await session.signOut();
      router.dismissAll();
      router.navigate('/');
    } catch (error) {
      setFailure(errorCode(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Text style={text.body}>{t.deleteAccount.intro}</Text>
      <Field
        label={t.deleteAccount.password}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
      />
      {failure ? <Notice tone="error">{errorMessage(t, failure)}</Notice> : null}
      <Button
        label={t.deleteAccount.submit}
        variant="danger"
        busy={busy}
        disabled={!password}
        onPress={() => void remove()}
      />
    </Screen>
  );
}
