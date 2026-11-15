import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabIcon } from '@/components/tab-icon';
import { fontFor } from '@/lib/fonts';
import { useI18n } from '@/lib/i18n';
import { colors, tabBarStyle } from '@/lib/theme';

export default function SellerTabs() {
  const { t, rtl } = useI18n();
  const insets = useSafeAreaInsets();
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
        name="dashboard"
        options={{
          title: t.tabs.dashboard,
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="speedometer-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="seller-orders"
        options={{
          title: t.tabs.orders,
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="receipt-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="catalog"
        options={{
          title: t.tabs.catalog,
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="pricetags-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="seller-account"
        options={{
          title: t.tabs.account,
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="person-circle-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
