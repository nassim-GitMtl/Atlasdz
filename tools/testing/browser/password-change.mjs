// Password change while signed in, on the local stack (shop 3001, Seller Center 3002, app web
// 8090, API 3003): a shop customer, a staff account (create-staff) and an app customer change
// their password; the old one stops working, the new one signs in. Synthetic data.
import { execFileSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { chromium } from 'playwright';

const SHOP = 'http://127.0.0.1:3001';
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
const first = 'correct horse battery 42';
const second = 'new lantern meadow 77';
const post = (path, body, token) =>
  fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
const customer = async (name) => {
  const email = `${name}-${tag}@example.dz`;
  await post('/api/v1/auth/register/customer', { email, password: first, origin: SHOP });
  const token = (await (await post('/api/v1/auth/login', { email, password: first })).json()).accessToken;
  return { email, token };
};
const swapped = async (email) => {
  const old = await post('/api/v1/auth/login', { email, password: first });
  const fresh = await post('/api/v1/auth/login', { email, password: second });
  if (old.status !== 401 || fresh.status !== 200) throw new Error(`old ${old.status}, new ${fresh.status}`);
};
const browser = await chromium.launch();
await check('shop: a customer changes the password from the account page', async () => {
  const { email, token } = await customer('change-web');
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies([
    { name: 'atlas_customer_session', value: token, url: SHOP, httpOnly: true, sameSite: 'Lax' },
  ]);
  const page = await context.newPage();
  await page.goto(`${SHOP}/account?lang=fr`);
  await page.fill('#change-current', first);
  await page.fill('#change-new', second);
  await page.fill('#change-confirm', 'something else 12');
  await page.getByRole('button', { name: 'Changer le mot de passe' }).click();
  await page.getByText('Les deux nouveaux mots de passe ne correspondent pas.').waitFor({ timeout: 15000 });
  await page.fill('#change-current', first);
  await page.fill('#change-new', second);
  await page.fill('#change-confirm', second);
  await page.getByRole('button', { name: 'Changer le mot de passe' }).click();
  await page.getByText('Mot de passe changé.').waitFor({ timeout: 15000 });
  await page.reload();
  await page.locator('#change-current').waitFor({ timeout: 15000 });
  await swapped(email);
});
await check('Seller Center: staff change the password from Mon compte', async () => {
  const email = `staff-p-${tag}@example.dz`;
  execFileSync('node', ['--env-file=../../.env.local', 'dist/create-staff.js', email], {
    cwd: '/Users/nams/Documents/Amazon/apps/api',
    input: first,
  });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(`${SC}/login`);
  await page.fill('#login-email', email);
  await page.fill('#login-password', first);
  await page.click('form.auth-form button[type=submit]');
  const key = page.locator('.enroll-key');
  await key.waitFor();
  await page.fill('#login-code', totp(base32Decode(await key.innerText()), 1));
  await page.click('form.auth-form button[type=submit]');
  await page.waitForURL(/moderation/, { timeout: 15000 });
  await page.getByRole('link', { name: 'Mon compte' }).click();
  await page.fill('#password-current', 'not the password 1');
  await page.fill('#password-new', second);
  await page.fill('#password-confirm', second);
  await page.getByRole('button', { name: 'Changer le mot de passe' }).click();
  await page.getByText('Mot de passe actuel incorrect.').waitFor({ timeout: 15000 });
  await page.fill('#password-current', first);
  await page.fill('#password-new', second);
  await page.fill('#password-confirm', second);
  await page.getByRole('button', { name: 'Changer le mot de passe' }).click();
  await page.getByText('Mot de passe changé.').waitFor({ timeout: 15000 });
  const old = await post('/api/v1/auth/login', { email, password: first });
  const fresh = await post('/api/v1/auth/login', { email, password: second });
  if (old.status !== 401 || fresh.status !== 200) throw new Error(`old ${old.status}, new ${fresh.status}`);
});
await check('app: a customer changes the password', async () => {
  const { email, token } = await customer('change-app');
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.goto(APP);
  await page.evaluate((value) => {
    localStorage.setItem('atlas.locale', 'fr');
    localStorage.setItem('atlas.session', JSON.stringify({ token: value, actor: 'customer' }));
  }, token);
  await page.goto(`${APP}/account`);
  await page.getByText('Changer le mot de passe').first().click({ timeout: 20000 });
  await page.getByLabel('Mot de passe actuel').fill(first);
  await page.getByLabel('Nouveau mot de passe', { exact: true }).fill(second);
  await page.getByLabel('Confirmer le nouveau mot de passe').fill(second);
  await page.getByRole('button', { name: 'Changer le mot de passe' }).click();
  await page.getByText('Mot de passe changé.').waitFor({ timeout: 15000 });
  await swapped(email);
});
await browser.close();
for (const r of results) console.log(r.join(' | '));
process.exitCode = results.some((r) => r[0] === 'FAIL') ? 1 : 0;
