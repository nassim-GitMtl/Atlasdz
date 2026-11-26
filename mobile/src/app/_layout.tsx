import { LocaleProvider, Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CartProvider } from '@/lib/cart';
import { fontFiles, fontFor } from '@/lib/fonts';
import { I18nProvider, useI18n } from '@/lib/i18n';
import { LibraryProvider } from '@/lib/library';
import { SessionProvider, useSession } from '@/lib/session';
import { colors } from '@/lib/theme';

void SplashScreen.preventAutoHideAsync();

function Navigator() {
  const { t, rtl } = useI18n();
  const session = useSession();
  // Sellers get the seller workspace; everyone else (signed in or not) the shop.
  const seller = session.status === 'signedIn' && session.actor === 'seller';
  // Links (and a restart in seller mode) are resolved once the saved session is known.
  // A font that fails to load falls back to the system font rather than blocking the app.
  const [fontsLoaded, fontError] = useFonts(fontFiles);
  const loading = session.status === 'loading' || (!fontsLoaded && !fontError);
  useEffect(() => {
    if (!loading) void SplashScreen.hideAsync();
  }, [loading]);
  if (loading) return null;
  return (
    <LocaleProvider direction={rtl ? 'rtl' : 'ltr'}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.card },
          headerShadowVisible: false,
          headerTintColor: colors.ink,
          headerTitleStyle: { fontFamily: fontFor(700, rtl) },
          headerBackTitle: t.common.back,
          contentStyle: { backgroundColor: colors.cream },
        }}
      >
        <Stack.Protected guard={!seller}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="checkout/index" options={{ title: t.checkout.title }} />
          <Stack.Screen name="checkout/[quoteId]" options={{ title: t.review.title }} />
          <Stack.Screen name="order/[orderId]" options={{ title: t.order.title }} />
          <Stack.Screen name="rate/[sellerOrderId]" options={{ title: t.reviews.rateTitle }} />
          <Stack.Screen name="addresses" options={{ title: t.addresses.title }} />
          <Stack.Screen name="alerts" options={{ title: t.account.stockAlerts }} />
          <Stack.Screen name="phone" options={{ title: t.phone.title }} />
          <Stack.Screen name="delete-account" options={{ title: t.deleteAccount.title }} />
          <Stack.Screen name="seller-register" options={{ title: t.register.title }} />
        </Stack.Protected>
        <Stack.Protected guard={seller}>
          <Stack.Screen name="(seller)" options={{ headerShown: false }} />
          <Stack.Screen name="seller/order/[id]" options={{ title: t.order.title }} />
          <Stack.Screen name="seller/product/new" options={{ title: t.catalog.newProduct }} />
          <Stack.Screen name="seller/product/[id]" options={{ title: t.catalog.products }} />
          <Stack.Screen name="seller/offer/[id]" options={{ title: t.catalog.offers }} />
          <Stack.Screen name="seller/quick" options={{ title: t.catalog.quickUpdate }} />
          <Stack.Screen name="seller/questions" options={{ title: t.seller.questions }} />
          <Stack.Screen name="seller/delivery" options={{ title: t.seller.delivery }} />
          <Stack.Screen name="seller/reviews" options={{ title: t.reviews.title }} />
        </Stack.Protected>
        <Stack.Screen name="login" options={{ presentation: 'modal', title: t.login.title }} />
        <Stack.Screen name="product/[slug]" options={{ title: '' }} />
        <Stack.Screen name="store/[slug]" options={{ title: '' }} />
        <Stack.Screen name="reviews/[slug]" options={{ title: t.reviews.title }} />
        <Stack.Screen name="notifications" options={{ title: t.notifications.title }} />
        <Stack.Screen name="support/index" options={{ title: t.support.title }} />
        <Stack.Screen name="support/new" options={{ title: t.support.newTitle }} />
        <Stack.Screen name="support/[caseId]" options={{ title: t.support.title }} />
        <Stack.Screen name="sessions" options={{ title: t.sessions.title }} />
        <Stack.Screen name="change-password" options={{ title: t.changePassword.title }} />
        <Stack.Screen name="+not-found" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="dark" />
    </LocaleProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <SessionProvider>
          <LibraryProvider>
            <CartProvider>
              <Navigator />
            </CartProvider>
          </LibraryProvider>
        </SessionProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
