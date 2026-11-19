import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { Button, Card, Field, LoadState, Notice, Screen, text } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { fill, localized } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { dinarsText, parseDinars, parseStock } from '@/lib/quick-edit';
import { useSession } from '@/lib/session';
import { errorMessage } from '@/lib/strings';
import type { CatalogEntry, SellerOffer } from '@/lib/types';
import { useRequest } from '@/lib/use-request';

type Problem = 'invalid' | 'conflict' | 'unavailable';

/** Price and stock of many offers on one screen; only changed rows are saved. */
export default function QuickUpdateScreen() {
  const { t, locale } = useI18n();
  const session = useSession();
  const offers = useRequest('quick-offers', () =>
    session.request<{ items: SellerOffer[] }>('/api/v1/seller/offers'),
  );
  const catalog = useRequest('catalog-entries', () =>
    session.request<{ items: CatalogEntry[] }>('/api/v1/seller/products/catalog'),
  );
  // Live and pending offers; refused or suspended ones are corrected from their own screen.
  const editable = (offers.data?.items ?? []).filter(
    (offer) => offer.status === 'APPROVED' || offer.status === 'PENDING_REVIEW',
  );
  const [edits, setEdits] = useState<Record<string, { price?: string; stock?: string }>>({});
  const [problems, setProblems] = useState<Record<string, Problem>>({});
  const [summary, setSummary] = useState<{ saved: number; failed: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const title = (productId: string) => {
    const entry = catalog.data?.items.find((item) => item.id === productId);
    return entry ? localized(entry.title, locale) : '—';
  };
  const edit = (id: string, key: 'price' | 'stock', value: string) =>
    setEdits((current) => ({ ...current, [id]: { ...current[id], [key]: value } }));

  async function save() {
    setBusy(true);
    setSummary(null);
    const found: Record<string, Problem> = {};
    let saved = 0;
    for (const offer of editable) {
      const change = edits[offer.id];
      if (!change) continue;
      const priceText = change.price ?? dinarsText(offer.priceMinor);
      const stockText = change.stock ?? String(offer.availableQuantity);
      if (
        priceText === dinarsText(offer.priceMinor) &&
        stockText === String(offer.availableQuantity)
      )
        continue;
      const priceMinor = parseDinars(priceText);
      const availableQuantity = parseStock(stockText);
      if (priceMinor === undefined || availableQuantity === undefined) {
        found[offer.id] = 'invalid';
        continue;
      }
      try {
        // The version loaded on this screen must still be current (no silent overwrite).
        const current = await session.request<SellerOffer>(`/api/v1/seller/offers/${offer.id}`);
        if (current.rowVersion !== offer.rowVersion) {
          found[offer.id] = 'conflict';
          continue;
        }
        await session.request(`/api/v1/seller/offers/${offer.id}`, {
          body: {
            priceMinor,
            availableQuantity,
            handlingDays: current.handlingDays,
            preorder: current.preorder ?? null,
            expectedVersion: offer.rowVersion,
          },
        });
        saved += 1;
      } catch (error) {
        found[offer.id] =
          error instanceof ApiError && error.status === 409
            ? 'conflict'
            : error instanceof ApiError && (error.status === 400 || error.status === 422)
              ? 'invalid'
              : 'unavailable';
      }
    }
    setProblems(found);
    setSummary({ saved, failed: Object.keys(found).length });
    if (saved > 0) {
      // Saved rows now show the server's values; failed ones keep what was typed.
      setEdits((current) =>
        Object.fromEntries(Object.entries(current).filter(([id]) => found[id] !== undefined)),
      );
      await offers.reload();
    }
    setBusy(false);
  }

  return (
    <Screen refreshing={offers.loading && !!offers.data} onRefresh={() => void offers.reload()}>
      <Text style={text.muted}>{t.catalog.quickNote}</Text>
      <LoadState
        loading={offers.loading && !offers.data}
        error={offers.data ? undefined : offers.error}
        onRetry={() => void offers.reload()}
      />
      {editable.map((offer) => {
        const problem = problems[offer.id];
        return (
          <Card key={offer.id}>
            <Text style={text.heading} numberOfLines={2}>
              {title(offer.productId)}
            </Text>
            {problem ? (
              <Notice tone="error">
                {problem === 'invalid'
                  ? t.catalog.quickInvalid
                  : problem === 'conflict'
                    ? t.catalog.quickConflict
                    : errorMessage(t, 'SERVICE_UNAVAILABLE')}
              </Notice>
            ) : null}
            <View style={styles.row}>
              <View style={styles.cell}>
                <Field
                  label={t.catalog.priceDa}
                  value={edits[offer.id]?.price ?? dinarsText(offer.priceMinor)}
                  onChangeText={(value) => edit(offer.id, 'price', value)}
                  keyboardType="decimal-pad"
                  maxLength={14}
                />
              </View>
              <View style={styles.cell}>
                <Field
                  label={t.catalog.stock}
                  value={edits[offer.id]?.stock ?? String(offer.availableQuantity)}
                  onChangeText={(value) => edit(offer.id, 'stock', value)}
                  keyboardType="number-pad"
                  maxLength={7}
                />
              </View>
            </View>
          </Card>
        );
      })}
      {summary ? (
        <Notice tone={summary.failed ? 'error' : 'success'}>
          {fill(t.catalog.quickSaved, { n: summary.saved })}
          {summary.failed ? ` · ${fill(t.catalog.quickFailed, { n: summary.failed })}` : ''}
        </Notice>
      ) : null}
      {editable.length > 0 ? (
        <Button label={t.catalog.quickSave} busy={busy} onPress={() => void save()} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  cell: { flex: 1 },
});
