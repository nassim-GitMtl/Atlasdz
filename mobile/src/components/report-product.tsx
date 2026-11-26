import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { Button, Card, Field, Notice, text } from '@/components/ui';
import { errorCode } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { errorMessage } from '@/lib/strings';
import { colors } from '@/lib/theme';

const REASONS = ['COUNTERFEIT', 'PROHIBITED', 'MISLEADING', 'OFFENSIVE', 'OTHER'] as const;

/** A discreet way for a signed-in customer to tell the Atlas DZ team about a listing. */
export function ReportProduct({ slug }: { readonly slug: string }) {
  const { t } = useI18n();
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number] | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const customer = session.status === 'signedIn' && session.actor === 'customer';
  if (session.status === 'signedIn' && !customer) return null;

  async function send() {
    if (reason === null) return;
    setBusy(true);
    setFailure(null);
    try {
      const extra = details.trim();
      await session.request(`/api/v1/catalog/products/${encodeURIComponent(slug)}/reports`, {
        body: extra === '' ? { reason } : { reason, details: extra },
      });
      setSent(true);
    } catch (error) {
      setFailure(errorCode(error));
    } finally {
      setBusy(false);
    }
  }

  if (!open)
    return (
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={styles.link}>
        <Text style={[text.muted, styles.underline]}>{t.report.open}</Text>
      </Pressable>
    );
  if (!customer)
    return <Button label={t.report.signIn} variant="secondary" onPress={() => router.push('/login')} />;
  if (sent) return <Notice tone="success">{t.report.sent}</Notice>;
  return (
    <Card>
      <Text style={text.body}>{t.report.reason}</Text>
      <View style={styles.reasons} accessibilityRole="radiogroup">
        {REASONS.map((option) => (
          <Pressable
            key={option}
            accessibilityRole="radio"
            aria-checked={reason === option}
            accessibilityState={{ checked: reason === option }}
            onPress={() => setReason(option)}
            style={[styles.chip, reason === option && styles.chipActive]}
          >
            <Text style={[styles.chipText, reason === option && styles.chipTextActive]}>
              {t.report[option]}
            </Text>
          </Pressable>
        ))}
      </View>
      <Field
        label={t.report.details}
        hint={t.report.privacy}
        value={details}
        onChangeText={setDetails}
        multiline
        maxLength={500}
      />
      {failure ? <Notice tone="error">{errorMessage(t, failure)}</Notice> : null}
      <Button
        label={t.report.send}
        variant="secondary"
        busy={busy}
        disabled={reason === null}
        onPress={() => void send()}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  link: { minHeight: 44, justifyContent: 'center' },
  underline: { textDecorationLine: 'underline' },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.soft },
  chipText: { fontSize: 14, color: colors.ink },
  chipTextActive: { color: colors.primary, fontWeight: '700' },
});
