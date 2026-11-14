import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Share, StyleSheet, Text, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  Field,
  LoadState,
  Notice,
  Screen,
  Segmented,
  text,
} from '@/components/ui';
import { errorCode } from '@/lib/api';
import {
  canReject,
  canReportFailure,
  nextSellerAction,
  type SellerAction,
} from '@/lib/collections';
import { fill, formatDate, formatMoney, localized } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { statusTone } from '@/lib/order-status';
import { deliverySlip } from '@/lib/seller-tools';
import { useSession } from '@/lib/session';
import { errorMessage } from '@/lib/strings';
import { colors } from '@/lib/theme';
import type { CustomerSignal, SellerOrder } from '@/lib/types';
import { useRequest } from '@/lib/use-request';

type Reason = 'OUT_OF_STOCK' | 'DELIVERY_UNAVAILABLE' | 'UNABLE_TO_FULFILL';
type Pending = SellerAction | 'REPORT_DELIVERY_FAILED' | 'REJECT';
const TRACKING = /^[A-Za-z0-9_-]{3,80}$/;

export default function SellerOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useI18n();
  const session = useSession();
  const order = useRequest(`seller-order:${id}`, () =>
    session.request<SellerOrder>(`/api/v1/seller/orders/${encodeURIComponent(id)}`),
  );
  const signal = useRequest(`signal:${id}`, () =>
    session.request<CustomerSignal>(
      `/api/v1/seller/orders/${encodeURIComponent(id)}/customer-signal`,
    ),
  );
  const [pending, setPending] = useState<Pending | null>(null);
  const [carrier, setCarrier] = useState('');
  const [tracking, setTracking] = useState('');
  const [reason, setReason] = useState<Reason>('OUT_OF_STOCK');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function confirm(data: SellerOrder, action: Pending) {
    setBusy(true);
    setFailure(null);
    try {
      if (action === 'REJECT') {
        await session.request(`/api/v1/seller/orders/${data.id}/reject`, {
          body: { expectedVersion: data.version, reasonCode: reason },
        });
      } else {
        await session.request(`/api/v1/seller/orders/${data.id}/transition`, {
          body: {
            action,
            expectedVersion: data.version,
            ...(action === 'SHIP'
              ? {
                  shipment: {
                    // Live orders use the real method; local test orders the test one.
                    method: data.dataClass === 'live' ? 'SELLER_ARRANGED' : 'SELLER_ARRANGED_TEST',
                    carrier: carrier.trim(),
                    trackingReference: tracking.trim(),
                  },
                }
              : {}),
          },
        });
      }
      setPending(null);
    } catch (error) {
      setFailure(errorCode(error));
    } finally {
      setBusy(false);
      await order.reload();
    }
  }

  const data = order.data;
  const next = data ? nextSellerAction(data.status) : null;
  const contact = data?.deliveryContact;
  const destination = data?.snapshot.deliveryRate?.destination;
  const shipReady = carrier.trim().length >= 2 && TRACKING.test(tracking.trim());

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
            <View style={styles.row}>
              <Text style={[text.heading, styles.grow]}>
                {formatDate(data.createdAt, locale, true)}
              </Text>
              <Badge label={t.status[data.status]} tone={statusTone(data.status)} />
            </View>
            {data.status === 'AWAITING_SELLER' ? (
              <Text style={text.muted}>
                {fill(t.seller.deadline, {
                  date: formatDate(data.acceptanceDeadline, locale, true),
                })}
              </Text>
            ) : null}
            {data.snapshot.items.map((item) => (
              <View key={item.offerId} style={styles.row}>
                <Text style={[text.body, styles.grow]}>
                  {localized(item.title, locale)} × {item.quantity}
                </Text>
                <Text style={text.body}>
                  {formatMoney(item.unitPriceMinor * item.quantity, locale)}
                </Text>
              </View>
            ))}
            <View style={styles.row}>
              <Text style={[text.muted, styles.grow]}>{t.order.shipping}</Text>
              <Text style={text.muted}>{formatMoney(data.snapshot.shippingFeeMinor, locale)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={[text.heading, styles.grow]}>{t.order.total}</Text>
              <Text style={text.price}>{formatMoney(data.snapshot.totalMinor, locale)}</Text>
            </View>
            <Text style={text.muted}>
              {data.paymentState === 'CASH_ON_DELIVERY' ? t.order.cod : t.order.test}
            </Text>
            {contact ? (
              <Button
                label={t.slip.share}
                variant="secondary"
                onPress={() => void Share.share({ message: deliverySlip(data, t.slip, locale) })}
              />
            ) : null}
          </Card>
          {contact ? (
            <Card>
              <Text style={text.muted}>{t.seller.customer}</Text>
              <Text style={text.heading}>{contact.recipientName}</Text>
              <Text style={text.body}>
                {contact.addressLine}, {contact.city}
                {destination ? ` — ${localized(destination.name, locale)}` : ''}
                {destination?.wilaya ? `, ${localized(destination.wilaya.name, locale)}` : ''}
              </Text>
              <Button
                label={`${t.seller.call} · ${contact.phone}`}
                variant="secondary"
                onPress={() => void Linking.openURL(`tel:${contact.phone}`)}
              />
            </Card>
          ) : null}
          {signal.data ? (
            <Card>
              <Text style={text.heading}>{t.seller.signal}</Text>
              <Badge
                label={signal.data.phoneVerified ? t.seller.signalPhone : t.seller.signalPhoneNo}
                tone={signal.data.phoneVerified ? 'good' : 'wait'}
              />
              <Text style={text.body}>
                {fill(t.seller.signalDelivered, { n: signal.data.deliveredOrders })}
              </Text>
              <Text style={[text.body, signal.data.failedDeliveries > 0 && styles.warn]}>
                {fill(t.seller.signalFailed, { n: signal.data.failedDeliveries })}
              </Text>
              <Text style={text.body}>
                {fill(t.seller.signalCancelled, { n: signal.data.cancelledOrders })}
              </Text>
              <Text style={text.muted}>
                {fill(t.seller.signalAge, { n: signal.data.accountAgeDays })}
              </Text>
            </Card>
          ) : null}
          {data.shipment ? (
            <Card>
              <Text style={text.body}>
                {fill(t.order.carrier, { carrier: data.shipment.carrier })}
              </Text>
              <Text style={text.body}>
                {fill(t.order.tracking, { tracking: data.shipment.trackingReference })}
              </Text>
            </Card>
          ) : null}
          {pending ? (
            <Card>
              {pending === 'SHIP' ? (
                <>
                  <Field
                    label={t.seller.carrier}
                    value={carrier}
                    onChangeText={setCarrier}
                    maxLength={80}
                  />
                  <Field
                    label={t.seller.tracking}
                    hint={t.seller.trackingHint}
                    value={tracking}
                    onChangeText={setTracking}
                    autoCapitalize="characters"
                    maxLength={80}
                  />
                </>
              ) : null}
              {pending === 'REJECT' ? (
                <>
                  <Text style={text.heading}>{t.seller.rejectReason}</Text>
                  <Segmented<Reason>
                    options={[
                      ['OUT_OF_STOCK', t.seller.OUT_OF_STOCK],
                      ['DELIVERY_UNAVAILABLE', t.seller.DELIVERY_UNAVAILABLE],
                      ['UNABLE_TO_FULFILL', t.seller.UNABLE_TO_FULFILL],
                    ]}
                    value={reason}
                    onChange={setReason}
                  />
                </>
              ) : null}
              <Notice>{pending === 'REJECT' ? t.seller.reject : t.seller[pending]}</Notice>
              <Button
                label={t.common.confirm}
                variant={
                  pending === 'REJECT' || pending === 'REPORT_DELIVERY_FAILED'
                    ? 'danger'
                    : 'primary'
                }
                busy={busy}
                disabled={pending === 'SHIP' && !shipReady}
                onPress={() => void confirm(data, pending)}
              />
              <Button
                label={t.common.cancel}
                variant="secondary"
                onPress={() => setPending(null)}
              />
            </Card>
          ) : (
            <>
              {next ? <Button label={t.seller[next]} onPress={() => setPending(next)} /> : null}
              {canReportFailure(data.status) ? (
                <Button
                  label={t.seller.REPORT_DELIVERY_FAILED}
                  variant="secondary"
                  onPress={() => setPending('REPORT_DELIVERY_FAILED')}
                />
              ) : null}
              {canReject(data.status) ? (
                <Button
                  label={t.seller.reject}
                  variant="secondary"
                  onPress={() => setPending('REJECT')}
                />
              ) : null}
            </>
          )}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1 },
  warn: { color: colors.danger, fontWeight: '700' },
});
