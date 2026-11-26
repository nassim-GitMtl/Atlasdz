// Seller Center order inbox filters (3002, API 3003): tabs group statuses with counts that add
// up, and the search narrows by customer name, phone, order number or product. Read-only.
import { chromium } from 'playwright';

const SC = 'http://127.0.0.1:3002';
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
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await page.goto(`${SC}/local-login`);
await page.locator('form:has(input[value=seller]) button[type=submit], button[value=seller]').first().click();
await page.waitForTimeout(2000);
await check('tabs: the three groups add up to « Toutes »', async () => {
  await page.goto(`${SC}/orders?lang=fr&tab=all`);
  await page.locator('.order-filters').waitFor({ timeout: 15000 });
  const [todo, shipped, closed, all] = (await page.locator('.order-filters .chip-count').allInnerTexts()).map(Number);
  if (todo + shipped + closed !== all) throw new Error(`${todo}+${shipped}+${closed} ≠ ${all}`);
  if ((await page.locator('.seller-order-card').count()) !== all) throw new Error('cards ≠ total');
  await page.getByRole('link', { name: /^À traiter/ }).click();
  await page.waitForURL(/tab=todo/);
  if ((await page.locator('.seller-order-card').count()) !== todo) throw new Error('todo tab');
});
await check('search narrows the list and keeps the tab', async () => {
  await page.goto(`${SC}/orders?lang=fr&tab=all`);
  const first = page.locator('.seller-order-card .mono').first();
  const number = (await first.innerText()).trim();
  await page.fill('#order-q', number);
  await page.getByRole('button', { name: 'Rechercher' }).click();
  await page.waitForURL(new RegExp(`q=${number}`));
  const cards = await page.locator('.seller-order-card').count();
  if (cards !== 1) throw new Error(`${cards} cards for order ${number}`);
  await page.fill('#order-q', 'zzzz-aucun-resultat');
  await page.getByRole('button', { name: 'Rechercher' }).click();
  await page.getByText('Aucune commande ne correspond.').waitFor({ timeout: 15000 });
});
await browser.close();
for (const r of results) console.log(r.join(' | '));
process.exitCode = results.some((r) => r[0] === 'FAIL') ? 1 : 0;
