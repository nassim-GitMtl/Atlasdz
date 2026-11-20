import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { RatingLine } from '@/components/reviews';
import { SalesChart } from '@/components/sales-chart';
import { Badge, Card, ListRow, Notice, Screen, text } from '@/components/ui';
import { sellerSummary } from '@/lib/collections';
import { fill, formatDate, formatMoney, formatTime, localized } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { dailySales, deliveredSince, earliestDeadline, lowStock } from '@/lib/seller-tools';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';
import type {
  CatalogEntry,
  ProductSubmission,
  SellerOffer,
  SellerOrder,
  SellerReviewPage,
  SupportCase,
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
  const questions = useRequest('seller-questions', () =>
    session.request<{ items: { answer: string | null }[] }>('/api/v1/seller/questions'),
  );
  const support = useRequest('seller-support', () =>
    session.request<{ items: SupportCase[]; nextCursor?: string | null }>('/api/v1/support'),
  );
  const { refreshAccount } = session;
  const reloadOrders = orders.reload;
  const reloadProducts = products.reload;
  const reloadOffers = offers.reload;
  const reloadReviews = reviews.reload;
  const reloadSupport = support.reload;
  const reloadQuestions = questions.reload;
  const reload = useCallback(() => {
    void reloadSupport();
    void reloadQuestions();
    void refreshAccount();
    void reloadOrders();
    void reloadProducts();
    void reloadOffers();
    void reloadReviews();
  }, [
    refreshAccount,
    reloadOrders,
    reloadProducts,
    reloadOffers,
    reloadReviews,
    reloadSupport,
    reloadQuestions,
  ]);
  useFocusEffect(reload);

  const summary = sellerSummary(orders.data?.items ?? []);
  const running = lowStock(offers.data?.items ?? []).slice(0, 5);
  const titleOf = (productId: string) => {
    const entry = entries.data?.items.find((item) => item.id === productId);
    return entry ? localized(entry.title, locale) : '—';
  };
  const status = session.seller?.status;
  const items = orders.data?.items ?? [];
  const deadline = earliestDeadline(items);
  const recent = deliveredSince(items, new Date());
  const storeName = items[0]?.snapshot.sellerName;
  // Counts come from the first page; "+" says more may exist beyond it.
  const more = (count: number, next: string | null | undefined) => `${count}${next ? '+' : ''}`;
  const openCases = (support.data?.items ?? []).filter((item) => item.status === 'OPEN').length;
  const unanswered = (reviews.data?.items ?? []).filter((item) => item.reply === null).length;
  const todo: {
    key: string;
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    detail: string;
    count: string;
    warn?: boolean;
    go: () => void;
  }[] = [
    {
      key: 'prepare',
      icon: 'cube-outline',
      label: t.seller.prepareShip,
      detail: t.seller.prepareShipSub,
      count: String(summary.toPrepare + summary.toShip),
      go: () => router.navigate('/seller-orders'),
    },
    {
      key: 'requests',
      icon: 'chatbubble-ellipses-outline',
      label: t.seller.requests,
      detail: t.seller.requestsSub,
      count: support.data ? more(openCases, support.data.nextCursor) : '—',
      go: () => router.push('/support'),
    },
    {
      key: 'reviews',
      icon: 'star-outline',
      label: t.seller.unanswered,
      detail:
        reviews.data && reviews.data.summary.count > 0
          ? `${t.reviews.average} ${reviews.data.summary.average?.toFixed(1).replace('.', locale === 'fr' ? ',' : '.') ?? '—'} · ${reviews.data.summary.count}`
          : t.reviews.sellerNone,
      count: reviews.data ? more(unanswered, reviews.data.nextCursor) : '—',
      go: () => router.push('/seller/reviews'),
    },
  ];
  const openQuestions = (questions.data?.items ?? []).filter((item) => item.answer === null).length;
  if (openQuestions > 0)
    todo.push({
      key: 'questions',
      icon: 'help-circle-outline',
      label: t.seller.questions,
      detail: t.seller.questionsDetail,
      count: String(openQuestions),
      warn: true,
      go: () => router.push('/seller/questions'),
    });
  if (running.length > 0) {
    const first = running[0];
    todo.push({
      key: 'stock',
      icon: 'alert-circle-outline',
      label: t.seller.lowStock,
      detail: first
        ? fill(t.seller.lowStockItem, {
            title: titleOf(first.productId),
            n: first.availableQuantity,
          })
        : '',
      count: String(running.length),
      warn: true,
      go: () => (first ? router.push(`/seller/offer/${first.id}`) : router.navigate('/catalog')),
    });
  }

  return (
    <Screen refreshing={orders.loading && !!orders.data} onRefresh={reload}>
      <View style={styles.head}>
        <Text style={styles.eyebrow}>{t.seller.mode}</Text>
        {storeName ? <Text style={styles.store}>{storeName}</Text> : null}
        {status ? (
          <Badge
            label={t.seller[status]}
            tone={status === 'APPROVED' ? 'good' : status === 'PENDING_REVIEW' ? 'wait' : 'bad'}
          />
        ) : null}
        {status === 'PENDING_REVIEW' ? (
          <Text style={text.muted}>{t.seller.pendingNote}</Text>
        ) : null}
        {status === 'SUSPENDED' || status === 'REJECTED' ? (
          <Notice tone="error">{t.seller.suspendedNote}</Notice>
        ) : null}
        {session.seller?.holidayUntil ? (
          <Pressable accessibilityRole="link" onPress={() => router.push('/seller-account')}>
            <Notice tone="info">
              {fill(t.seller.holidayOn, {
                date: formatDate(session.seller.holidayUntil, locale),
              })}
            </Notice>
          </Pressable>
        ) : null}
      </View>
      {summary.toAccept > 0 ? (
        <View style={styles.priority}>
          <Text style={styles.priorityEyebrow}>{t.seller.acceptNow}</Text>
          <Text style={styles.priorityValue}>
            {fill(t.seller.ordersCount, { n: summary.toAccept })}
          </Text>
          {deadline ? (
            <Text style={styles.priorityText}>
              {fill(t.seller.acceptBefore, { time: formatTime(deadline, locale) })}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.navigate('/seller-orders')}
            style={({ pressed }) => [styles.priorityButton, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.priorityButtonText}>{t.seller.seeOrders}</Text>
          </Pressable>
        </View>
      ) : orders.data ? (
        <Card>
          <Text style={text.heading}>{t.seller.acceptNow}</Text>
          <Text style={text.muted}>{t.seller.nothingToAccept}</Text>
        </Card>
      ) : null}
      <Text style={text.heading} accessibilityRole="header">
        {t.seller.alsoTodo}
      </Text>
      <View style={styles.list}>
        {todo.map((item, index) => (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityLabel={`${item.label}: ${item.count}. ${item.detail}`}
            onPress={item.go}
            style={({ pressed }) => [
              styles.todo,
              index > 0 && styles.todoBorder,
              pressed && { opacity: 0.85 },
            ]}
          >
            <View style={[styles.todoIcon, item.warn && styles.todoIconWarn]}>
              <Ionicons
                name={item.icon}
                size={20}
                color={item.warn ? colors.warning : colors.primaryDark}
              />
            </View>
            <View style={styles.todoBody}>
              <Text style={styles.todoLabel}>{item.label}</Text>
              <Text style={styles.todoDetail} numberOfLines={1}>
                {item.detail}
              </Text>
            </View>
            <Text style={styles.todoCount}>{item.count}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>
        ))}
      </View>
      <Card>
        <Text style={text.muted}>{t.seller.delivered30}</Text>
        <Text style={text.title}>
          {formatMoney(recent.totalMinor, locale)}{' '}
          <Text style={styles.sub}>· {fill(t.seller.ordersCount, { n: recent.count })}</Text>
        </Text>
        <Text style={text.muted}>{t.seller.notProfit}</Text>
      </Card>
      {orders.data ? (
        <Card>
          <SalesChart days={dailySales(orders.data.items, new Date())} />
        </Card>
      ) : null}
      {reviews.data && reviews.data.summary.count > 0 ? (
        <Card>
          <RatingLine summary={reviews.data.summary} />
        </Card>
      ) : null}
      <Card>
        <Text style={text.muted}>
          {t.catalog.products} : {products.data?.items.length ?? '—'} · {t.catalog.offers} :{' '}
          {offers.data?.items.length ?? '—'}
        </Text>
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
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: 6 },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.muted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  store: { fontSize: 24, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 14, color: colors.muted },
  priority: { backgroundColor: colors.primary, borderRadius: 18, padding: 18, gap: 10 },
  priorityEyebrow: { fontSize: 13, fontWeight: '800', color: colors.card },
  priorityValue: { fontSize: 32, fontWeight: '800', color: colors.card },
  priorityText: { fontSize: 14, lineHeight: 20, color: colors.card },
  priorityButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: colors.card,
    justifyContent: 'center',
  },
  priorityButtonText: { fontSize: 15, fontWeight: '800', color: colors.primaryDark },
  list: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  todo: {
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  todoBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  todoIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todoIconWarn: { backgroundColor: colors.warningSoft },
  todoBody: { flex: 1, gap: 1 },
  todoLabel: { fontSize: 15, fontWeight: '800', color: colors.ink },
  todoDetail: { fontSize: 12, fontWeight: '600', color: colors.muted },
  todoCount: { fontSize: 18, fontWeight: '800', color: colors.ink },
});
