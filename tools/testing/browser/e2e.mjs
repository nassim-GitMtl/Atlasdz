/* global document, window -- referenced inside page.evaluate (runs in the browser) */
import { createHmac, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const SHOP = 'http://127.0.0.1:3001';
const SELLER = 'http://127.0.0.1:3002';
// Path to the local API log (LOCAL mail is logged there, including verification links).
const API_LOG = process.env.ATLAS_API_LOG ?? '/tmp/atlas-local-api.log';
const REPO = '/Users/nams/Documents/Amazon';
const tag = randomBytes(3).toString('hex');
const password = 'correct horse battery 42';
const results = [];
const a11y = [];

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Decode(text) {
  let bits = 0,
    value = 0;
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
}
function totp(secret, offset = 0) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset));
  const d = createHmac('sha1', secret).update(counter).digest();
  const o = d[d.length - 1] & 15;
  return String((d.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}
const tokenFromLog = (email, kind) => {
  const lines = readFileSync(API_LOG, 'utf8')
    .split('\n')
    .filter((l) => l.includes(email) && l.includes(kind));
  const match = /token=([A-Za-z0-9_-]{43})/.exec(lines.at(-1) ?? '');
  return match?.[1];
};
async function check(name, fn) {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (error) {
    results.push(['FAIL', name, String(error?.message ?? error).split('\n')[0]]);
  }
}
async function audit(page, label) {
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  for (const v of scan.violations)
    a11y.push(
      `${label}: [${v.impact}] ${v.id} (${v.nodes.length}) ${v.help} :: ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(' ') + ' ' + (n.any[0]?.message ?? '').slice(0, 90))
        .join(' || ')}`,
    );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  if (overflow) a11y.push(`${label}: horizontal overflow at ${page.viewportSize()?.width}px`);
}

const browser = await chromium.launch();
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
const page = await mobile.newPage();
const customerEmail = `client-${tag}@example.dz`;

await check('shop home renders', async () => {
  await page.goto(SHOP + '/');
  await audit(page, 'shop /');
});
await check('legal pages linked from footer and rendered', async () => {
  await page.click('footer a[href*="/legal/conditions"]');
  await page.waitForURL(/legal\/conditions/);
  if (!(await page.locator('h1').innerText()).includes('Conditions')) throw new Error('no title');
  await audit(page, 'shop /legal/conditions');
  await page.goto(SHOP + '/legal/confidentialite?lang=ar');
  if ((await page.locator('html').getAttribute('dir')) !== 'rtl') throw new Error('arabic not rtl');
  await audit(page, 'shop /legal/confidentialite (ar)');
});
await check('customer registers through the form', async () => {
  await page.goto(SHOP + '/login');
  await audit(page, 'shop /login');
  await page.fill('#register-email', customerEmail);
  await page.fill('#register-password', password);
  await page.click('form:has(#register-email) button[type=submit]');
  await page.waitForURL(/\/cart/, { timeout: 15000 });
});
await check('account page shows unverified email', async () => {
  await page.goto(SHOP + '/account');
  await page.getByText('Non confirmée').waitFor();
  await audit(page, 'shop /account');
});
await check('email verification link confirms the address', async () => {
  let token;
  for (let i = 0; i < 20 && !token; i += 1) {
    token = tokenFromLog(customerEmail, 'verify-email');
    if (!token) await new Promise((r) => setTimeout(r, 250));
  }
  if (!token) throw new Error('verification mail not logged');
  await page.goto(`${SHOP}/verify-email?token=${token}`);
  await page.getByText('Adresse e-mail confirmée').waitFor();
  await audit(page, 'shop /verify-email');
  await page.goto(SHOP + '/account');
  await page.getByText('Confirmée').waitFor();
});
await check('forgot-password page accepts a request', async () => {
  await page.goto(SHOP + '/forgot-password');
  await audit(page, 'shop /forgot-password');
  await page.fill('#forgot-email', customerEmail);
  await page.click('form:has(#forgot-email) button[type=submit]');
  await page.getByText('Si un compte existe').waitFor();
});

await check('guest buys without an account: email only, then a set-password link', async () => {
  const guestEmail = `invite-${tag}@example.dz`;
  const guest = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'fr-FR',
  });
  const gp = await guest.newPage();
  await gp.goto(SHOP + '/login?next=/cart');
  await gp.fill('#guest-email', guestEmail);
  await gp.click('form:has(#guest-email) button[type=submit]');
  // The login URL itself contains "next=/cart": wait for the cart page, not the query.
  await gp.waitForURL((url) => url.pathname === '/cart', { timeout: 15000 });
  await gp.goto(SHOP + '/account');
  await gp.getByText(guestEmail).waitFor({ timeout: 15000 });
  // The same address again must sign in instead.
  await gp.context().clearCookies();
  await gp.goto(SHOP + '/login');
  await gp.fill('#guest-email', guestEmail);
  await gp.click('form:has(#guest-email) button[type=submit]');
  await gp.getByText('Un compte existe déjà avec cet e-mail').waitFor({ timeout: 15000 });
  let token;
  for (let i = 0; i < 20 && !token; i += 1) {
    token = tokenFromLog(guestEmail, 'welcome=1');
    if (!token) await new Promise((r) => setTimeout(r, 250));
  }
  if (!token) throw new Error('set-password mail not logged');
  await gp.goto(`${SHOP}/reset-password?token=${token}&welcome=1`);
  await gp.getByText('Choisissez votre mot de passe').first().waitFor();
  await audit(gp, 'shop /reset-password (welcome)');
  await gp.fill('#reset-password', password);
  await gp.click('form:has(#reset-password) button[type=submit]');
  await gp.getByText('Mot de passe modifié').waitFor({ timeout: 15000 });
  await guest.close();
});

