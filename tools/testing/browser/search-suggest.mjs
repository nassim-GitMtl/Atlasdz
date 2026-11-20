// Search suggestions: shop header (3001) — typing shows products (accent-tolerant), arrow keys +
// Enter open one, Enter without a highlight still searches, axe scan with the list open, French
// and Arabic at phone width; app web export (8090) — the list under the search box opens a product.
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const SHOP = 'http://127.0.0.1:3001';
const APP = process.env.ATLAS_APP_URL ?? 'http://127.0.0.1:8090';
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
await check('typing shows suggestions; keyboard opens the product', async () => {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.goto(`${SHOP}/?lang=fr`);
  const box = page.getByRole('combobox');
  await box.click();
  await box.pressSequentially('cafe', { delay: 60 });
  const option = page.getByRole('option', { name: /Machine à café/ });
  await option.waitFor({ timeout: 15000 });
  if ((await box.getAttribute('aria-expanded')) !== 'true') throw new Error('not expanded');
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  if (scan.violations.length) throw new Error(scan.violations.map((v) => v.id).join(','));
  const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (over > 0) throw new Error(`overflow ${over}`);
  await box.press('ArrowDown');
  if (!(await box.getAttribute('aria-activedescendant'))) throw new Error('no active option');
  await box.press('Enter');
  await page.waitForURL(/\/product\/coffee-maker-compact/, { timeout: 15000 });
});
await check('Enter without a highlight still searches', async () => {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.goto(`${SHOP}/?lang=fr`);
  const box = page.getByRole('combobox');
  await box.fill('friteuse');
  await box.press('Enter');
  await page.waitForURL(/\/search\?query=friteuse/, { timeout: 15000 });
});
await check('Arabic: suggestions in RTL without overflow', async () => {
  const page = await (await browser.newContext({ viewport: { width: 360, height: 800 } })).newPage();
  await page.goto(`${SHOP}/?lang=ar`);
  const box = page.getByRole('combobox');
  await box.click();
  await box.pressSequentially('قهوه', { delay: 60 });
  await page.getByRole('option').first().waitFor({ timeout: 15000 });
  const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (over > 0) throw new Error(`overflow ${over}`);
});
await check('app: suggestions under the search box open the product', async () => {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.goto(APP);
  await page.evaluate(() => localStorage.setItem('atlas.locale', 'fr'));
  await page.goto(APP);
  const box = page.getByLabel('Rechercher un produit');
  await box.click();
  await box.pressSequentially('ecouteur', { delay: 60 });
  const list = page.getByLabel('Suggestions');
  await list.getByRole('link', { name: /Écouteurs sans fil/ }).first().click({ timeout: 15000 });
  await page.waitForURL(/\/product\/earbuds-wireless/, { timeout: 15000 });
});
await browser.close();
for (const r of results) console.log(r.join(' | '));
process.exitCode = results.some((r) => r[0] === 'FAIL') ? 1 : 0;
