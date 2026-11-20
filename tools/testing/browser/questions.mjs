// Product questions on the local stack (shop 3001, Seller Center 3002, app web 8090, API 3003):
// a registered customer asks on the shop, the demo seller answers in Seller Center, the shop and
// the app show the answer, a staff account (create-staff) hides the question. Synthetic data.
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
const email = `question-${tag}@example.dz`;
await fetch(`${API}/api/v1/auth/register/customer`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password, origin: SHOP }),
});
const customerToken = (
  await (
    await fetch(`${API}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
  ).json()
).accessToken;
const question = `Le panier passe-t-il au lave-vaisselle ? ${tag}`;
const answer = `Oui, le panier seul. ${tag}`;
const browser = await chromium.launch();
await check('shop: a signed-in customer asks', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies([
    { name: 'atlas_customer_session', value: customerToken, url: SHOP, httpOnly: true, sameSite: 'Lax' },
  ]);
  const page = await context.newPage();
  await page.goto(`${SHOP}/product/${SLUG}?lang=fr`);
  await page.getByLabel('Votre question').fill(question);
  await page.getByRole('button', { name: 'Envoyer la question' }).click();
  await page.getByText('Question envoyée').waitFor({ timeout: 15000 });
  await page.getByText(question).waitFor({ timeout: 15000 });
});
await check('Seller Center: the seller answers', async () => {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.goto(`${SC}/local-login`);
  await page
    .locator('form:has(input[value=seller]) button[type=submit], button[value=seller]')
    .first()
    .click();
  await page.waitForTimeout(2000);
  await page.goto(`${SC}/questions?lang=fr`);
  const card = page.locator('article', { hasText: question });
  await card.locator('textarea').fill(answer);
  await card.getByRole('button', { name: 'Répondre' }).click();
  await card.getByText('Réponse publiée.').waitFor({ timeout: 15000 });
});
await check('shop and app show the answer', async () => {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.goto(`${SHOP}/product/${SLUG}?lang=fr`);
  await page.getByText(answer).waitFor({ timeout: 15000 });
  await page.goto(APP);
  await page.evaluate(() => localStorage.setItem('atlas.locale', 'fr'));
  await page.goto(`${APP}/product/${SLUG}`);
  await page.getByText(answer).waitFor({ timeout: 15000 });
});
await check('staff hide the question', async () => {
  const staffEmail = `staff-q-${tag}@example.dz`;
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
  await page.goto(`${SC}/admin/questions?lang=fr`);
  const row = page.locator('li', { hasText: question });
  await row.getByRole('button', { name: 'Masquer' }).click();
  // The list refreshes: the row now shows HIDDEN and no longer offers the button.
  await row.getByText(/HIDDEN/).waitFor({ timeout: 15000 });
  const list = await (await fetch(`${API}/api/v1/catalog/products/${SLUG}/questions`)).json();
  if (list.items.some((item) => item.body === question)) throw new Error('still public');
});
await browser.close();
for (const r of results) console.log(r.join(' | '));
process.exitCode = results.some((r) => r[0] === 'FAIL') ? 1 : 0;
