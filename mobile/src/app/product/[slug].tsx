import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { FavoriteButton } from '@/components/favorite-button';
import { PhotoGallery } from '@/components/photo-gallery';
import { RatingLine, RatingSummary, ReviewItem } from '@/components/reviews';
import { SummaryCard } from '@/components/product-card';
import { Stepper } from '@/components/stepper';
import { Button, Card, LoadState, Notice, Screen, text } from '@/components/ui';
import { api, errorCode } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { summarize } from '@/lib/collections';
import { SHOP_URL } from '@/lib/config';
import { fill, formatDate, formatMoney, localized } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { discountPercent } from '@/lib/promotion';
import { useLibrary } from '@/lib/library';
import { useSession } from '@/lib/session';
import { errorMessage } from '@/lib/strings';
import { colors } from '@/lib/theme';
import type { CatalogProduct, CatalogProductList, ReviewPage } from '@/lib/types';
import { useRequest } from '@/lib/use-request';
import { PreorderNote } from '@/components/preorder-note';

export default function ProductScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t, locale } = useI18n();
  const session = useSession();
  const cart = useCart();
  const { viewed } = useLibrary();
  const product = useRequest(`product:${slug}`, () =>
    api<CatalogProduct>(`/api/v1/catalog/products/${encodeURIComponent(slug)}`),
  );
  const reviews = useRequest(`reviews:product:${slug}`, () =>
    api<ReviewPage>(`/api/v1/catalog/products/${encodeURIComponent(slug)}/reviews`),
  );
  const category = product.data?.category.slug;
  const similar = useRequest(category ? `similar:${category}` : null, () =>
    api<CatalogProductList>(
      `/api/v1/catalog/products?category=${encodeURIComponent(category ?? '')}&limit=12`,
    ),
  );
  const others = (similar.data?.items ?? []).filter((other) => other.slug !== slug).slice(0, 10);
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const item = product.data;
  // Recently viewed: once per loaded product.
  useEffect(() => {
    if (item) viewed(summarize(item));
  }, [item, viewed]);

  // No account needed to shop: signed out, the cart is kept on the phone until checkout.
  async function addToCart(offerId: string) {
    setAdding(offerId);
    setFailure(null);
    try {
      await cart.add(offerId, quantity, slug);
      setAdded(offerId);
    } catch (error) {
      setFailure(errorCode(error));
    } finally {
      setAdding(null);
    }
  }

  const title = item ? localized(item.title, locale) : '';
  const share = () =>
    void Share.share({
      message: fill(t.product.shareText, { title, url: `${SHOP_URL}/product/${slug}` }),
    });
  // Sellers browse the shop but buy with a customer account.
  const buying = session.actor !== 'seller';
  const maxQuantity = Math.max(
    1,
    Math.min(99, Math.max(...(item?.offers.map((offer) => offer.availableQuantity) ?? [1]))),
  );

  return (
    <Screen
      refreshing={product.loading && !!item}
      onRefresh={() => {
        void product.reload();
        void reviews.reload();
      }}
    >
      <Stack.Screen
        options={{
          title,
          headerRight: item
            ? () => (
                <View style={styles.headerActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t.common.share}
                    onPress={share}
                    hitSlop={10}
                    style={styles.headerButton}
                  >
                    <Ionicons name="share-outline" size={23} color={colors.olive} />
                  </Pressable>
                  <FavoriteButton item={summarize(item)} />
                </View>
              )
            : undefined,
        }}
      />
      <LoadState
        loading={product.loading && !item}
        error={item ? undefined : product.error}
        onRetry={() => void product.reload()}
      />
      {item ? (
        <>
          <PhotoGallery
            urls={[item.imageUrl, ...(item.gallery ?? [])]}
            label={title}
            thumbLabel={t.product.photos}
          />
          <View style={styles.gap}>
            <Text style={text.muted}>{localized(item.category.title, locale)}</Text>
            <Text style={text.title}>{title}</Text>
            {reviews.data ? <RatingLine summary={reviews.data.summary} /> : null}
          </View>
          {buying ? (
            <View style={styles.quantity}>
              <Text style={[text.body, styles.grow]}>{t.product.quantity}</Text>
              <Stepper
                value={quantity}
                min={1}
                max={maxQuantity}
                decreaseLabel={t.cart.decrease}
                increaseLabel={t.cart.increase}
                onChange={setQuantity}
              />
            </View>
          ) : null}
          {failure ? <Notice tone="error">{errorMessage(t, failure)}</Notice> : null}
          <Text style={text.heading}>{t.product.offers}</Text>
          {item.offers.map((offer) => (
            <Card key={offer.id}>
              <Text style={text.price}>{formatMoney(offer.priceMinor, locale)}</Text>
              {offer.regularPriceMinor && offer.regularPriceMinor > offer.priceMinor ? (
                <Text style={styles.promo}>
                  {fill(t.promo.tag, {
                    n: discountPercent(offer.priceMinor, offer.regularPriceMinor),
                  })}
                  {' · '}
                  <Text style={styles.regular}>{formatMoney(offer.regularPriceMinor, locale)}</Text>
                  {offer.promotionEndsAt
                    ? ` · ${fill(t.promo.until, { date: formatDate(offer.promotionEndsAt, locale) })}`
                    : ''}
                </Text>
              ) : null}
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push(`/store/${offer.seller.slug}`)}
                style={styles.sellerLink}
              >
                <Text style={text.link}>
                  {fill(t.product.soldBy, { seller: offer.seller.name })}
                </Text>
              </Pressable>
              <Text style={text.muted}>
                {offer.availableQuantity > 0
                  ? fill(t.product.stock, { n: offer.availableQuantity })
                  : t.product.outOfStock}
                {offer.preorder
                  ? null
                  : ` · ${fill(t.product.handling, { n: offer.handlingDays })}`}
              </Text>
              {offer.preorder ? <PreorderNote preorder={offer.preorder} /> : null}
              <Text style={text.muted}>{t.product.deliveryNote}</Text>
              {!buying ? null : added === offer.id ? (
                <>
                  <Notice tone="success">{t.product.added}</Notice>
                  <Button
                    label={t.product.viewCart}
                    variant="secondary"
                    onPress={() => router.navigate('/cart')}
                  />
                </>
              ) : (
                <Button
                  label={offer.preorder ? t.preorder.add : t.product.add}
                  disabled={offer.availableQuantity < quantity}
                  busy={adding === offer.id}
                  onPress={() => void addToCart(offer.id)}
                />
              )}
            </Card>
          ))}
          <Text style={text.heading}>{t.product.description}</Text>
          <Text style={text.body}>{localized(item.description, locale)}</Text>
          {item.specs?.length ? (
            <>
              <Text style={text.heading}>{t.specs.title}</Text>
              <Card>
                {item.specs.map((spec) => (
                  <View key={spec.key} style={styles.specRow}>
                    <Text style={[text.muted, styles.specLabel]}>{t.specs[spec.key]}</Text>
                    <Text style={[text.body, styles.grow]}>{spec.value}</Text>
                  </View>
                ))}
                <Text style={text.muted}>{t.specs.note}</Text>
              </Card>
            </>
          ) : null}
          <Text style={text.heading}>{t.reviews.title}</Text>
          {reviews.data ? (
            <>
              <Card>
                <RatingSummary summary={reviews.data.summary} />
              </Card>
              {reviews.data.items.slice(0, 3).map((review) => (
                <ReviewItem key={review.id} review={review} />
              ))}
              {reviews.data.summary.count > 3 ? (
                <Button
                  label={fill(t.reviews.seeAll, { n: reviews.data.summary.count })}
                  variant="secondary"
                  onPress={() => router.push(`/reviews/${slug}`)}
                />
              ) : null}
            </>
          ) : null}
          {others.length > 0 ? (
            <>
              <Text style={text.heading}>{t.product.similar}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.similar}
              >
                {others.map((other) => (
                  <SummaryCard key={other.id} item={summarize(other)} compact />
                ))}
              </ScrollView>
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  promo: { fontSize: 13, fontWeight: '700', color: colors.danger },
  regular: { color: colors.muted, textDecorationLine: 'line-through', fontWeight: '400' },
  gap: { gap: 4 },
  specRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  specLabel: { width: 120 },
  grow: { flex: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  quantity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  similar: { gap: 12, paddingVertical: 2 },
  // A full-size touch target (44 pt), not just the line of text.
  sellerLink: { minHeight: 44, justifyContent: 'center' },
});
