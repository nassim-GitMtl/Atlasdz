// Shop features under the production headers (CSP) on the local production rehearsal
// (https://shop.localhost): search suggestions, favorites page, product structured data,
// sitemap in live mode, and no CSP violations in the console. Read-only.
import { chromium } from 'playwright';

const SHOP = process.env.ATLAS_SHOP_URL ?? 'https://shop.localhost';
const results = [];
const check = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (error) {
    results.push(['FAIL', name, String(error?.message ?? error).split('\n')[0]]);
  }
};
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  ignoreHTTPSErrors: true,
  locale: 'fr-FR',
});
const page = await context.newPage();
const violations = [];
page.on('console', (message) => {
  if (/Content Security Policy|Refused to/i.test(message.text())) violations.push(message.text());
});
let productPath = '';
await check('search suggestions work under the production CSP', async () => {
  await page.goto(`${SHOP}/`);
  const box = page.getByRole('combobox');
  await box.click();
  await box.pressSequentially('tapis', { delay: 60 });
  const option = page.getByRole('option').first();
  await option.waitFor({ timeout: 15000 });
  await box.press('ArrowDown');
  await box.press('Enter');
  await page.waitForURL(/\/product\//, { timeout: 15000 });
  productPath = new URL(page.url()).pathname;
});
await check('product page carries schema.org data', async () => {
  const raw = await page.locator('script[type="application/ld+json"]').first().textContent();
  const parsed = JSON.parse(raw ?? '{}');
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const data = list.find((item) => item['@type'] === 'Product') ?? {};
  const trail = list.find((item) => item['@type'] === 'BreadcrumbList');
  if (!String(data.url).startsWith('https://shop.localhost/') || !trail)
    throw new Error(`ld+json ${raw?.slice(0, 80)}`);
});
await check('favorites page lists a hearted product', async () => {
  await page.getByRole('button', { name: /Enregistrer sur cet appareil/ }).first().click();
  await page.goto(`${SHOP}/favorites`);
  await page.locator('section[aria-labelledby=favorites-title] .product-card').first().waitFor({
    timeout: 15000,
  });
});
await check('sitemap lists categories and products with language alternates', async () => {
  const response = await context.request.get(`${SHOP}/sitemap.xml`);
  const xml = await response.text();
  if (!xml.includes('/category/') || !xml.includes(productPath) || !xml.includes('hreflang="en"'))
    throw new Error(`sitemap ${response.status()}`);
});
await check('no CSP violations', async () => {
  if (violations.length) throw new Error(violations[0].slice(0, 160));
});
await browser.close();
for (const r of results) console.log(r.join(' | '));
process.exitCode = results.some((r) => r[0] === 'FAIL') ? 1 : 0;
