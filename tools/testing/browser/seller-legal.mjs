// Seller legal identity (law 18-05) on the local stack: the demo seller fills it in from the
// Seller Center account page; the shop store page and the app store screen show it; an
// invalid NIF is refused. Synthetic data.
import { chromium } from 'playwright';

const SC = 'http://127.0.0.1:3002';
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
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await check('Seller Center: invalid NIF refused, then the identity is saved', async () => {
  await page.goto(`${SC}/local-login`);
  await page
    .locator('form:has(input[value=seller]) button[type=submit], button[value=seller]')
    .first()
    .click();
  await page.waitForTimeout(2000);
  await page.goto(`${SC}/account?lang=fr`);
  await page.fill('#account-legal-name', 'Maison Plus SARL');
  await page.selectOption('#account-register-kind', 'COMMERCE');
  await page.fill('#account-register-number', '16/00-7654321B19');
  await page.fill('#account-tax-id', '1234');
  await page.fill('#account-address', '8 rue Hassiba Ben Bouali, Alger');
  await page.fill('#account-phone', '+213 21 00 00 00');
  await page.fill('#account-contact-email', 'contact@maisonplus.example.dz');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByText('Vérifiez les informations légales').waitFor({ timeout: 15000 });
  await page.fill('#account-tax-id', '000216007654321');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByText('Informations légales enregistrées.').waitFor({ timeout: 15000 });
});
await check('shop and app store pages show it', async () => {
  await page.goto(`${SHOP}/store/maison-plus?lang=fr`);
  await page.getByText('Informations légales du vendeur').click({ timeout: 15000 });
  await page.getByText('16/00-7654321B19').waitFor();
  await page.getByText('000216007654321').waitFor();
  const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (over > 0) throw new Error(`overflow ${over}`);
  await page.goto(APP);
  await page.evaluate(() => localStorage.setItem('atlas.locale', 'fr'));
  await page.goto(`${APP}/store/maison-plus`);
  await page.getByText(/16\/00-7654321B19/).waitFor({ timeout: 15000 });
});
await browser.close();
for (const r of results) console.log(r.join(' | '));
process.exitCode = results.some((r) => r[0] === 'FAIL') ? 1 : 0;
