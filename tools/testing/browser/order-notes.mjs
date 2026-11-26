// Private order follow-up on the local stack (Seller Center 3002, app web 8090, API 3003): the
// demo seller records a call outcome with a note in Seller Center; the app's seller order screen
// shows it; the customer's view of the order never contains it. Synthetic data.
import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright';

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
const seller = await session('seller');
const orders = (
  await (await fetch(`${API}/api/v1/seller/orders`, { headers: { authorization: `Bearer ${seller}` } })).json()
).items;
const target = orders[0];
const note = `Rappeler après 17 h ${randomBytes(2).toString('hex')}`;
const browser = await chromium.launch();
await check('Seller Center: the seller records a confirmed call with a note', async () => {
  if (!target) throw new Error('no seller order');
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(`${SC}/local-login`);
  await page.locator('form:has(input[value=seller]) button[type=submit], button[value=seller]').first().click();
  await page.waitForTimeout(2000);
  await page.goto(`${SC}/orders/${target.id}?lang=fr`);
  await page.fill('#note-body', note);
  await page.getByRole('button', { name: 'Confirmée par téléphone' }).click();
  await page.locator('.order-notes__list').getByText(note).waitFor({ timeout: 15000 });
  if ((await page.locator('#note-body').inputValue()) !== '') throw new Error('form not cleared');
});
await check('app: the seller order screen shows the follow-up', async () => {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.goto(APP);
  await page.evaluate((token) => {
    localStorage.setItem('atlas.locale', 'fr');
    localStorage.setItem('atlas.session', JSON.stringify({ token, actor: 'seller' }));
  }, seller);
  await page.goto(`${APP}/seller/order/${target.id}`);
  await page.getByText('Suivi interne').waitFor({ timeout: 20000 });
  await page.getByText(note, { exact: false }).first().waitFor({ timeout: 15000 });
});
await check('the customer never sees the note', async () => {
  const customer = await session('customer');
  const view = await fetch(`${API}/api/v1/orders/${target.orderId}`, { headers: { authorization: `Bearer ${customer}` } });
  const text = await view.text();
  if (text.includes(note)) throw new Error('note leaked to the customer');
});
await browser.close();
for (const r of results) console.log(r.join(' | '));
process.exitCode = results.some((r) => r[0] === 'FAIL') ? 1 : 0;
