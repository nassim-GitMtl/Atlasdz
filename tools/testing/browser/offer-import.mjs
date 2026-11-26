// Bulk price/stock update by CSV in Seller Center (3002, API 3003): the demo seller downloads
// the offers export, changes the stock of one offer, imports the file and sees the result; a
// bad line is reported by number. The original stock is restored at the end. Synthetic data.
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const SC = 'http://127.0.0.1:3002';
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
const offerOf = async (id) =>
  (await fetch(`${API}/api/v1/seller/offers/${id}`, { headers: { authorization: `Bearer ${token}` } })).json();
const offers = (
  await (await fetch(`${API}/api/v1/seller/offers`, { headers: { authorization: `Bearer ${token}` } })).json()
).items.filter((offer) => offer.status === 'APPROVED' && !offer.preorder);
const target = offers[0];
const original = target.availableQuantity;
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })).newPage();
await page.goto(`${SC}/local-login`);
await page.locator('form:has(input[value=seller]) button[type=submit], button[value=seller]').first().click();
await page.waitForTimeout(2000);
await check('the edited export updates the stock and reports a bad line', async () => {
  await page.goto(`${SC}/offers/quick?lang=fr`);
  const download = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Télécharger l’export' }).click(),
  ]).then(([event]) => event);
  const text = (await (await download.createReadStream()).toArray()).map(String).join('');
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const header = lines[0].split(',').map((cell) => cell.replace(/"/g, ''));
  const stockAt = header.indexOf('stock');
  const edited = lines.map((line, index) => {
    if (index === 0 || !line.includes(target.id)) return line;
    const cells = line.split('","');
    cells[stockAt] = String(original + 3);
    return cells.join('","');
  });
  edited.push(`"not-an-offer","x","APPROVED","10.00","1"`);
  const file = join(tmpdir(), 'atlas-offers-import.csv');
  writeFileSync(file, `\uFEFF${edited.join('\r\n')}\r\n`);
  await page.setInputFiles('#import-file', file);
  await page.getByRole('button', { name: 'Importer', exact: true }).click();
  await page.getByText(/1 offre\(s\) mise\(s\) à jour/).waitFor({ timeout: 30000 });
  await page.getByText(new RegExp(`Ligne ${lines.length + 1} : Identifiant d’offre invalide`)).waitFor();
  const after = await offerOf(target.id);
  if (after.availableQuantity !== original + 3) throw new Error(`stock ${after.availableQuantity}`);
});
await browser.close();
// Restore the demo stock.
const current = await offerOf(target.id);
await fetch(`${API}/api/v1/seller/offers/${target.id}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({
    priceMinor: current.priceMinor,
    availableQuantity: original,
    handlingDays: current.handlingDays,
    preorder: current.preorder ?? null,
    expectedVersion: current.rowVersion,
  }),
});
for (const r of results) console.log(r.join(' | '));
process.exitCode = results.some((r) => r[0] === 'FAIL') ? 1 : 0;
