// Isolated mobile shipping UI regressions: mocked API, no accounts/orders/database writes.
/* global document, innerWidth */
// Run against mobile/dist/web exported with EXPO_PUBLIC_API_URL on the local API origin.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const APP = process.env.ATLAS_APP_URL ?? 'http://127.0.0.1:8090';
const shots = new URL('./mobile-shots/', import.meta.url).pathname;
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ channel: process.env.ATLAS_TEST_BROWSER_CHANNEL });
const copy = {
  fr: {
    wilaya: 'Wilaya',
    commune: 'Commune',
    checkout: 'Commander',
    refresh: 'Actualiser les frais',
    remove: 'Retirer',
  },
  en: {
    wilaya: 'Wilaya',
    commune: 'Commune',
    checkout: 'Order',
    refresh: 'Refresh delivery fees',
    remove: 'Remove',
  },
  ar: {
    wilaya: 'الولاية',
    commune: 'البلدية',
    checkout: 'اطلب الآن',
    refresh: 'تحديث رسوم التوصيل',
    remove: 'حذف',
  },
};
const seller = (id) => ({ id, name: id === 's1' ? 'Seller One' : 'Seller Two', slug: id });
const product = (slug, sellerId, price) => ({
  id: slug,
  slug,
  imageUrl: '/assets/product-earbuds.png',
  title: { fr: slug, ar: slug, en: slug },
  description: { fr: slug, ar: slug },
  category: { slug: 'phones', title: { fr: 'Téléphones', ar: 'هواتف' } },
  offers: [
    {
      id: slug,
      seller: seller(sellerId),
      priceMinor: price,
      currency: 'DZD',
      availableQuantity: 10,
      handlingDays: 2,
      deliveryFeeMinor: 0,
    },
  ],
});
const products = [
  product('one', 's1', 100000),
  product('two', 's1', 50000),
  product('three', 's2', 200000),
];
const places = ['A', 'B', 'C'].map((id) => ({
  id,
  code: id,
  dataClass: 'reference',
  kind: 'COMMUNE',
  datasetVersionId: 'test',
  name: { fr: id, ar: id, en: id },
  wilaya: { id: 'w1', code: '01', name: { fr: 'Test', ar: 'Test', en: 'Test' } },
}));
let passed = 0;
try {
  for (const locale of ['en', 'fr', 'ar']) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let failFees = false;
    let delayA = false;
    let releaseA;
    let waitingA;
    await context.route('**/api/v1/**', async (route) => {
      const url = new URL(route.request().url());
      const json = (body, status = 200) =>
        route.fulfill({
          status,
          headers: { 'access-control-allow-origin': '*' },
          contentType: 'application/json',
          body: JSON.stringify(body),
        });
      if (url.pathname === '/api/v1/delivery/destinations') return json({ items: places });
      if (url.pathname.startsWith('/api/v1/catalog/products/'))
        return json(products.find((item) => item.slug === url.pathname.split('/').at(-1)));
      if (url.pathname === '/api/v1/delivery/fees') {
        if (failFees) return json({ code: 'UNAVAILABLE' }, 503);
        const destination = url.searchParams.get('destinationId');
        if (destination === 'A' && delayA) {
          waitingA?.();
          await new Promise((resolve) => {
            releaseA = resolve;
          });
        }
        return json({
          items: url.searchParams
            .get('sellerIds')
            .split(',')
            .map((id) => ({
              sellerId: id,
              available: !(destination === 'B' && id === 's2'),
              shippingFeeMinor:
                destination === 'B' && id === 's2'
                  ? null
                  : destination === 'C'
                    ? 0
                    : id === 's1'
                      ? 10000
                      : 20000,
            })),
        });
      }
      return json({ items: [] });
    });
    await context.addInitScript(
      ({ locale }) => {
        localStorage.setItem('atlas.locale', locale);
        localStorage.setItem(
          'atlas.guestCart',
          JSON.stringify([
            { offerId: 'one', slug: 'one', quantity: 2 },
            { offerId: 'two', slug: 'two', quantity: 1 },
            { offerId: 'three', slug: 'three', quantity: 1 },
          ]),
        );
      },
      { locale },
    );
    await page.goto(`${APP}/cart`);
    await page.getByTestId('cart-estimated-total').waitFor();
    const checkout = page.getByRole('button', { name: copy[locale].checkout, exact: true });
    assert.equal(await checkout.isDisabled(), true, 'no destination cannot proceed');
    const selectCommune = async (name) => {
      await page.getByRole('button', { name: new RegExp(`^${copy[locale].commune}:`) }).click();
      await page.getByRole('button', { name, exact: true }).click();
      await page.getByRole('button', { name: 'A', exact: true }).waitFor({ state: 'hidden' });
    };
    await page.getByRole('button', { name: new RegExp(`^${copy[locale].wilaya}:`) }).click();
    await page.getByRole('button', { name: '01 — Test', exact: true }).click();
    await selectCommune('A');
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="cart-estimated-total"]')
          ?.textContent?.replace(/[^0-9]/g, '') === '4800',
    );
    assert.equal(await checkout.isEnabled(), true);
    assert.equal((await page.getByText('Seller One', { exact: true }).count()) >= 1, true);
    await selectCommune('B');
    await page.waitForFunction(
      () =>
        !/[0-9]/.test(
          document.querySelector('[data-testid="cart-estimated-total"]')?.textContent ?? '',
        ),
    );
    assert.equal(await checkout.isDisabled(), true, 'unsupported seller blocks the entire cart');
    await selectCommune('C');
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="cart-estimated-total"]')
          ?.textContent?.replace(/[^0-9]/g, '') === '4500',
    );
    failFees = true;
    await page.getByRole('button', { name: copy[locale].refresh, exact: true }).click();
    await page.waitForFunction(
      () =>
        !/[0-9]/.test(
          document.querySelector('[data-testid="cart-estimated-total"]')?.textContent ?? '',
        ),
    );
    assert.equal(
      await checkout.isDisabled(),
      true,
      'failed refresh must hide the previous estimate',
    );
    failFees = false;
    await page.getByRole('button', { name: copy[locale].refresh, exact: true }).click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="cart-estimated-total"]')
          ?.textContent?.replace(/[^0-9]/g, '') === '4500',
    );
    if (locale === 'en') {
      delayA = true;
      const started = new Promise((resolve) => {
        waitingA = resolve;
      });
      await selectCommune('A');
      await started;
      await selectCommune('C');
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-testid="cart-estimated-total"]')
            ?.textContent?.replace(/[^0-9]/g, '') === '4500',
      );
      releaseA();
      await page.waitForLoadState('networkidle');
      assert.match(await page.getByTestId('cart-estimated-total').innerText(), /4,?500/);
    }
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      'no horizontal overflow',
    );
    await page.screenshot({ path: `${shots}delivery-${locale}.png`, fullPage: true });
    await page.getByTestId('cart-estimated-total').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${shots}delivery-${locale}-summary.png` });
    await checkout.click();
    await page.waitForURL(/\/checkout\?destinationId=C/);
    await page.getByRole('button', { name: `${copy[locale].commune}: C`, exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${locale}: seller totals, free/unsupported rates, retry, destination carry-over, overflow, JS errors`,
    );
    passed++;
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(`${passed}/3 locale journeys passed (mocked API; no production/device certification).`);
