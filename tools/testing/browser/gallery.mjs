// Product photo gallery on the local stack: Seller Center (3002), shop (3001), app web export
// (8090, built with EXPO_PUBLIC_API_URL on the API) and the local API (3003). Uses the demo
// seller and a staff account made with create-staff; synthetic catalogue data only.
import { chromium } from 'playwright';
import { createHmac, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
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
  const c = Buffer.alloc(8);
  c.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset));
  const d = createHmac('sha1', secret).update(c).digest();
  const o = d[d.length - 1] & 15;
  return String((d.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}
const until = async (fn, ms = 15000) => {
  const end = Date.now() + ms;
  for (;;) {
    if (await fn()) return;
    if (Date.now() > end) throw new Error('condition not met');
    await new Promise((r) => setTimeout(r, 300));
  }
};
const SC = 'http://127.0.0.1:3002',
  SHOP = 'http://127.0.0.1:3001',
  APP = 'http://127.0.0.1:8090',
  API = 'http://127.0.0.1:3003';
const SHOTS = new URL('./mobile-shots/', import.meta.url).pathname;
const results = [];
const check = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (e) {
    results.push(['FAIL', name, String(e?.message ?? e).split('\n')[0]]);
  }
};
const b = await chromium.launch();
// Test images: solid-colour PNG screenshots.
const shotPage = await b.newPage({ viewport: { width: 400, height: 400 } });
const image = async (color) => {
  await shotPage.setContent(`<body style="margin:0;background:${color}"></body>`);
  return shotPage.screenshot({ type: 'png' });
};
const red = await image('#d33'),
  green = await image('#2a2'),
  blue = await image('#33d');

const session = async (account) =>
  (
    await (
      await fetch(API + '/api/v1/local/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ account }),
      })
    ).json()
  ).accessToken;
const sellerToken = await session('seller');
const subs = (
  await (
    await fetch(API + '/api/v1/seller/products', {
      headers: { authorization: `Bearer ${sellerToken}` },
    })
  ).json()
).items;
const catalog = (await (await fetch(API + '/api/v1/catalog/products?limit=100')).json()).items;
const sub = subs.find(
  (s) =>
    s.status === 'APPROVED' &&
    s.revisionOfSubmissionId === null &&
    catalog.some((p) => p.id === s.productId),
);
const product = catalog.find((p) => p.id === sub.productId);
const detail = async () =>
  await (await fetch(`${API}/api/v1/catalog/products/${product.slug}`)).json();
// Start clean: remove any extra photos left by an earlier run.
for (const photo of sub.gallery ?? [])
  await fetch(`${API}/api/v1/seller/products/${sub.productId}/gallery/${photo.id}/remove`, {
    method: 'POST',
    headers: { authorization: `Bearer ${sellerToken}` },
  });
const coverBefore = (await detail()).imageUrl;
console.log('product', product.slug, sub.title.fr, coverBefore);

