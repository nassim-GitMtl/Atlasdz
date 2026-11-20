// Back-in-stock alerts on the local stack (shop 3001, app web 8090, API 3003): a product of the
// demo seller is sold out; a newly registered customer asks to be told (shop), sees it on the
// account page and in the app. With ATLAS_DISPATCHER=1 (a stack running the outbox dispatcher,
// e.g. the production rehearsal) the seller restocks and the alert closes after one email; the
// local API has no dispatcher, so that step is skipped there. Synthetic data; stock restored.
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const SHOP = 'http://127.0.0.1:3001';
const APP = process.env.ATLAS_APP_URL ?? 'http://127.0.0.1:8090';
const API = 'http://127.0.0.1:3003';
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
const call = async (path, token, init = {}) => {
  const response = await fetch(API + path, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  });
  if (response.status >= 400) throw new Error(`${path} → ${response.status}`);
  return response.json();
};
const sellerToken = await session('seller');
// A registered customer (the local demo customer has no email account page).
const email = `alerte-${Math.random().toString(16).slice(2, 8)}@example.dz`;
const password = 'correct horse battery 42';
await fetch(`${API}/api/v1/auth/register/customer`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password, origin: SHOP }),
});
const login = await fetch(`${API}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
if (!login.ok) throw new Error(`customer login ${login.status}`);
const customerToken = (await login.json()).accessToken;
// A product sold only by the demo seller, outside the demo catalogue other journeys rely on.
const demo = new Set(['air-fryer-5l', 'coffee-maker-compact', 'earbuds-wireless']);
const catalog = (await (await fetch(`${API}/api/v1/catalog/products?limit=100`)).json()).items;
const mine = new Set((await call('/api/v1/seller/offers', sellerToken)).items.map((o) => o.id));
const product = catalog.find(
  (p) => !demo.has(p.slug) && p.offers.length === 1 && mine.has(p.offers[0].id),
);
if (!product) throw new Error('no single-offer demo seller product');
const offerId = product.offers[0].id;
const setStock = async (availableQuantity) => {
  const now = await call(`/api/v1/seller/offers/${offerId}`, sellerToken);
  await call(`/api/v1/seller/offers/${offerId}`, sellerToken, {
    method: 'POST',
    body: JSON.stringify({
      priceMinor: now.priceMinor,
      availableQuantity,
      handlingDays: now.handlingDays,
      preorder: now.preorder ?? null,
      expectedVersion: now.rowVersion,
    }),
  });
  return now.availableQuantity;
};
const before = await setStock(0);
const title = product.title.fr;
const browser = await chromium.launch();
try {
  await check('shop: sold-out product offers the alert; the account page lists it', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
    const page = await context.newPage();
    await page.goto(`${SHOP}/product/${product.slug}`);
    await page.getByRole('link', { name: 'Se connecter pour être averti du retour' }).waitFor({ timeout: 15000 });
    // Signed in: the shop keeps the access token in its session cookie.
    await context.addCookies([
      { name: 'atlas_customer_session', value: customerToken, url: SHOP, httpOnly: true, sameSite: 'Lax' },
    ]);
    await page.goto(`${SHOP}/product/${product.slug}`);
    await page.getByRole('button', { name: 'M’avertir du retour en stock' }).click({ timeout: 15000 });
    await page.getByText('Nous vous écrirons une fois').waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: 'Ne plus m’avertir' }).waitFor();
    await page.locator('.stock-alert').screenshot({ path: new URL('./mobile-shots/stock-alert.png', import.meta.url).pathname });
    await page.goto(`${SHOP}/account`);
    await page.locator('.stock-alert-list').getByRole('link', { name: title }).waitFor({ timeout: 15000 });
  });
  await check('app: the alert shows on the product and in the account list', async () => {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await page.goto(APP);
    await page.evaluate((token) => {
      localStorage.setItem('atlas.locale', 'fr');
      localStorage.setItem('atlas.session', token);
    }, customerToken);
    await page.goto(`${APP}/product/${product.slug}`);
    await page.getByRole('button', { name: 'Ne plus m’avertir' }).waitFor({ timeout: 15000 });
    await page.getByText('Nous vous écrirons une fois').waitFor();
    // The account's alert list (Compte → Alertes de retour en stock).
    await page.goto(`${APP}/alerts`);
    await page.getByText(title).first().waitFor({ timeout: 15000 });
  });
  if (process.env.ATLAS_DISPATCHER === '1') await check('restock: one email, then the alert is closed', async () => {
    await setStock(Math.max(before, 5));
    const end = Date.now() + 30000;
    for (;;) {
      const status = await call(`/api/v1/stock-alerts/${product.slug}`, customerToken);
      if (!status.waiting) break;
      if (Date.now() > end) throw new Error('alert still waiting after restock');
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (process.env.API_LOG) {
      const mails = readFileSync(process.env.API_LOG, 'utf8')
        .split('\n')
        .filter((line) => line.includes('De retour en stock') && line.includes(title));
      if (mails.length === 0) throw new Error('no back-in-stock email in the API log');
    }
  });
  await check('the alert can be stopped', async () => {
    await fetch(`${API}/api/v1/stock-alerts/${product.slug}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${customerToken}` },
    });
    const status = await call(`/api/v1/stock-alerts/${product.slug}`, customerToken);
    if (status.waiting) throw new Error('still waiting');
  });
} finally {
  await browser.close();
  // Leave the product in stock for other journeys.
  const now = await call(`/api/v1/seller/offers/${offerId}`, sellerToken);
  if (now.availableQuantity === 0) await setStock(Math.max(before, 5));
}
for (const r of results) console.log(r.join(' | '));
process.exitCode = results.some((r) => r[0] === 'FAIL') ? 1 : 0;
