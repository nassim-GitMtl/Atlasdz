// Printable order summary on the local stack (shop 3001, Seller Center 3002, API 3003): the demo
// customer places a test order through the API, opens the printable summary from the shop order
// page (seller legal identity, lines, totals), the demo seller opens its parcel copy in Seller
// Center; the order is cancelled at the end. Synthetic data.
import { chromium } from 'playwright';

const SHOP = 'http://127.0.0.1:3001';
const SC = 'http://127.0.0.1:3002';
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
const call = async (path, token, body, extra = {}) => {
  const response = await fetch(`${API}${path}`, {
    method: body === undefined ? 'GET' : (extra.method ?? 'POST'),
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(extra.headers ?? {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${path} → ${response.status} ${JSON.stringify(data)}`);
  return data;
};
const token = (await call('/api/v1/local/session', null, { account: 'customer' })).accessToken;
const product = await call(`/api/v1/catalog/products/${SLUG}`);
let cart = await call('/api/v1/cart', token);
// Order exactly one unit of the demo offer: empty the cart first.
for (const item of cart.items ?? [])
  cart = await call(`/api/v1/cart/items/${item.offerId}`, token, { quantity: 0, expectedVersion: cart.version }, { method: 'PUT' });
cart = await call(`/api/v1/cart/items/${product.offers[0].id}`, token, { quantity: 1, expectedVersion: cart.version }, { method: 'PUT' });
const quote = await call('/api/v1/checkout/quotes', token, {
  expectedCartVersion: cart.version,
  destinationId: DESTINATION,
  deliveryContact: {
    recipientName: 'Client Démo',
    phone: '0555123456',
    addressLine: '12 rue des Essais',
    city: 'Ville de test',
  },
});
const order = await call(`/api/v1/checkout/quotes/${quote.id}/place`, token, {}, { headers: { 'idempotency-key': quote.id } });
const sellerOrder = order.sellerOrders[0];
const browser = await chromium.launch();
await check('shop: the order page opens the printable summary', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies([
    { name: 'atlas_customer_session', value: token, url: SHOP, httpOnly: true, sameSite: 'Lax' },
  ]);
  const page = await context.newPage();
  await page.goto(`${SHOP}/orders/${order.id}?lang=fr`);
  await page.getByRole('link', { name: /Imprimer le récapitulatif/ }).first().click();
  await page.getByRole('heading', { name: 'Récapitulatif de commande' }).waitFor({ timeout: 15000 });
  const legal = sellerOrder.snapshot.sellerLegal;
  if (legal) {
    await page.getByText(legal.legalName).first().waitFor();
    await page.getByText(legal.taxId).waitFor();
  } else {
    await page.getByText(/Identité légale non renseignée/).waitFor();
  }
  await page.getByText('Client Démo').waitFor();
  await page.getByRole('button', { name: 'Imprimer / enregistrer en PDF' }).waitFor();
  const header = await page.locator('header, nav').count();
  if (header !== 0) throw new Error('site chrome shown on the printable page');
});
await check('Seller Center: the seller prints the parcel copy', async () => {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(`${SC}/local-login`);
  await page
    .locator('form:has(input[value=seller]) button[type=submit], button[value=seller]')
    .first()
    .click();
  await page.waitForTimeout(2000);
  await page.goto(`${SC}/orders/${sellerOrder.id}?lang=fr`);
  await page.getByRole('link', { name: /Imprimer le récapitulatif/ }).click();
  await page.getByRole('heading', { name: 'Récapitulatif de commande' }).waitFor({ timeout: 15000 });
  await page.getByText(/à joindre au colis/).waitFor();
  await page.getByText('12 rue des Essais, Ville de test').waitFor();
});
await browser.close();
// Leave the demo customer without an open test order.
await call(`/api/v1/orders/seller-orders/${sellerOrder.id}/cancel`, token, { expectedVersion: sellerOrder.version }).catch(() => {});
for (const r of results) console.log(r.join(' | '));
process.exitCode = results.some((r) => r[0] === 'FAIL') ? 1 : 0;
