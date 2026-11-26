// Store logo on the local stack (shop 3001, Seller Center 3002, app web 8090, API 3003): the demo
// seller uploads a logo from Seller Center « Statut de la boutique »; the shop and app store pages
// show it; the seller removes it again at the end. Synthetic data.
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const SHOP = 'http://127.0.0.1:3001';
const SC = 'http://127.0.0.1:3002';
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
// A 1×1 PNG; the API re-encodes it to a 512 px square WebP.
const file = join(tmpdir(), 'atlas-logo-test.png');
writeFileSync(
  file,
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
);
const sellerToken = (
  await (
    await fetch(`${API}/api/v1/local/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ account: 'seller' }),
    })
  ).json()
).accessToken;
const account = await (
  await fetch(`${API}/api/v1/seller/account`, { headers: { authorization: `Bearer ${sellerToken}` } })
).json();
const product = (await (await fetch(`${API}/api/v1/catalog/products?limit=50`)).json()).items.find(
  (item) => item.offers.some((offer) => offer.seller.id === account.sellerId),
);
const storeSlug = product?.offers.find((offer) => offer.seller.id === account.sellerId)?.seller.slug;
let logoUrl = null;
const browser = await chromium.launch();
await check('Seller Center: the seller uploads a store logo', async () => {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(`${SC}/local-login`);
  await page
    .locator('form:has(input[value=seller]) button[type=submit], button[value=seller]')
    .first()
    .click();
  await page.waitForTimeout(2000);
  await page.goto(`${SC}/account?lang=fr`);
  await page.setInputFiles('#logo-file', file);
  await page.getByRole('button', { name: 'Enregistrer le logo' }).click();
  await page.getByText('Logo enregistré.').waitFor({ timeout: 20000 });
  await page.locator('img.store-logo-preview').waitFor({ timeout: 15000 });
  const fresh = await (
    await fetch(`${API}/api/v1/seller/account`, { headers: { authorization: `Bearer ${sellerToken}` } })
  ).json();
  logoUrl = fresh.logoUrl;
  if (!/^\/media\/[0-9a-f-]{36}\.webp$/.test(logoUrl ?? '')) throw new Error(`logo ${logoUrl}`);
});
await check('shop and app store pages show the logo', async () => {
  if (!storeSlug) throw new Error('demo seller store slug not found');
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.goto(`${SHOP}/store/${storeSlug}?lang=fr`);
  const shopLogo = page.locator('.store-avatar__logo img');
  await shopLogo.waitFor({ timeout: 15000 });
  if (!((await shopLogo.getAttribute('src')) ?? '').includes(logoUrl.slice(7, 43)))
    throw new Error('shop logo src');
  await page.goto(APP);
  await page.evaluate(() => localStorage.setItem('atlas.locale', 'fr'));
  await page.goto(`${APP}/store/${storeSlug}`);
  await page.locator(`img[src*="${logoUrl.slice(7, 43)}"]`).first().waitFor({ state: 'attached', timeout: 20000 });
});
await check('the seller removes the logo', async () => {
  const removed = await fetch(`${API}/api/v1/seller/logo/remove`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${sellerToken}` },
    body: '{}',
  });
  if (removed.status !== 200) throw new Error(`remove ${removed.status}`);
  const media = await fetch(`${API}${logoUrl}`);
  if (media.status !== 404) throw new Error(`file still served (${media.status})`);
});
await browser.close();
for (const r of results) console.log(r.join(' | '));
process.exitCode = results.some((r) => r[0] === 'FAIL') ? 1 : 0;
