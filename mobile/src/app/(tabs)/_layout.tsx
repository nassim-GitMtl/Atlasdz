import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabIcon } from '@/components/tab-icon';
import { useCart } from '@/lib/cart';
import { fontFor } from '@/lib/fonts';
import { useI18n } from '@/lib/i18n';
import { colors, tabBarStyle } from '@/lib/theme';

export default function ShopTabs() {
  const { t, rtl } = useI18n();
  const insets = useSafeAreaInsets();
  const cart = useCart();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.olive,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: tabBarStyle(insets.bottom),
        headerTintColor: colors.ink,
        headerTitleStyle: { fontFamily: fontFor(800, rtl) },
        headerStyle: { backgroundColor: colors.card },
        headerShadowVisible: false,
        tabBarLabelStyle: { fontFamily: fontFor(700, rtl), fontSize: 11, lineHeight: 15 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t.tabs.home,
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="home-outline" color={color} size={size} />
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
