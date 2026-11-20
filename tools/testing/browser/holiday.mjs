// Seller holiday mode on the local stack (Seller Center 3002, shop 3001, app web 8090, API 3003):
// the demo seller closes from the Seller Center account page; the shop and app store pages show
// the date and its products leave the catalogue; the app's seller account shows it and reopens.
// Synthetic data; the shop is always reopened at the end.
import { chromium } from 'playwright';

const SC = 'http://127.0.0.1:3002';
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
const token = (
  await (
    await fetch(`${API}/api/v1/local/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ account: 'seller' }),
    })
  ).json()
).accessToken;
const reopen = () =>
  fetch(`${API}/api/v1/seller/account/holiday`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ until: null }),
  });
const products = async () =>
  (await (await fetch(`${API}/api/v1/catalog/products?seller=maison-plus&limit=100`)).json()).total;
const before = await products();
const browser = await chromium.launch();
try {
  await check('Seller Center: start holiday mode; the shop hides the offers', async () => {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await page.goto(`${SC}/local-login`);
    await page
      .locator('form:has(input[value=seller]) button[type=submit], button[value=seller]')
      .first()
      .click();
    await page.waitForTimeout(2000);
    await page.goto(`${SC}/account?lang=fr`);
    const day = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    await page.fill('#holiday-until', day);
    await page.getByRole('button', { name: 'Activer le mode congé' }).click();
    await page.getByText('Boutique en congé jusqu’au').waitFor({ timeout: 15000 });
    if ((await products()) !== 0) throw new Error('offers still listed');
    // The offers page reminds the seller.
    await page.goto(`${SC}/offers?lang=fr`);
    await page.getByText('Mode congé : vos offres sont masquées jusqu’au').waitFor({ timeout: 15000 });
  });
  await check('shop and app store pages show the holiday date', async () => {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await page.goto(`${SHOP}/store/maison-plus?lang=fr`);
    await page.getByText('Boutique en congé jusqu’au').waitFor({ timeout: 15000 });
    await page.goto(APP);
    await page.evaluate(() => localStorage.setItem('atlas.locale', 'fr'));
    await page.goto(`${APP}/store/maison-plus`);
    await page.getByText(/Boutique en congé jusqu’au/).waitFor({ timeout: 15000 });
  });
  await check('app seller account: holiday shown, reopen now', async () => {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await page.goto(APP);
    await page.evaluate((value) => {
      localStorage.setItem('atlas.locale', 'fr');
      localStorage.setItem('atlas.session', JSON.stringify({ token: value, actor: 'seller' }));
    }, token);
    await page.goto(`${APP}/dashboard`);
    await page.getByText(/En congé jusqu’au/).first().waitFor({ timeout: 15000 });
    await page.goto(`${APP}/seller-account`);
    await page.getByText(/En congé jusqu’au/).waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: 'Rouvrir maintenant' }).click();
    await page.getByRole('button', { name: '3 jours' }).waitFor({ timeout: 15000 });
    if ((await products()) !== before) throw new Error('offers not back');
  });
} finally {
  await reopen();
  await browser.close();
}
for (const r of results) console.log(r.join(' | '));
process.exitCode = results.some((r) => r[0] === 'FAIL') ? 1 : 0;
