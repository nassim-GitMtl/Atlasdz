import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { Button, Card, Notice, text } from '@/components/ui';
import { errorCode } from '@/lib/api';
import { fill, formatDate } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { errorMessage } from '@/lib/strings';
import type { SellerAccount } from '@/lib/types';
import { useRequest } from '@/lib/use-request';

const PRESETS = [3, 7, 14, 30] as const;

/** End of the day `days` from today, Algiers time (UTC+1), as an ISO timestamp. */
function endOfDayIn(days: number): string {
  const day = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  return new Date(`${day}T23:59:00+01:00`).toISOString();
}

/** Holiday mode: every offer hidden until a date, back on its own afterwards. */
export function HolidayCard() {
  const { t, locale } = useI18n();
  const session = useSession();
  const account = useRequest('seller-account-holiday', () =>
    session.request<SellerAccount>('/api/v1/seller/account'),
  );
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const until = account.data?.holidayUntil ?? null;

  async function set(days: number | null) {
    setBusy(true);
    setFailure(null);
    try {
      const end = days === null ? null : endOfDayIn(days);
      await session.request('/api/v1/seller/account/holiday', { body: { until: end } });
      await account.reload();
    } catch (error) {
      setFailure(errorCode(error));
    } finally {
      setBusy(false);
    }
  }

  if (account.data?.status !== 'APPROVED') return null;
  return (
    <Card>
      <Text style={text.heading}>{t.seller.holidayTitle}</Text>
      {failure ? <Notice tone="error">{errorMessage(t, failure)}</Notice> : null}
      {until ? (
        <>
          <Notice tone="info">
            {fill(t.seller.holidayOn, { date: formatDate(until, locale) })}
          </Notice>
          <Button label={t.seller.holidayReopen} busy={busy} onPress={() => void set(null)} />
        </>
      ) : (
        <>
          <Text style={text.muted}>{t.seller.holidayNote}</Text>
          <View style={styles.presets}>
            {PRESETS.map((days) => (
              <View key={days} style={styles.preset}>
                <Button
                  label={fill(t.seller.holidayDays, { n: days })}
                  variant="secondary"
                  disabled={busy}
                  onPress={() => void set(days)}
                />
              </View>
            ))}
          </View>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: { flexGrow: 1, flexBasis: '45%' },
});
