import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RatingLine } from '@/components/reviews';
import { SalesChart } from '@/components/sales-chart';
import { Badge, Card, ListRow, Notice, Screen, text } from '@/components/ui';
import { sellerSummary } from '@/lib/collections';
import { fill, formatMoney, localized } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { dailySales, lowStock } from '@/lib/seller-tools';
import { useSession } from '@/lib/session';
import { colors, radius } from '@/lib/theme';
import type {
  CatalogEntry,
  ProductSubmission,
  SellerOffer,
  SellerOrder,
  SellerReviewPage,
} from '@/lib/types';
import { useRequest } from '@/lib/use-request';

export default function DashboardScreen() {
  const { t, locale } = useI18n();
  const session = useSession();
  const orders = useRequest('seller-orders', () =>
    session.request<{ items: SellerOrder[] }>('/api/v1/seller/orders'),
  );
  const products = useRequest('seller-products', () =>
    session.request<{ items: ProductSubmission[] }>('/api/v1/seller/products'),
  );
  const offers = useRequest('seller-offers', () =>
    session.request<{ items: SellerOffer[] }>('/api/v1/seller/offers'),
  );
  const entries = useRequest('catalog-entries', () =>
    session.request<{ items: CatalogEntry[] }>('/api/v1/seller/products/catalog'),
  );
  const reviews = useRequest('seller-reviews', () =>
    session.request<SellerReviewPage>('/api/v1/seller/reviews'),
  );
  const { refreshAccount } = session;
  const reloadOrders = orders.reload;
  const reloadProducts = products.reload;
  const reloadOffers = offers.reload;
  const reloadReviews = reviews.reload;
  const reload = useCallback(() => {
    void refreshAccount();
    void reloadOrders();
    void reloadProducts();
    void reloadOffers();
    void reloadReviews();
  }, [refreshAccount, reloadOrders, reloadProducts, reloadOffers, reloadReviews]);
  useFocusEffect(reload);

  const summary = sellerSummary(orders.data?.items ?? []);
  const running = lowStock(offers.data?.items ?? []).slice(0, 5);
  const titleOf = (productId: string) => {
    const entry = entries.data?.items.find((item) => item.id === productId);
    return entry ? localized(entry.title, locale) : '—';
  };
  const status = session.seller?.status;
  const tiles: [string, number][] = [
    [t.seller.toAccept, summary.toAccept],
    [t.seller.toPrepare, summary.toPrepare],
    [t.seller.toShip, summary.toShip],
    [t.seller.inDelivery, summary.inDelivery],
  ];

  return (
    <Screen refreshing={orders.loading && !!orders.data} onRefresh={reload}>
      {status ? (
        <Card>
          <Badge
            label={t.seller[status]}
            tone={status === 'APPROVED' ? 'good' : status === 'PENDING_REVIEW' ? 'wait' : 'bad'}
          />
          {status === 'PENDING_REVIEW' ? (
            <Text style={text.muted}>{t.seller.pendingNote}</Text>
          ) : null}
          {status === 'SUSPENDED' || status === 'REJECTED' ? (
            <Notice tone="error">{t.seller.suspendedNote}</Notice>
          ) : null}
        </Card>
      ) : null}
      <View style={styles.grid}>
        {tiles.map(([label, value]) => (
          <Pressable
            key={label}
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${value}`}
            onPress={() => router.navigate('/seller-orders')}
            style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.value}>{value}</Text>
            <Text style={styles.label}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <Card>
        <Text style={text.muted}>{t.seller.revenue}</Text>
        <Text style={text.title}>{formatMoney(summary.deliveredMinor, locale)}</Text>
        <Text style={text.muted}>
          {t.catalog.products} : {products.data?.items.length ?? '—'} · {t.catalog.offers} :{' '}
          {offers.data?.items.length ?? '—'}
        </Text>
      </Card>
      {orders.data ? (
        <Card>
          <SalesChart days={dailySales(orders.data.items, new Date())} />
        </Card>
      ) : null}
      {running.length > 0 ? (
        <Card>
          <Badge label={t.seller.lowStock} tone="wait" />
          {running.map((offer) => (
            <ListRow
              key={offer.id}
              icon="alert-circle-outline"
              label={fill(t.seller.lowStockItem, {
                title: titleOf(offer.productId),
                n: offer.availableQuantity,
              })}
              onPress={() => router.push(`/seller/offer/${offer.id}`)}
            />
          ))}
        </Card>
      ) : null}
      <Card>
        <Text style={text.muted}>{t.reviews.average}</Text>
        {reviews.data && reviews.data.summary.count > 0 ? (
          <RatingLine summary={reviews.data.summary} />
        ) : (
          <Text style={text.muted}>{t.reviews.sellerNone}</Text>
        )}
        <ListRow
          icon="star-outline"
          label={t.reviews.title}
          onPress={() => router.push('/seller/reviews')}
        />
      </Card>
      <Card>
        <ListRow
          icon="add-circle-outline"
          label={t.seller.addProduct}
          onPress={() => router.push('/seller/product/new')}
        />
        <ListRow
          icon="car-outline"
          label={t.seller.delivery}
          onPress={() => router.push('/seller/delivery')}
        />
        <ListRow
          icon="notifications-outline"
          label={t.account.notifications}
          onPress={() => router.push('/notifications')}
        />
        <ListRow
          icon="chatbubbles-outline"
          label={t.account.help}
          onPress={() => router.push('/support')}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 4,
  },
  value: { fontSize: 30, fontWeight: '800', color: colors.olive },
  label: { fontSize: 14, color: colors.muted, fontWeight: '600' },
});
