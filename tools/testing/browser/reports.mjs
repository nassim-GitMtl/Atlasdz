// Reported listings on the local stack (shop 3001, Seller Center 3002, app web 8090, API 3003):
// a customer reports a product on the shop, another from the app, staff (create-staff) see both
// on /admin/reports and the dashboard, then dismiss them (the product stays on sale). Synthetic data.
import { execFileSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { chromium } from 'playwright';

const SHOP = 'http://127.0.0.1:3001';
const SC = 'http://127.0.0.1:3002';
const APP = process.env.ATLAS_APP_URL ?? 'http://127.0.0.1:8090';
const API = 'http://127.0.0.1:3003';
const SLUG = 'air-fryer-5l';
const results = [];
const check = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (error) {
    results.push(['FAIL', name, String(error?.message ?? error).split('\n')[0]]);
  }
};
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const base32Decode = (text) => {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of text.replace(/\s+/g, '').toUpperCase()) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
};
const totp = (secret, offset = 0) => {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset));
  const digest = createHmac('sha1', secret).update(counter).digest();
  const at = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(at) & 0x7fffffff) % 1e6).padStart(6, '0');
};
const tag = randomBytes(3).toString('hex');
const password = 'correct horse battery 42';
const customer = async (name) => {
  const email = `${name}-${tag}@example.dz`;
  await fetch(`${API}/api/v1/auth/register/customer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, origin: SHOP }),
  });
  const login = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return (await login.json()).accessToken;
};
const details = `La photo montre un autre modèle. ${tag}`;
const browser = await chromium.launch();
await check('shop: signed-out visitors are asked to sign in', async () => {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.goto(`${SHOP}/product/${SLUG}?lang=fr`);
  await page.getByText('Signaler un problème avec ce produit').click();
  await page.getByRole('link', { name: 'Se connecter pour signaler ce produit' }).waitFor();
});
await check('shop: a signed-in customer reports the product', async () => {
  const token = await customer('report-web');
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies([
    { name: 'atlas_customer_session', value: token, url: SHOP, httpOnly: true, sameSite: 'Lax' },
  ]);
  const page = await context.newPage();
  await page.goto(`${SHOP}/product/${SLUG}?lang=fr`);
  await page.getByText('Signaler un problème avec ce produit').click();
  await page.getByLabel('Motif').selectOption('MISLEADING');
  await page.getByLabel('Détails (facultatif)').fill(details);
  await page.getByRole('button', { name: 'Envoyer le signalement' }).click();
  await page.getByText('L’équipe Atlas DZ va examiner ce produit').waitFor({ timeout: 15000 });
});
await check('app: a signed-in customer reports the product', async () => {
  const token = await customer('report-app');
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.goto(APP);
  await page.evaluate((value) => {
    localStorage.setItem('atlas.locale', 'fr');
    localStorage.setItem('atlas.session', JSON.stringify({ token: value, actor: 'customer' }));
  }, token);
  await page.goto(`${APP}/product/${SLUG}`);
  await page.getByText('Signaler un problème avec ce produit').click({ timeout: 20000 });
  await page.getByRole('radio', { name: 'Contrefaçon' }).click();
  await page.getByRole('button', { name: 'Envoyer le signalement' }).click();
  await page.getByText('L’équipe Atlas DZ va examiner ce produit').waitFor({ timeout: 15000 });
});
await check('staff see both reports and dismiss them', async () => {
  const staffEmail = `staff-r-${tag}@example.dz`;
  execFileSync('node', ['--env-file=../../.env.local', 'dist/create-staff.js', staffEmail], {
    cwd: '/Users/nams/Documents/Amazon/apps/api',
    input: password,
  });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(`${SC}/login`);
  await page.fill('#login-email', staffEmail);
  await page.fill('#login-password', password);
  await page.click('form.auth-form button[type=submit]');
  const key = page.locator('.enroll-key');
  await key.waitFor();
  await page.fill('#login-code', totp(base32Decode(await key.innerText()), 1));
  await page.click('form.auth-form button[type=submit]');
  await page.waitForURL(/moderation/, { timeout: 15000 });
  await page.goto(`${SC}/admin?lang=fr`);
  await page.getByText('Produits signalés à examiner').waitFor({ timeout: 15000 });
  await page.getByRole('link', { name: 'Produits signalés' }).click();
  await page.waitForURL(/admin\/reports/, { timeout: 15000 });
  const row = page.locator('li', { hasText: details });
  await row.getByText(/Description trompeuse \(\d+\)/).waitFor({ timeout: 15000 });
  await row.getByText(/Contrefaçon \(\d+\)/).waitFor();
  await row.getByRole('button', { name: 'Classer sans suite' }).click();
  // The list refreshes: the handled product leaves the queue.
  await row.first().waitFor({ state: 'detached', timeout: 15000 });
  const product = await fetch(`${API}/api/v1/catalog/products/${SLUG}`);
  if (product.status !== 200) throw new Error(`product status ${product.status}`);
});
await browser.close();
for (const r of results) console.log(r.join(' | '));
process.exitCode = results.some((r) => r[0] === 'FAIL') ? 1 : 0;
