// "Delivered to my commune" catalogue filter on the local stack (shop 3001, app web 8090,
// API 3003): the shop search form and the app filter panel keep only products a seller delivers
// to the chosen test destination; the result count matches the API. Synthetic data.
import { chromium } from 'playwright';

const SHOP = 'http://127.0.0.1:3001';
const APP = process.env.ATLAS_APP_URL ?? 'http://127.0.0.1:8090';
const API = 'http://127.0.0.1:3003';
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
const all = await (await fetch(`${API}/api/v1/catalog/products?limit=1`)).json();
const filtered = await (
  await fetch(`${API}/api/v1/catalog/products?limit=100&deliversTo=${DESTINATION}`)
).json();
const destinations = (await (await fetch(`${API}/api/v1/delivery/destinations`)).json()).items;
const place = destinations.find((item) => item.id === DESTINATION);
const browser = await chromium.launch();
await check('API: the filter narrows the catalogue to deliverable products', async () => {
  if (!(filtered.total > 0)) throw new Error('no product delivered to the test destination');
  if (!(filtered.total <= all.total)) throw new Error(`${filtered.total} > ${all.total}`);
});
await check('shop: choosing a commune in the search filters applies it', async () => {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.goto(`${SHOP}/search?lang=fr`);
  await page.getByRole('button', { name: 'Choisir ma commune' }).click();
  await page.getByLabel('Wilaya').selectOption('test');
  await page.getByLabel('Commune').selectOption(DESTINATION);
  await page.getByRole('button', { name: 'Appliquer' }).click();
  await page.waitForURL(new RegExp(`commune=${DESTINATION}`), { timeout: 15000 });
  const count = await page.locator('.result-count strong').innerText();
  if (Number(count) !== filtered.total) throw new Error(`shop shows ${count}, API ${filtered.total}`);
  // The chosen commune stays selected (name shown) after the reload.
  await page.getByLabel('Commune').locator(`option[value="${DESTINATION}"]`).waitFor({ state: 'attached' });
  if ((await page.getByLabel('Commune').inputValue()) !== DESTINATION) throw new Error('not kept');
});
await check('app: the filter panel keeps deliverable products', async () => {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.goto(APP);
  await page.evaluate(() => localStorage.setItem('atlas.locale', 'fr'));
  await page.goto(APP);
  await page.getByRole('button', { name: /^Filtres/ }).click({ timeout: 20000 });
  // The lists are long and virtualized: narrow them with the picker's search box.
  await page.getByRole('button', { name: /^Wilaya:/ }).click();
  await page.getByPlaceholder('Rechercher').last().fill('test');
  await page.getByText('Destinations de test').last().click({ timeout: 15000 });
  await page.getByRole('button', { name: /^Commune:/ }).click();
  await page.getByPlaceholder('Rechercher').last().fill(place.name.fr);
  await page.getByText(place.name.fr).last().click({ timeout: 15000 });
  await page.getByRole('button', { name: /^Filtres · 1/ }).waitFor({ timeout: 15000 });
  await page.getByText(filtered.items[0].title.fr).first().waitFor({ timeout: 20000 });
});
await browser.close();
for (const r of results) console.log(r.join(' | '));
process.exitCode = results.some((r) => r[0] === 'FAIL') ? 1 : 0;
