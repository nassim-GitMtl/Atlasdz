// Courier note at checkout on the local stack (shop 3001, Seller Center 3002, API 3003): the demo
// customer adds a landmark note in the shop checkout form; the order page, the printable summary
// and the seller's order page show it. The order is cancelled at the end. Synthetic data.
import { chromium } from 'playwright';

const SHOP = 'http://127.0.0.1:3001';
const SC = 'http://127.0.0.1:3002';
const API = 'http://127.0.0.1:3003';
const SLUG = 'air-fryer-5l';
const NOTE = 'En face de la pharmacie, 2e étage';
const results = [];
const check = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (error) {
    results.push(['FAIL', name, String(error?.message ?? error).split('\n')[0]]);
  }
};
const api = async (path, token, init = {}) => {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${path} → ${response.status}`);
  return data;
};
const token = (
  await (
    await fetch(`${API}/api/v1/local/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ account: 'customer' }),
    })
  ).json()
).accessToken;
let cart = await api('/api/v1/cart', token);
for (const line of cart.items)
  cart = await api(`/api/v1/cart/items/${line.offerId}`, token, {
    method: 'PUT',
    body: JSON.stringify({ quantity: 0, expectedVersion: cart.version }),
  });
const product = await (await fetch(`${API}/api/v1/catalog/products/${SLUG}`)).json();
await api(`/api/v1/cart/items/${product.offers[0].id}`, token, {
  method: 'PUT',
  body: JSON.stringify({ quantity: 1, expectedVersion: cart.version }),
});
const browser = await chromium.launch();
let orderUrl = null;
await check('shop: the checkout form carries the courier note to the order', async () => {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' })).newPage();
  await page.goto(`${SHOP}/login`);
  await page.click('.auth-local form button[type=submit]');
  await page.waitForURL((url) => url.pathname === '/cart', { timeout: 20000 });
  await page.selectOption('#checkout-wilaya', 'test');
  const value = await page.locator('#checkout-destination option:not([disabled])').first().getAttribute('value');
  await page.selectOption('#checkout-destination', value);
  await page.fill('#checkout-recipientName', 'Nadia K.');
  await page.fill('#checkout-phone', '0555112233');
  await page.fill('#checkout-addressLine', '5 rue des Frères Bouadou');
  await page.fill('#checkout-city', 'Constantine');
  await page.fill('#checkout-note', NOTE);
  await page.click('.order-form button[type=submit]');
  await page.waitForURL(/\/checkout\/[0-9a-f-]{36}/, { timeout: 20000 });
  await page.click('.order-form button[type=submit]');
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}/, { timeout: 20000 });
  orderUrl = page.url();
  await page.getByText(NOTE).first().waitFor({ timeout: 15000 });
  await page.getByRole('link', { name: /Imprimer le récapitulatif/ }).first().click();
  await page.getByText(NOTE).waitFor({ timeout: 15000 });
});
const orderId = /\/orders\/([0-9a-f-]{36})/.exec(orderUrl ?? '')?.[1];
const order = orderId ? await api(`/api/v1/orders/${orderId}`, token) : null;
await check('Seller Center: the seller sees the note on the order', async () => {
  if (!order) throw new Error('no order');
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(`${SC}/local-login`);
  await page.locator('form:has(input[value=seller]) button[type=submit], button[value=seller]').first().click();
  await page.waitForTimeout(2000);
  await page.goto(`${SC}/orders/${order.sellerOrders[0].id}?lang=fr`);
  await page.getByText(NOTE).waitFor({ timeout: 15000 });
  await page.getByText('Indications pour le livreur').waitFor();
});
await browser.close();
if (order)
  for (const sellerOrder of order.sellerOrders)
    await api(`/api/v1/orders/seller-orders/${sellerOrder.id}/cancel`, token, {
      method: 'POST',
      body: JSON.stringify({ expectedVersion: sellerOrder.version }),
    }).catch(() => {});
for (const r of results) console.log(r.join(' | '));
process.exitCode = results.some((r) => r[0] === 'FAIL') ? 1 : 0;
