import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { Badge, Button, Card, Field, LoadState, Notice, Screen, text } from '@/components/ui';
import { errorCode } from '@/lib/api';
import { dinarsText, parseDinars } from '@/lib/collections';
import { localized } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { errorMessage } from '@/lib/strings';
import type { CatalogEntry, SellerOffer } from '@/lib/types';
import { useRequest } from '@/lib/use-request';

/** Creates an offer on a catalogue product (`/seller/offer/new?productId=`) or edits one. */
export default function OfferScreen() {
  const { id, productId } = useLocalSearchParams<{ id: string; productId?: string }>();
  const { t, locale } = useI18n();
  const session = useSession();
  const isNew = id === 'new';
  const offer = useRequest(isNew ? null : `offer:${id}`, () =>
    session.request<SellerOffer>(`/api/v1/seller/offers/${encodeURIComponent(id)}`),
  );
  const catalog = useRequest('catalog-entries', () =>
    session.request<{ items: CatalogEntry[] }>('/api/v1/seller/products/catalog'),
  );
  const product = catalog.data?.items.find(
    (item) => item.id === (offer.data?.productId ?? productId),
  );

  return (
    <Screen>
      <Stack.Screen options={{ title: isNew ? t.catalog.newOffer : t.catalog.offers }} />
      <LoadState
        loading={(!isNew && offer.loading && !offer.data) || (catalog.loading && !catalog.data)}
        error={offer.data || isNew ? undefined : offer.error}
        onRetry={() => void offer.reload()}
      />
      {product ? <Text style={text.title}>{localized(product.title, locale)}</Text> : null}
      {offer.data ? (
        <Badge
          label={offer.data.status === 'APPROVED' ? t.catalog.online : t.catalog[offer.data.status]}
          tone={
            offer.data.status === 'APPROVED'
              ? 'good'
              : offer.data.status === 'PENDING_REVIEW'
                ? 'wait'
                : 'bad'
          }
        />
      ) : null}
      {isNew || offer.data ? (
        // Keyed so the form starts from the loaded offer (or empty for a new one).
        <OfferForm
          key={offer.data ? `${offer.data.id}-${offer.data.rowVersion}` : 'new'}
          offer={offer.data ?? null}
          productId={offer.data?.productId ?? productId ?? ''}
          onSaved={(saved) => {
            if (isNew) router.replace(`/seller/offer/${saved.id}`);
            else void offer.reload();
          }}
        />
      ) : null}
    </Screen>
  );
}

function OfferForm({
  offer,
  productId,
  onSaved,
}: {
  readonly offer: SellerOffer | null;
  readonly productId: string;
  readonly onSaved: (offer: SellerOffer) => void;
}) {
  const { t } = useI18n();
  const session = useSession();
  const [price, setPrice] = useState(offer ? dinarsText(offer.priceMinor) : '');
  const [stock, setStock] = useState(offer ? String(offer.availableQuantity) : '');
  const [handling, setHandling] = useState(offer ? String(offer.handlingDays) : '2');
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const priceMinor = parseDinars(price);
  const quantity = /^\d{1,7}$/.test(stock.trim()) ? Number(stock.trim()) : null;
  const days =
    /^\d{1,2}$/.test(handling.trim()) && Number(handling.trim()) <= 30
      ? Number(handling.trim())
      : null;
  const valid = priceMinor !== null && priceMinor > 0 && quantity !== null && days !== null;

  async function save() {
    setShowErrors(true);
    if (!valid) return;
    setBusy(true);
    setFailure(null);
    setSaved(false);
    try {
      const result = offer
        ? await session.request<SellerOffer>(`/api/v1/seller/offers/${offer.id}`, {
            body: {
              priceMinor,
              availableQuantity: quantity,
              handlingDays: days,
              expectedVersion: offer.rowVersion,
            },
          })
        : await session.request<SellerOffer>('/api/v1/seller/offers', {
            body: {
              productId,
              priceMinor,
              availableQuantity: quantity,
              handlingDays: days,
              // Delivery is charged from the seller's delivery zones, not per offer.
              deliveryFeeMinor: 0,
            },
          });
      setSaved(true);
      onSaved(result);
    } catch (error) {
      setFailure(errorCode(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Field
        label={t.catalog.price}
        value={price}
        onChangeText={setPrice}
        keyboardType="decimal-pad"
        error={showErrors && (priceMinor === null || priceMinor <= 0)}
      />
      <Field
        label={t.catalog.stock}
        value={stock}
        onChangeText={setStock}
        keyboardType="number-pad"
        error={showErrors && quantity === null}
      />
      <Field
        label={t.catalog.handling}
        value={handling}
        onChangeText={setHandling}
        keyboardType="number-pad"
        error={showErrors && days === null}
      />
      {!offer ? <Text style={text.muted}>{t.catalog.offerNote}</Text> : null}
      {showErrors && !valid ? <Notice tone="error">{t.catalog.invalid}</Notice> : null}
      {failure ? <Notice tone="error">{errorMessage(t, failure)}</Notice> : null}
      {saved ? <Notice tone="success">{t.common.saved}</Notice> : null}
      <Button label={t.catalog.saveOffer} busy={busy} onPress={() => void save()} />
    </Card>
  );
}