const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
const card = () => p.locator('article', { hasText: sub.title.fr }).first();
await check('Seller Center: add two extra photos', async () => {
  await p.goto(`${SC}/local-login`);
  await p
    .locator('form:has(input[value=seller]) button[type=submit], button[value=seller]')
    .first()
    .click();
  await p.waitForTimeout(2000);
  for (const [i, buffer] of [red, green].entries()) {
    await p.goto(`${SC}/products`);
    const input = card().locator(`#gallery-${sub.productId}`);
    await input.setInputFiles({ name: `extra-${i}.png`, mimeType: 'image/png', buffer });
    await card().getByRole('button', { name: 'Ajouter la photo' }).click();
    await card().getByText('Photo publiée.').waitFor({ timeout: 15000 });
  }
  const g = (await detail()).gallery;
  if (g.length !== 2) throw new Error(`gallery ${g.length}`);
});
await check('Seller Center: photo strip shows main + 2 extras', async () => {
  await p.goto(`${SC}/products`);
  await card().getByRole('heading', { name: 'Photos du produit' }).waitFor();
  const n = await card().locator('.photo-strip li').count();
  if (n !== 3) throw new Error(`strip items ${n}`);
  await card().scrollIntoViewIfNeeded();
  await p.screenshot({ path: SHOTS + 'sc-gallery.png', fullPage: false });
});
let firstExtra;
await check('Seller Center: make an extra photo the main photo', async () => {
  firstExtra = (await detail()).gallery[0];
  await card()
    .locator('.photo-strip li')
    .nth(1)
    .getByRole('button', { name: 'Mettre en photo principale' })
    .click();
  await until(async () => (await detail()).imageUrl === firstExtra);
  await until(
    async () =>
      (await card().locator('.photo-strip li').first().locator('img').getAttribute('src')) ===
      firstExtra.replace('.webp', '-640.webp'),
  );
  const d = await detail();
  if (d.imageUrl !== firstExtra) throw new Error(`cover ${d.imageUrl}`);
  if (!d.gallery.includes(coverBefore) || d.gallery.length !== 2)
    throw new Error(`gallery ${d.gallery}`);
});
await check('Shop: thumbnails switch the large photo', async () => {
  const sp = await ctx.newPage();
  await sp.goto(`${SHOP}/product/${product.slug}`);
  const thumbs = sp.getByRole('group', { name: 'Photos du produit' }).getByRole('button');
  await thumbs.first().waitFor({ timeout: 15000 });
  if ((await thumbs.count()) !== 3) throw new Error(`thumbs ${await thumbs.count()}`);
  const big = sp.locator('.product-detail__image img');
  const before = await big.getAttribute('src');
  await thumbs.nth(2).click();
  await sp.waitForFunction(
    (b) => document.querySelector('.product-detail__image img')?.getAttribute('src') !== b,
    before,
  );
  if ((await thumbs.nth(2).getAttribute('aria-pressed')) !== 'true') throw new Error('pressed');
  const over = await sp.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (over > 0) throw new Error(`overflow ${over}`);
  await sp.screenshot({ path: SHOTS + 'shop-gallery.png' });
  const wide = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await wide.goto(`${SHOP}/product/${product.slug}?lang=ar`);
  await wide.getByRole('group', { name: 'صور المنتج' }).waitFor();
  await wide.screenshot({ path: SHOTS + 'shop-gallery-ar.png' });
  await wide.close();
});
await check('App: thumbnails on the product screen', async () => {
  const ap = await ctx.newPage();
  await ap.goto(APP);
  await ap.evaluate(() => localStorage.setItem('atlas.locale', 'fr'));
  await ap.goto(`${APP}/product/${product.slug}`);
  const thumbs = ap.getByRole('button', { name: /^Photos du produit \d\/3$/ });
  await thumbs.first().waitFor({ timeout: 15000 });
  if ((await thumbs.count()) !== 3) throw new Error(`thumbs ${await thumbs.count()}`);
  await thumbs.nth(1).click();
  await ap.getByRole('img', { name: /\(2\/3\)$/ }).waitFor();
  await ap.screenshot({ path: SHOTS + 'app-gallery.png' });
});
await check('Seller Center: remove an extra photo', async () => {
  await p.goto(`${SC}/products`);
  await card().locator('.photo-strip li').nth(1).getByRole('button', { name: 'Retirer' }).click();
  await until(async () => (await detail()).gallery.length === 1);
  await until(async () => (await card().locator('.photo-strip li').count()) === 2);
  const d = await detail();
  if (d.gallery.length !== 1) throw new Error(`gallery ${d.gallery.length}`);
});
await check('Staff: take down an extra photo by its address', async () => {
  const left = (await detail()).gallery[0];
  const sc = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const email = `staff-gallery-${randomBytes(3).toString('hex')}@example.dz`,
    password = 'correct horse battery 42';
  execFileSync('node', ['--env-file=../../.env.local', 'dist/create-staff.js', email], {
    cwd: '/Users/nams/Documents/Amazon/apps/api',
    input: password,
  });
  await sc.goto(`${SC}/login`);
  await sc.fill('#login-email', email);
  await sc.fill('#login-password', password);
  await sc.click('form.auth-form button[type=submit]');
  const key = sc.locator('.enroll-key');
  await key.waitFor();
  await sc.fill('#login-code', totp(base32Decode(await key.innerText()), 1));
  await sc.click('form.auth-form button[type=submit]');
  await sc.waitForURL(/moderation/, { timeout: 15000 });
  await sc.goto(`${SC}/admin`);
  await sc.fill('#photo-product', `${SHOP}/product/${product.slug}`);
  await sc.fill('#photo-address', `${SHOP}${left}`);
  await sc.locator('form:has(#photo-address) button[type=submit]').click();
  await until(async () => (await detail()).gallery.length === 0);
  await sc.locator('form:has(#photo-address)').scrollIntoViewIfNeeded();
  await sc.screenshot({ path: SHOTS + 'admin-gallery.png' });
  const d = await detail();
  if (d.gallery.length !== 0) throw new Error(`gallery ${d.gallery.length}`);
  const gone = await fetch(API + left);
  if (gone.status !== 404) throw new Error(`file ${gone.status}`);
});
// Restore the original cover so the demo catalogue stays as it was.
const back = await detail();
if (back.imageUrl !== coverBefore) console.log('note: cover now', back.imageUrl);
await b.close();
for (const r of results) console.log(r.join(' | '));
process.exitCode = results.some((r) => r[0] === 'FAIL') ? 1 : 0;
