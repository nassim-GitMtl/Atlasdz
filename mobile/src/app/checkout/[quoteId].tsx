import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Fragment, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Checkbox, LoadState, Notice, Screen, text } from '@/components/ui';
import { errorCode } from '@/lib/api';
import { webPage } from '@/lib/config';
import { fill, formatMoney, formatTime, localized } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { errorMessage } from '@/lib/strings';
import type { CheckoutQuote, CustomerOrder } from '@/lib/types';
import { useRequest } from '@/lib/use-request';
import { PreorderNote } from '@/components/preorder-note';

export default function ReviewScreen() {
  const { quoteId } = useLocalSearchParams<{ quoteId: string }>();
  const { t, locale } = useI18n();
  const session = useSession();
  const quote = useRequest(`quote:${quoteId}`, () =>
    session.request<CheckoutQuote>(`/api/v1/checkout/quotes/${encodeURIComponent(quoteId)}`),
  );
  const [accepted, setAccepted] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const data = quote.data;
  const live = data?.dataClass === 'live';

  async function place() {
    if (!data) return;
    setPlacing(true);
    setFailure(null);
    try {
      // The quote id is the retry key: a repeated tap returns the same order.
      const order = await session.request<CustomerOrder>(
        `/api/v1/checkout/quotes/${data.id}/place`,
        { body: {}, headers: { 'idempotency-key': data.id } },
      );
      router.dismissAll();
      router.push(`/order/${order.id}`);
    } catch (error) {
      setFailure(errorCode(error));
    } finally {
      setPlacing(false);
    }
  }

  async function resend() {
    if (!session.account) return;
    try {
      await session.request('/api/v1/auth/email/resend', {
        body: { email: session.account.email },
      });
      setResent(true);
    } catch (error) {
      setFailure(errorCode(error));
    }
  }

  const destination = data?.destination;
  return (
    <Screen>
      <LoadState
        loading={quote.loading && !data}
        error={data ? undefined : quote.error}
        onRetry={() => void quote.reload()}
      />
      {data ? (
        <>
          {data.sellers.map((seller) => (
            <Card key={seller.sellerId}>
              <Text style={text.heading}>{seller.sellerName}</Text>
              {seller.items.map((item) => (
                <Fragment key={item.offerId}>
                  <View style={styles.row}>
                    <Text style={[text.body, styles.grow]}>
                      {localized(item.title, locale)} × {item.quantity}
                    </Text>
                    <Text style={text.body}>
                      {formatMoney(item.unitPriceMinor * item.quantity, locale)}
                    </Text>
                  </View>
                  {item.preorder ? <PreorderNote preorder={item.preorder} /> : null}
                </Fragment>
              ))}
              <View style={styles.row}>
                <Text style={[text.muted, styles.grow]}>{t.review.shipping}</Text>
                <Text style={text.muted}>{formatMoney(seller.shippingFeeMinor, locale)}</Text>
              </View>
            </Card>
          ))}
          <Card>
            <View style={styles.row}>
              <Text style={[text.heading, styles.grow]}>{t.review.total}</Text>
              <Text style={text.price}>{formatMoney(data.totalMinor, locale)}</Text>
            </View>
            <Text style={text.body}>{live ? t.review.cod : t.review.test}</Text>
            {destination || data.deliveryContact ? (
              <Text style={text.muted}>
                {t.review.deliverTo} :{' '}
                {[
                  data.deliveryContact?.recipientName,
                  data.deliveryContact?.addressLine,
                  destination ? localized(destination.name, locale) : undefined,
                  destination?.wilaya ? localized(destination.wilaya.name, locale) : undefined,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </Text>
            ) : null}
            <Text style={text.muted}>
              {fill(t.review.validUntil, {
                time: formatTime(data.expiresAt, locale),
              })}
            </Text>
          </Card>
          {live ? (
            <View>
              <Checkbox
                checked={accepted}
                label={t.review.terms}
                onToggle={() => setAccepted(!accepted)}
              />
              <Pressable
                accessibilityRole="link"
                onPress={() =>
                  void WebBrowser.openBrowserAsync(webPage('/legal/conditions', locale))
                }
                hitSlop={8}
              >
                <Text style={text.link}>{t.review.readTerms}</Text>
              </Pressable>
            </View>
          ) : null}
          {failure ? <Notice tone="error">{errorMessage(t, failure)}</Notice> : null}
          {failure === 'EMAIL_NOT_VERIFIED' ? (
            resent ? (
              <Notice tone="success">{t.account.resent}</Notice>
            ) : (
              <Button label={t.review.resend} variant="secondary" onPress={() => void resend()} />
            )
          ) : null}
          {failure === 'PHONE_NOT_VERIFIED' ? (
            <Button
              label={t.review.verifyPhone}
              variant="secondary"
              onPress={() => router.push('/phone')}
            />
          ) : null}
          {failure === 'QUOTE_EXPIRED' || failure === 'QUOTE_CHANGED' ? (
            <Button
              label={t.review.restart}
              variant="secondary"
              onPress={() => {
                router.dismissAll();
                router.navigate('/cart');
              }}
            />
          ) : (
            <Button
              label={t.review.place}
              busy={placing}
              disabled={live && !accepted}
              onPress={() => void place()}
            />
          )}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  grow: { flex: 1 },
});
