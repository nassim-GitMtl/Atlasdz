import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from '@/components/text';

import { Button, Field, LoadState, Notice, Screen, text } from '@/components/ui';
import { errorCode } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { errorMessage } from '@/lib/strings';
import type { PhoneStatus } from '@/lib/types';
import { useRequest } from '@/lib/use-request';

export default function PhoneScreen() {
  const { t, locale } = useI18n();
  const session = useSession();
  const status = useRequest('phone-status', () =>
    session.request<PhoneStatus>('/api/v1/account/phone'),
  );
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setFailure(null);
    try {
      await session.request('/api/v1/account/phone/start', { body: { phone, locale } });
      setSent(true);
    } catch (error) {
      setFailure(errorCode(error));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    setFailure(null);
    try {
      await session.request('/api/v1/account/phone/confirm', { body: { phone, code } });
      router.back();
    } catch (error) {
      setFailure(errorCode(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <LoadState
        loading={status.loading && !status.data}
        error={status.data ? undefined : status.error}
        onRetry={() => void status.reload()}
      />
      {status.data && !status.data.required ? <Notice>{t.phone.unavailable}</Notice> : null}
      {status.data?.verified ? <Notice tone="success">{t.phone.done}</Notice> : null}
      {status.data?.required ? (
        <>
          <Text style={text.body}>{t.phone.intro}</Text>
          <Field
            label={t.phone.number}
            hint={t.checkout.phoneHint}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
            editable={!sent}
          />
          {sent ? (
            <Field
              label={t.phone.code}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={6}
            />
          ) : null}
          {failure ? <Notice tone="error">{errorMessage(t, failure)}</Notice> : null}
          {sent ? (
            <Button
              label={t.phone.confirm}
              busy={busy}
              disabled={code.length !== 6}
              onPress={() => void confirm()}
            />
          ) : (
            <Button
              label={t.phone.send}
              busy={busy}
              disabled={phone.trim().length < 8}
              onPress={() => void send()}
            />
          )}
        </>
      ) : null}
    </Screen>
  );
}
