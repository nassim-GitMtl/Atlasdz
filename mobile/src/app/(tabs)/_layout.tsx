import { Tabs } from 'expo-router';

import { TabIcon } from '@/components/tab-icon';
import { useCart } from '@/lib/cart';
import { useI18n } from '@/lib/i18n';
import { colors } from '@/lib/theme';

export default function ShopTabs() {
  const { t } = useI18n();
  const cart = useCart();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.olive,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.card },
        headerStyle: { backgroundColor: colors.cream },
        headerTintColor: colors.ink,
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t.tabs.home,
          headerTitle: 'atlas dz',
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="storefront-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: t.tabs.favorites,
          headerTitle: t.favorites.title,
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="heart-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: t.tabs.cart,
          headerTitle: t.cart.title,
          tabBarBadge: cart.count > 0 ? cart.count : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.coral },
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="cart-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: t.tabs.orders,
          headerTitle: t.orders.title,
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="receipt-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t.tabs.account,
          headerTitle: t.account.title,
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="person-circle-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
