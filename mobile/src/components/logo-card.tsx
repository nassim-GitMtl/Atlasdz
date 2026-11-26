import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Photo } from '@/components/photo';
import { Text } from '@/components/text';
import { Button, Card, Notice, text } from '@/components/ui';
import { errorCode } from '@/lib/api';
import { imageUri } from '@/lib/config';
import { useI18n } from '@/lib/i18n';
import { photoBytes, pickPhoto } from '@/lib/photo';
import { useSession } from '@/lib/session';
import { errorMessage } from '@/lib/strings';
import { colors } from '@/lib/theme';

/** Store logo shown on the store page; chosen from the photo library (cropped square). */
export function LogoCard() {
  const { t } = useI18n();
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const logoUrl = session.seller?.logoUrl ?? null;

  async function run(work: () => Promise<boolean>) {
    setFailure(null);
    setSaved(false);
    try {
      if (!(await work())) return;
      await session.refreshAccount();
      setSaved(true);
    } catch (error) {
      setFailure(errorCode(error));
    } finally {
      setBusy(false);
    }
  }

  const choose = () =>
    run(async () => {
      const picked = await pickPhoto('library');
      if (picked === null || picked === 'denied') return false;
      setBusy(true);
      await session.request('/api/v1/seller/logo', {
        rawBody: await photoBytes(picked),
        contentType: 'image/jpeg',
        timeoutMs: 60_000,
      });
      return true;
    });
  const remove = () =>
    run(async () => {
      setBusy(true);
      await session.request('/api/v1/seller/logo/remove', { body: {} });
      return true;
    });

  return (
    <Card>
      <Text style={text.heading}>{t.logo.title}</Text>
      <Text style={text.muted}>{t.logo.hint}</Text>
      {logoUrl ? (
        <View style={styles.row}>
          <Photo uri={imageUri(logoUrl, 'small')} style={styles.logo} />
        </View>
      ) : null}
      {saved ? <Notice tone="success">{t.logo.saved}</Notice> : null}
      {failure ? <Notice tone="error">{errorMessage(t, failure)}</Notice> : null}
      <Button
        label={logoUrl ? t.logo.replace : t.logo.choose}
        variant="secondary"
        busy={busy}
        onPress={() => void choose()}
      />
      {logoUrl ? (
        <Button label={t.logo.remove} variant="secondary" disabled={busy} onPress={() => void remove()} />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  logo: { width: 72, height: 72, borderRadius: 14, borderWidth: 1, borderColor: colors.line },
});
