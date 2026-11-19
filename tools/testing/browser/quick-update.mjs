// Seller Center quick update (3002) against the local API (3003) as the demo seller: price and
// stock of several offers saved at once, pre-order terms kept, a row changed elsewhere refused,
// an invalid value reported. Synthetic data only; restores the first offer to in stock.
import { chromium } from 'playwright';
const SC = 'http://127.0.0.1:3002', API = 'http://127.0.0.1:3003';
const results = [];
const check = async (name, fn) => { try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name, String(e?.message ?? e).split('\n')[0]]); } };
const token = (await (await fetch(`${API}/api/v1/local/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account: 'seller' }) })).json()).accessToken;
const call = async (path, init = {}) => { const r = await fetch(API + path, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` } }); if (r.status >= 400) throw new Error(`${path} ${r.status} ${await r.text()}`); return r.json(); };
const offers = (await call('/api/v1/seller/offers')).items.filter((o) => o.status === 'APPROVED').sort((a, b) => a.id.localeCompare(b.id));
const [a, bOffer, c] = offers;
// Give offer A pre-order terms: a quick edit must keep them.
const aNow = await call(`/api/v1/seller/offers/${a.id}`);
await call(`/api/v1/seller/offers/${a.id}`, { method: 'POST', body: JSON.stringify({ priceMinor: aNow.priceMinor, availableQuantity: aNow.availableQuantity, handlingDays: aNow.handlingDays, preorder: { minDays: 12, maxDays: 20, origin: 'Turquie' }, expectedVersion: aNow.rowVersion }) });
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await p.goto(`${SC}/local-login`);
await p.locator('form:has(input[value=seller]) button[type=submit], button[value=seller]').first().click();
await p.waitForTimeout(2000);
const newStock = String((aNow.availableQuantity % 50) + 7);
await check('quick update: stock of one offer, price of another; pre-order kept', async () => {
  await p.goto(`${SC}/offers`);
  await p.getByRole('link', { name: 'Mise à jour rapide' }).click();
  await p.waitForURL(/offers\/quick/);
  await p.locator(`input[name="stock-${a.id}"]`).fill(newStock);
  const bNow = await call(`/api/v1/seller/offers/${bOffer.id}`);
  const newPrice = bNow.priceMinor / 100 + 10;
  await p.locator(`input[name="price-${bOffer.id}"]`).fill(String(newPrice));
  await p.getByRole('button', { name: 'Enregistrer les modifications' }).click();
  await p.getByText('Offres enregistrées : 2').waitFor({ timeout: 15000 });
  const aAfter = await call(`/api/v1/seller/offers/${a.id}`);
  const bAfter = await call(`/api/v1/seller/offers/${bOffer.id}`);
  if (aAfter.availableQuantity !== Number(newStock)) throw new Error(`stock ${aAfter.availableQuantity}`);
  if (JSON.stringify(aAfter.preorder) !== JSON.stringify({ minDays: 12, maxDays: 20, origin: 'Turquie' })) throw new Error(`preorder ${JSON.stringify(aAfter.preorder)}`);
  if (bAfter.priceMinor !== Math.round(newPrice * 100)) throw new Error(`price ${bAfter.priceMinor}`);
  if (bAfter.status !== 'APPROVED') throw new Error(bAfter.status);
  await p.screenshot({ path: '../quick-edit.png', fullPage: false });
});
await check('quick update: a row changed elsewhere is refused, others saved', async () => {
  await p.goto(`${SC}/offers/quick`);
  await p.locator(`input[name="stock-${c.id}"]`).fill('9');
  await p.locator(`input[name="stock-${a.id}"]`).fill('11');
  // Someone edits offer C after the page was loaded.
  const cNow = await call(`/api/v1/seller/offers/${c.id}`);
  await call(`/api/v1/seller/offers/${c.id}`, { method: 'POST', body: JSON.stringify({ priceMinor: cNow.priceMinor, availableQuantity: cNow.availableQuantity + 1, handlingDays: cNow.handlingDays, preorder: cNow.preorder ?? null, expectedVersion: cNow.rowVersion }) });
  await p.getByRole('button', { name: 'Enregistrer les modifications' }).click();
  await p.getByText(/Offres enregistrées : 1 · non enregistrées : 1/).waitFor({ timeout: 15000 });
  await p.getByText('Modifiée ailleurs entre-temps : rechargez la page.').waitFor();
  const cAfter = await call(`/api/v1/seller/offers/${c.id}`);
  if (cAfter.availableQuantity !== cNow.availableQuantity + 1) throw new Error('overwritten');
});
await check('quick update: invalid value is reported, nothing sent', async () => {
  await p.goto(`${SC}/offers/quick`);
  await p.locator(`input[name="price-${c.id}"]`).fill('-5');
  await p.getByRole('button', { name: 'Enregistrer les modifications' }).click();
  await p.getByText(/non enregistrées : 1/).waitFor({ timeout: 15000 });
  const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (over > 0) throw new Error(`overflow ${over}`);
});
// Restore A to in stock (no pre-order) for other suites.
const aEnd = await call(`/api/v1/seller/offers/${a.id}`);
await call(`/api/v1/seller/offers/${a.id}`, { method: 'POST', body: JSON.stringify({ priceMinor: aEnd.priceMinor, availableQuantity: Math.max(aEnd.availableQuantity, 30), handlingDays: aEnd.handlingDays, preorder: null, expectedVersion: aEnd.rowVersion }) });
await b.close();
for (const r of results) console.log(r.join(' | '));
