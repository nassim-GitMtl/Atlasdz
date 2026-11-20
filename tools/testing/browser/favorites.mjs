// Shop favorites page (3001) on the local API (3003): a heart from search, a product visit
// (recently viewed), the /favorites page lists both (axe scan), un-hearting updates it; the
// header fits at 360 px in fr/ar/en; the lookup route refuses bad input. Device-only lists.
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
const SHOP = 'http://127.0.0.1:3001', API = 'http://127.0.0.1:3003';
const results = [];
const check = async (name, fn) => { try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name, String(e?.message ?? e).split('\n')[0]]); } };
const catalog = (await (await fetch(`${API}/api/v1/catalog/products?limit=100`)).json()).items;
const [first, second] = catalog;
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
await check('favorite from search, recently viewed from a product page', async () => {
  await p.goto(`${SHOP}/search?lang=fr`);
  await p.locator('.product-card', { hasText: first.title.fr }).first().getByRole('button', { name: /Enregistrer sur cet appareil/ }).click();
  await p.goto(`${SHOP}/product/${second.slug}`);
  await p.locator('h1').first().waitFor();
  await p.getByRole('link', { name: 'Favoris' }).first().click();
  await p.waitForURL(/\/favorites/);
  const fav = p.getByRole('region', { name: 'Vos favoris' }).or(p.locator('section[aria-labelledby=favorites-title]'));
  await fav.getByText(first.title.fr).first().waitFor({ timeout: 15000 });
  await p.locator('section[aria-labelledby=recent-title]').getByText(second.title.fr).first().waitFor({ timeout: 15000 });
  const r = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa']).analyze();
  if (r.violations.length) throw new Error(r.violations.map((v) => v.id).join(','));
  // Removing the heart on the favorites page updates the list.
  await fav.getByRole('button', { name: /Enregistrer sur cet appareil/ }).first().click();
  await p.getByText('Touchez le cœur d’un produit pour le retrouver ici.').waitFor({ timeout: 15000 });
});
await check('home shows recently viewed; product share copies the link', async () => {
  const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx2.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: SHOP });
  const q = await ctx2.newPage();
  await q.addInitScript(() => {
    // Desktop Chromium has no share sheet: the button falls back to copying the link.
    Object.defineProperty(navigator, 'share', { value: undefined });
  });
  await q.goto(`${SHOP}/product/${second.slug}?lang=fr`);
  await q.getByRole('button', { name: 'Partager' }).click();
  await q.getByText('Lien copié.').waitFor({ timeout: 15000 });
  const copied = await q.evaluate(() => navigator.clipboard.readText());
  if (!copied.includes(`/product/${second.slug}`)) throw new Error(`copied ${copied}`);
  await q.goto(`${SHOP}/?lang=fr`);
  await q
    .locator('section[aria-labelledby=recent-home-title]')
    .getByText(second.title.fr)
    .first()
    .waitFor({ timeout: 15000 });
  await ctx2.close();
});
await check('header fits at 360 px in fr/ar/en', async () => {
  for (const locale of ['fr', 'ar', 'en']) {
    const q = await (await b.newContext({ viewport: { width: 360, height: 800 } })).newPage();
    await q.goto(`${SHOP}/?lang=${locale}`);
    const over = await q.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (over > 0) throw new Error(`${locale} overflow ${over}`);
  }
});
await check('lookup route refuses bad input', async () => {
  const bad = await fetch(`${SHOP}/favorites/products?slugs=${'x'.repeat(10)}%3Cscript%3E`);
  if (bad.status !== 400) throw new Error(`status ${bad.status}`);
  const many = await fetch(`${SHOP}/favorites/products?slugs=${Array.from({ length: 61 }, (_, i) => `p-${i}`).join(',')}`);
  if (many.status !== 400) throw new Error(`many ${many.status}`);
});
await b.close();
for (const r of results) console.log(r.join(' | '));
process.exitCode = results.some((r) => r[0] === 'FAIL') ? 1 : 0;