await check('buyer rates a delivered item from the order page', async () => {
  const API = process.env.ATLAS_API_URL ?? 'http://127.0.0.1:3003';
  const json = async (path, token, init = {}) => {
    const r = await fetch(API + path, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
    const body = await r.text();
    if (r.status >= 400) throw new Error(`${path} → ${r.status} ${body}`);
    return body ? JSON.parse(body) : undefined;
  };
  const session = async (account) =>
    (
      await json('/api/v1/local/session', null, {
        method: 'POST',
        body: JSON.stringify({ account }),
      })
    ).accessToken;
  // The local demo customer orders; the demo seller delivers through the API.
  const customer = await session('customer');
  const seller = await session('seller');
  const stocked = new Set(
    (await json('/api/v1/seller/offers', seller)).items
      .filter((o) => o.status === 'APPROVED' && o.availableQuantity > 0)
      .map((o) => o.id),
  );
  const place = (await json('/api/v1/delivery/destinations', seller)).items.find(
    (d) => d.dataClass === 'synthetic',
  );
  const offer = (await json('/api/v1/catalog/products?limit=100')).items
    .flatMap((p) => p.offers)
    .find((o) => stocked.has(o.id));
  let cart = await json('/api/v1/cart', customer);
  for (const line of cart.items)
    cart = await json(`/api/v1/cart/items/${line.offerId}`, customer, {
      method: 'PUT',
      body: JSON.stringify({ quantity: 0, expectedVersion: cart.version }),
    });
  cart = await json(`/api/v1/cart/items/${offer.id}`, customer, {
    method: 'PUT',
    body: JSON.stringify({ quantity: 1, expectedVersion: cart.version }),
  });
  const quote = await json('/api/v1/checkout/quotes', customer, {
    method: 'POST',
    body: JSON.stringify({
      expectedCartVersion: cart.version,
      destinationId: place.id,
      deliveryContact: {
        recipientName: 'Leila M.',
        phone: '0555443322',
        addressLine: '7 rue Didouche Mourad',
        city: 'Alger',
      },
    }),
  });
  const order = await json(`/api/v1/checkout/quotes/${quote.id}/place`, customer, {
    method: 'POST',
    headers: { 'idempotency-key': quote.id },
    body: '{}',
  });
  const so = order.sellerOrders[0];
  for (const step of [
    { action: 'ACCEPT', expectedVersion: 1 },
    { action: 'PREPARE', expectedVersion: 2 },
    {
      action: 'SHIP',
      expectedVersion: 3,
      shipment: {
        method: 'SELLER_ARRANGED_TEST',
        carrier: 'Yalidine',
        trackingReference: 'YAL-W1',
      },
    },
    { action: 'REPORT_DELIVERY', expectedVersion: 4 },
  ])
    await json(`/api/v1/seller/orders/${so.id}/transition`, seller, {
      method: 'POST',
      body: JSON.stringify(step),
    });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  const rp = await ctx.newPage();
  await rp.goto(SHOP + '/login');
  await rp.click('.auth-local form button[type=submit]');
  await rp.waitForURL((url) => url.pathname === '/cart', { timeout: 15000 });
  await rp.goto(`${SHOP}/orders/${order.id}`);
  await rp.getByText('Noter mes articles').first().waitFor({ timeout: 15000 });
  await rp.locator('fieldset.review-stars label').nth(3).click();
  await rp.locator('.review-form textarea').first().fill(`Très bon produit (${tag}).`);
  await audit(rp, 'shop /orders (rate)');
  await rp.locator('.review-form button[type=submit]').first().click();
  await rp.getByText('Merci ! Votre avis est enregistré.').waitFor({ timeout: 15000 });
  await ctx.close();
});

// Seller Center (agent browser access needs the owner's approval: ATLAS_E2E_SHOP_ONLY=1 skips it)
if (process.env.ATLAS_E2E_SHOP_ONLY === '1') {
  await browser.close();
  for (const r of results) console.log(r.join(' | '));
  console.log(`ACCESSIBILITY (${a11y.length})`);
  for (const f of a11y) console.log(' - ' + f);
  process.exit(results.some((r) => r[0] === 'FAIL') ? 1 : 0);
}
// Seller Center
const sellerEmail = `vendeur-${tag}@example.dz`;
const sp = await mobile.newPage();
let sellerSecret;
await check('seller registers through the form', async () => {
  await sp.goto(SELLER + '/register');
  await audit(sp, 'seller /register');
  await sp.fill('#reg-store', `Boutique ${tag}`);
  await sp.fill('#reg-email', sellerEmail);
  await sp.fill('#reg-password', password);
  await sp.fill('#reg-fr', 'Artisanat local');
  await sp.fill('#reg-ar', 'صناعة تقليدية');
  await sp.click('form.auth-form button[type=submit]');
  await sp.waitForURL(/\/login.*registered=1/, { timeout: 15000 });
  await audit(sp, 'seller /login');
});
await check('seller enrolls an authenticator and reaches the pending account page', async () => {
  await sp.fill('#login-email', sellerEmail);
  await sp.fill('#login-password', password);
  await sp.click('form.auth-form button[type=submit]');
  const key = sp.locator('.enroll-key');
  await key.waitFor();
  await audit(sp, 'seller /login (enrollment)');
  sellerSecret = base32Decode(await key.innerText());
  await sp.fill('#login-code', totp(sellerSecret));
  await sp.click('form.auth-form button[type=submit]');
  await sp.waitForURL(/\/account/, { timeout: 15000 });
  await sp.getByText('en cours de vérification').waitFor();
  await audit(sp, 'seller /account');
});

const staffEmail = `staff-${tag}@example.dz`;
const st = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await check('staff approves the seller and opens the admin page', async () => {
  execFileSync('node', ['--env-file=../../.env.local', 'dist/create-staff.js', staffEmail], {
    cwd: `${REPO}/apps/api`,
    input: password,
  });
  await st.goto(SELLER + '/login');
  await st.fill('#login-email', staffEmail);
  await st.fill('#login-password', password);
  await st.click('form.auth-form button[type=submit]');
  const key = st.locator('.enroll-key');
  await key.waitFor();
  await st.fill('#login-code', totp(base32Decode(await key.innerText()), 1));
  await st.click('form.auth-form button[type=submit]');
  await st.waitForURL(/moderation\/sellers/, { timeout: 15000 });
  await audit(st, 'seller /moderation/sellers');
  const card = st.locator('li', { hasText: `Boutique ${tag}` });
  await card.locator('button[value=APPROVE]').click();
  await st.waitForURL(/reviewed=1/, { timeout: 15000 });
  await st.goto(SELLER + '/admin');
  await st.getByRole('heading', { name: 'Indicateurs' }).waitFor();
  await audit(st, 'seller /admin');
});
await check('approved seller sees approval status', async () => {
  await sp.goto(SELLER + '/account');
  await sp.getByText('Votre boutique est validée').waitFor();
});

await browser.close();
for (const r of results) console.log(r.join(' | '));
console.log(`\nACCESSIBILITY/LAYOUT FINDINGS (${a11y.length}):`);
for (const f of a11y) console.log(' - ' + f);
process.exitCode = results.some((r) => r[0] === 'FAIL') ? 1 : 0;
