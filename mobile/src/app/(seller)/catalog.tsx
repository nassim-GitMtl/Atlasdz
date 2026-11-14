import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Photo } from '@/components/photo';
import { Badge, Button, Card, Empty, LoadState, Screen, Segmented, text } from '@/components/ui';
import { imageUri } from '@/lib/config';
import { formatMoney, localized } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { colors, radius } from '@/lib/theme';
import type { CatalogEntry, ProductSubmission, SellerOffer } from '@/lib/types';
import { useRequest } from '@/lib/use-request';

type CatalogView = 'products' | 'offers';

export default function SellerCatalogScreen() {
  const { t, locale } = useI18n();
  const session = useSession();
  const [view, setView] = useState<CatalogView>('products');
  const [choosing, setChoosing] = useState(false);
  const submissions = useRequest('catalog-submissions', () =>
    session.request<{ items: ProductSubmission[] }>('/api/v1/seller/products'),
  );
  const offers = useRequest('catalog-offers', () =>
    session.request<{ items: SellerOffer[] }>('/api/v1/seller/offers'),
  );
  // Approved catalogue products: any seller may sell them (one shared product page).
  const catalog = useRequest('catalog-entries', () =>
    session.request<{ items: CatalogEntry[] }>('/api/v1/seller/products/catalog'),
  );
  const reloadSubmissions = submissions.reload;
  const reloadOffers = offers.reload;
  const reloadCatalog = catalog.reload;
  const reload = useCallback(() => {
    void reloadSubmissions();
    void reloadOffers();
    void reloadCatalog();
  }, [reloadSubmissions, reloadOffers, reloadCatalog]);
  useFocusEffect(reload);

  const entry = (productId: string) => catalog.data?.items.find((item) => item.id === productId);
  const current = view === 'products' ? submissions : offers;

  return (
    <Screen refreshing={current.loading && !!current.data} onRefresh={reload}>
      <Segmented<CatalogView>
        options={[
          ['products', t.catalog.products],
          ['offers', t.catalog.offers],
        ]}
        value={view}
        onChange={setView}
      />
      <LoadState
        loading={current.loading && !current.data}
        error={current.data ? undefined : current.error}
        onRetry={reload}
      />
      {view === 'products' ? (
        <>
          <Button label={t.catalog.newProduct} onPress={() => router.push('/seller/product/new')} />
          {submissions.data && submissions.data.items.length === 0 ? (
            <Empty icon="cube-outline" text={t.catalog.productsEmpty} />
          ) : null}
          {submissions.data?.items.map((submission) => {
            const image = submission.productId ? entry(submission.productId)?.imageUrl : undefined;
            return (
              <Pressable
                key={submission.id}
                accessibilityRole="link"
                onPress={() => router.push(`/seller/product/${submission.id}`)}
                style={({ pressed }) => pressed && { opacity: 0.85 }}
              >
                <Card>
                  <View style={styles.row}>
                    {image ? <Photo uri={imageUri(image, 'small')} style={styles.thumb} /> : null}
                    <View style={styles.grow}>
                      <Text style={text.heading} numberOfLines={2}>
                        {localized(submission.title, locale)}
                      </Text>
                      <Text style={text.muted}>{localized(submission.category.title, locale)}</Text>
                      <Badge
                        label={t.catalog[submission.status]}
                        tone={
                          submission.status === 'APPROVED'
                            ? 'good'
                            : submission.status === 'REJECTED'
                              ? 'bad'
                              : 'wait'
                        }
                      />
                    </View>
                  </View>
                </Card>
              </Pressable>
            );
          })}
        </>
      ) : (
        <>
          <Button
            label={t.catalog.newOffer}
            variant={choosing ? 'secondary' : 'primary'}
            onPress={() => setChoosing(!choosing)}
          />
          {choosing ? (
            <Card>
              <Text style={text.heading}>{t.catalog.chooseProduct}</Text>
              {catalog.data?.items.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  onPress={() => {
                    setChoosing(false);
                    router.push(`/seller/offer/new?productId=${item.id}`);
                  }}
                  style={({ pressed }) => [
                    styles.choice,
                    pressed && { backgroundColor: colors.soft },
                  ]}
                >
                  <Photo uri={imageUri(item.imageUrl, 'small')} style={styles.thumbSmall} />
                  <Text style={[text.body, styles.grow]} numberOfLines={2}>
                    {localized(item.title, locale)}
                  </Text>
                </Pressable>
              ))}
            </Card>
          ) : null}
          {offers.data && offers.data.items.length === 0 ? (
            <Empty icon="pricetags-outline" text={t.catalog.offersEmpty} />
          ) : null}
          {offers.data?.items.map((offer) => {
            const product = entry(offer.productId);
            return (
              <Pressable
                key={offer.id}
                accessibilityRole="link"
                onPress={() => router.push(`/seller/offer/${offer.id}`)}
                style={({ pressed }) => pressed && { opacity: 0.85 }}
              >
                <Card>
                  <View style={styles.row}>
                    {product ? (
                      <Photo uri={imageUri(product.imageUrl, 'small')} style={styles.thumb} />
                    ) : null}
                    <View style={styles.grow}>
                      <Text style={text.heading} numberOfLines={2}>
                        {product ? localized(product.title, locale) : '—'}
                      </Text>
                      <Text style={text.price}>{formatMoney(offer.priceMinor, locale)}</Text>
                      <Text style={text.muted}>
                        {t.catalog.stock} : {offer.availableQuantity}
                      </Text>
                      <Badge
                        label={
                          offer.status === 'APPROVED' ? t.catalog.online : t.catalog[offer.status]
                        }
                        tone={
                          offer.status === 'APPROVED'
                            ? 'good'
                            : offer.status === 'PENDING_REVIEW'
                              ? 'wait'
                              : 'bad'
                        }
                      />
                    </View>
                  </View>
                </Card>
              </Pressable>
            );
          })}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  grow: { flex: 1, gap: 4 },
  thumb: { width: 72, height: 72, borderRadius: radius, backgroundColor: colors.soft },
  thumbSmall: { width: 48, height: 48, borderRadius: 8, backgroundColor: colors.soft },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingVertical: 4,
  },
});
