// Seller-declared delivery time on the local stack (shop 3001, Seller Center 3002, app web 8090,
// API 3003): the demo seller states 2–4 days for the test destination in Seller Center; the shop
// product page and the app checkout show it next to the fee. Synthetic data; the days are
// cleared again at the end.
import { chromium } from 'playwright';

const SHOP = 'http://127.0.0.1:3001';
const SC = 'http://127.0.0.1:3002';
const APP = process.env.ATLAS_APP_URL ?? 'http://127.0.0.1:8090';
const API = 'http://127.0.0.1:3003';
const SLUG = 'air-fryer-5l';
const DESTINATION = '80000000-0000-4000-8000-000000000003';
const results = [];
const check = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (error) {
    results.push(['FAIL', name, String(error?.message ?? error).split('\n')[0]]);
  }
};
const session = async (account) =>
  (
    await (
      await fetch(`${API}/api/v1/local/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ account }),
      })
    ).json()
  ).accessToken;
const browser = await chromium.launch();
await check('Seller Center: the seller states 2 to 4 days for a destination', async () => {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(`${SC}/local-login`);
  await page
    .locator('form:has(input[value=seller]) button[type=submit], button[value=seller]')
    .first()
    .click();
  await page.waitForTimeout(2000);
  await page.goto(`${SC}/delivery?lang=fr&wilaya=test`);
  const card = page.locator('article', { has: page.locator(`#days-min-${DESTINATION}`) });
  await card.locator('summary').click();
  await page.fill(`#days-min-${DESTINATION}`, '2');
  await page.fill(`#days-max-${DESTINATION}`, '4');
  await card.getByLabel(/Je confirme/).check();
  await card.getByRole('button', { name: 'Enregistrer ce tarif' }).click();
  await card.getByText('2–4 j').waitFor({ timeout: 15000 });
});
await check('shop: the product page shows the stated time with the fee', async () => {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.goto(`${SHOP}/product/${SLUG}?lang=fr`);
  await page.getByRole('button', { name: 'Voir la livraison vers ma commune' }).click();
  await page.getByLabel('Wilaya').selectOption('test');
  await page.getByLabel('Commune').selectOption(DESTINATION);
  await page.getByText('2 à 4 jours').waitFor({ timeout: 15000 });
  await page.getByText(/Délais indiqués par chaque vendeur/).waitFor();
});
let added = false;
let addedOffer = null;
await check('app: checkout shows the stated time next to the fee', async () => {
  const token = await session('customer');
  const cart = await (
    await fetch(`${API}/api/v1/cart`, { headers: { authorization: `Bearer ${token}` } })
  ).json();
  const product = await (await fetch(`${API}/api/v1/catalog/products/${SLUG}`)).json();
  const offer = product.offers[0];
  addedOffer = offer.id;
  added = !cart.items?.some((item) => item.offerId === offer.id);
  if (added)
    await fetch(`${API}/api/v1/cart/items/${offer.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ quantity: 1, expectedVersion: cart.version }),
    });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.goto(APP);
  await page.evaluate((value) => {
    localStorage.setItem('atlas.locale', 'fr');
    localStorage.setItem('atlas.session', JSON.stringify({ token: value, actor: 'customer' }));
  }, token);
  await page.goto(`${APP}/checkout`);
  // The last order's commune may already be filled in; otherwise pick the test destination.
  const days = page.getByText(/2 à 4 jours/).first();
  await page.getByRole('button', { name: /^Wilaya:/ }).waitFor({ timeout: 20000 });
  if (!(await days.isVisible())) {
    await page.getByRole('button', { name: /^Wilaya:/ }).click();
    await page.getByText('Destinations de test').last().click({ timeout: 15000 });
    await page.getByRole('button', { name: /^Commune:/ }).click();
    await page.getByText('Destination fictive A').last().click({ timeout: 15000 });
  }
  await days.waitFor({ timeout: 15000 });
});
// Leave the demo data as it was: empty the cart line we added and clear the stated time.
if (added && addedOffer) {
  const token = await session('customer');
  const cart = await (
    await fetch(`${API}/api/v1/cart`, { headers: { authorization: `Bearer ${token}` } })
  ).json();
  await fetch(`${API}/api/v1/cart/items/${addedOffer}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ quantity: 0, expectedVersion: cart.version }),
  });
}
const seller = await session('seller');
const rates = await (
  await fetch(`${API}/api/v1/seller/delivery`, { headers: { authorization: `Bearer ${seller}` } })
).json();
const rate = rates.items.find((item) => item.destination.id === DESTINATION);
await fetch(`${API}/api/v1/seller/delivery/${DESTINATION}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${seller}` },
  body: JSON.stringify({
    expectedVersion: rate.version,
    enabled: rate.enabled,
    shippingFeeMinor: rate.shippingFeeMinor,
    codCollector: rate.codCollector,
    deliveryDays: null,
  }),
});
await browser.close();
for (const r of results) console.log(r.join(' | '));
process.exitCode = results.some((r) => r[0] === 'FAIL') ? 1 : 0;
