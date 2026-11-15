import { router, useLocalSearchParams } from 'expo-router';
import { Fragment, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Badge, Button, Card, LoadState, Notice, Screen, text } from '@/components/ui';
import { errorCode } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { fill, formatDate, formatMoney, localized } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { canReviewOrder } from '@/lib/reviews';
import { canCancel, canConfirmReceipt, statusTone } from '@/lib/order-status';
import { useSession } from '@/lib/session';
import { errorMessage } from '@/lib/strings';
import { colors } from '@/lib/theme';
import type { CustomerOrder, SellerOrder, SupportCase } from '@/lib/types';
import { useRequest } from '@/lib/use-request';
import { PreorderNote } from '@/components/preorder-note';

type Action = { readonly sellerOrderId: string; readonly kind: 'cancel' | 'confirm-delivery' };

export default function OrderScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { t, locale } = useI18n();
  const session = useSession();
  const cart = useCart();
  const order = useRequest(`order:${orderId}`, () =>
    session.request<CustomerOrder>(`/api/v1/orders/${encodeURIComponent(orderId)}`),
  );
  const cases = useRequest(`cases:${orderId}`, () =>
    session.request<{ items: SupportCase[] }>('/api/v1/support'),
  );
  // Destructive or binding actions ask once more, inside the screen.
  const [pending, setPending] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [reordered, setReordered] = useState(false);

  async function run(action: Action, sellerOrder: SellerOrder) {
    setBusy(true);
    setFailure(null);
    try {
      await session.request(`/api/v1/orders/seller-orders/${sellerOrder.id}/${action.kind}`, {
        body: { expectedVersion: sellerOrder.version },
      });
      setPending(null);
    } catch (error) {
      setFailure(errorCode(error));
    } finally {
      setBusy(false);
      await order.reload();
    }
  }

  async function reorder(data: CustomerOrder) {
    setBusy(true);
    setFailure(null);
    let added = 0;
    for (const item of data.sellerOrders.flatMap((sellerOrder) => sellerOrder.snapshot.items)) {
      try {
        // Signed in here: the account's cart, so the product slug is not needed.
        await cart.add(item.offerId, item.quantity, '');
        added += 1;
      } catch (error) {
        // Offers that are no longer sold are skipped; the rest still goes to the cart.
        if (errorCode(error) === 'NETWORK') {
          setFailure('NETWORK');
          break;
        }
      }
    }
    setBusy(false);
    setReordered(added > 0);
    if (added === 0) setFailure((current) => current ?? 'CART_OFFER_UNAVAILABLE');
  }

  const data = order.data;
  const caseFor = (sellerOrderId: string) =>
    cases.data?.items.find((item) => item.sellerOrderId === sellerOrderId);
  return (
    <Screen refreshing={order.loading && !!data} onRefresh={() => void order.reload()}>
      <LoadState
        loading={order.loading && !data}
        error={data ? undefined : order.error}
        onRetry={() => void order.reload()}
      />
      {failure ? <Notice tone="error">{errorMessage(t, failure)}</Notice> : null}
      {data ? (
        <>
          <Card>
            <Text style={text.heading}>
              {fill(t.orders.placedOn, { date: formatDate(data.quote.createdAt, locale, true) })}
            </Text>
            <View style={styles.row}>
              <Text style={[text.body, styles.grow]}>{t.order.total}</Text>
              <Text style={text.price}>{formatMoney(data.quote.totalMinor, locale)}</Text>
            </View>
            <Text style={text.muted}>
              {data.paymentState === 'CASH_ON_DELIVERY' ? t.order.cod : t.order.test}
            </Text>
            {reordered ? (
              <>
                <Notice tone="success">{t.order.reordered}</Notice>
                <Button
                  label={t.product.viewCart}
                  variant="secondary"
                  onPress={() => router.navigate('/cart')}
                />
              </>
            ) : (
              <Button
                label={t.order.reorder}
                variant="secondary"
                busy={busy && pending === null}
                onPress={() => void reorder(data)}
              />
            )}
          </Card>
          {data.sellerOrders.map((sellerOrder) => {
            const asking = pending?.sellerOrderId === sellerOrder.id ? pending : null;
            const supportCase = caseFor(sellerOrder.id);
            const history = [...sellerOrder.history].sort((a, b) => a.version - b.version);
            return (
              <Card key={sellerOrder.id}>
                <View style={styles.row}>
                  <Text style={[text.heading, styles.grow]}>{sellerOrder.snapshot.sellerName}</Text>
                  <Badge
                    label={t.status[sellerOrder.status]}
                    tone={statusTone(sellerOrder.status)}
                  />
                </View>
                {sellerOrder.snapshot.items.map((item) => (
                  <Fragment key={item.offerId}>
                    <View style={styles.row}>
                      <Text style={[text.body, styles.grow]}>
                        {localized(item.title, locale)} × {item.quantity}
                      </Text>
                      <Text style={text.body}>
                        {formatMoney(item.unitPriceMinor * item.quantity, locale)}
                      </Text>
                    </View>
                    {item.preorder ? (
                      <PreorderNote preorder={item.preorder} placedAt={sellerOrder.createdAt} />
                    ) : null}
                  </Fragment>
                ))}
                <View style={styles.row}>
                  <Text style={[text.muted, styles.grow]}>{t.order.shipping}</Text>
                  <Text style={text.muted}>
                    {formatMoney(sellerOrder.snapshot.shippingFeeMinor, locale)}
                  </Text>
                </View>
                {sellerOrder.shipment ? (
                  <Text style={text.muted}>
                    {fill(t.order.carrier, { carrier: sellerOrder.shipment.carrier })}
                    {'\n'}
                    {fill(t.order.tracking, { tracking: sellerOrder.shipment.trackingReference })}
                  </Text>
                ) : null}
                {history.length > 0 ? (
                  <View style={styles.timeline}>
                    <Text style={text.muted}>{t.order.timeline}</Text>
                    {history.map((entry, index) => (
                      <View key={entry.version} style={styles.step}>
                        <View
                          style={[styles.dot, index === history.length - 1 && styles.dotCurrent]}
                        />
                        <View style={styles.grow}>
                          <Text style={text.body}>{t.status[entry.status]}</Text>
                          <Text style={styles.stepMeta}>
                            {formatDate(entry.occurredAt, locale, true)} ·{' '}
                            {t.attribution[entry.attribution]}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}
                {asking ? (
                  <>
                    <Notice>
                      {asking.kind === 'cancel'
                        ? fill(t.order.cancelQuestion, { seller: sellerOrder.snapshot.sellerName })
                        : t.order.confirmReceiptQuestion}
                    </Notice>
                    <Button
                      label={t.common.confirm}
                      variant={asking.kind === 'cancel' ? 'danger' : 'primary'}
                      busy={busy}
                      onPress={() => void run(asking, sellerOrder)}
                    />
                    <Button
                      label={t.common.cancel}
                      variant="secondary"
                      onPress={() => setPending(null)}
                    />
                  </>
                ) : (
                  <>
                    {canConfirmReceipt(sellerOrder.status) ? (
                      <Button
                        label={t.order.confirmReceipt}
                        onPress={() =>
                          setPending({ sellerOrderId: sellerOrder.id, kind: 'confirm-delivery' })
                        }
                      />
                    ) : null}
                    {canCancel(sellerOrder.status) ? (
                      <Button
                        label={t.order.cancel}
                        variant="secondary"
                        onPress={() =>
                          setPending({ sellerOrderId: sellerOrder.id, kind: 'cancel' })
                        }
                      />
                    ) : null}
                    {canReviewOrder(sellerOrder.status) ? (
                      <Button
                        label={t.reviews.rateItems}
                        variant={canConfirmReceipt(sellerOrder.status) ? 'secondary' : 'primary'}
                        onPress={() => router.push(`/rate/${sellerOrder.id}`)}
                      />
                    ) : null}
                    <Button
                      label={supportCase ? t.order.viewCase : t.order.help}
                      variant="secondary"
                      onPress={() =>
                        supportCase
                          ? router.push(`/support/${supportCase.id}`)
                          : router.push(`/support/new?sellerOrderId=${sellerOrder.id}`)
                      }
                    />
                  </>
                )}
              </Card>
            );
          })}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1 },
  timeline: { gap: 8, paddingTop: 4 },
  step: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 6, backgroundColor: colors.line },
  dotCurrent: { backgroundColor: colors.olive },
  stepMeta: { fontSize: 13, color: colors.muted },
});
