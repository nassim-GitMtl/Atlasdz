import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from '@/components/text';
import { Button, Card, Notice, text } from '@/components/ui';
import { errorCode } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { errorMessage } from '@/lib/strings';
import { useRequest } from '@/lib/use-request';

/** Sold out at every seller: a signed-in customer asks for one email when it is back. */
export function StockAlertCard({ slug }: { readonly slug: string }) {
  const { t } = useI18n();
  const session = useSession();
  const customer = session.status === 'signedIn' && session.actor === 'customer';
  const path = `/api/v1/stock-alerts/${encodeURIComponent(slug)}`;
  const status = useRequest(customer ? `stock-alert:${slug}` : null, () =>
    session.request<{ waiting: boolean }>(path),
  );
  const [waiting, setWaiting] = useState<boolean>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const current = waiting ?? status.data?.waiting ?? false;

  async function toggle() {
    setBusy(true);
    setFailure(null);
    try {
      await session.request(path, current ? { method: 'DELETE' } : { body: {} });
      setWaiting(!current);
    } catch (error) {
      setFailure(errorCode(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Text style={text.body}>{current ? t.stockAlert.waiting : t.stockAlert.soldOut}</Text>
      {failure ? (
        <Notice tone="error">
          {failure === 'PRODUCT_STATE_CONFLICT' ? t.stockAlert.backNow : errorMessage(t, failure)}
        </Notice>
      ) : null}
      {customer ? (
        <Button
          label={current ? t.stockAlert.stop : t.stockAlert.start}
          variant={current ? 'secondary' : 'primary'}
          busy={busy}
          onPress={() => void toggle()}
        />
      ) : (
        <Button
          label={t.stockAlert.signIn}
          variant="secondary"
          onPress={() => router.push('/login')}
        />
      )}
    </Card>
  );
}
