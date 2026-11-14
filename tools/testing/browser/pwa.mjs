import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const APPS = [
  {
    name: 'shop',
    base: 'http://127.0.0.1:3001',
    start: '/',
    offlinePath: '/cart',
    install: 'footer',
  },
  {
    name: 'seller',
    base: 'http://127.0.0.1:3002',
    start: '/login',
    offlinePath: '/orders',
    install: '.sidebar',
  },
];
// Same policy Caddy sends in production (infra/release/vps/Caddyfile).
const CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const results = [];
const problems = [];
const check = async (name, fn) => {
  try {
    results.push(['PASS', name, (await fn()) ?? '']);
  } catch (error) {
    results.push(['FAIL', name, String(error?.message ?? error).split('\n')[0]]);
  }
};
const withCsp = async (context) =>
  context.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), 'content-security-policy': CSP },
    });
  });

for (const app of APPS) {
  const profile = await mkdtemp(join(tmpdir(), 'atlas-pwa-'));
  const context = await chromium.launchPersistentContext(profile, {
    viewport: { width: 390, height: 844 },
    locale: 'fr-FR',
  });
  await withCsp(context);
  const page = context.pages()[0] ?? (await context.newPage());
  page.on(
    'console',
    (m) => m.type() === 'error' && problems.push(`${app.name}: ${m.text().slice(0, 160)}`),
  );

  await check(`${app.name}: manifest linked, icons load`, async () => {
    await page.goto(app.base + app.start);
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    const manifest = await (await page.request.get(new URL(href, app.base).href)).json();
    for (const key of ['name', 'short_name', 'start_url', 'display', 'icons'])
      if (!manifest[key]) throw new Error(`manifest missing ${key}`);
    const icons = [
      ...manifest.icons.map((i) => i.src),
      await page.locator('link[rel="apple-touch-icon"]').getAttribute('href'),
    ];
    for (const src of icons) {
      const r = await page.request.get(new URL(src, app.base).href);
      if (r.status() !== 200) throw new Error(`${src} → ${r.status()}`);
    }
    return `"${manifest.short_name}", ${manifest.display}, ${icons.length} icons`;
  });
  await check(`${app.name}: service worker active and in control`, async () => {
    const state = await page.evaluate(
      async () => (await navigator.serviceWorker.ready).active?.state,
    );
    await page.reload();
    if (!(await page.evaluate(() => navigator.serviceWorker.controller !== null)))
      throw new Error(`not controlling (state ${state})`);
    return state;
  });
  await check(`${app.name}: Chrome says installable`, async () => {
    const cdp = await context.newCDPSession(page);
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
    if (installabilityErrors.length) throw new Error(JSON.stringify(installabilityErrors));
    return 'no installability errors';
  });
  await check(`${app.name}: offline page instead of browser error`, async () => {
    await context.setOffline(true);
    await page.goto(app.base + app.offlinePath).catch(() => undefined);
    const text = await page
      .locator('body')
      .innerText()
      .catch(() => '');
    await context.setOffline(false);
    if (!/hors ligne/i.test(text) || !/غير متصل/.test(text))
      throw new Error(`got: ${text.slice(0, 80)}`);
    return 'French + Arabic offline page';
  });
  await context.close();
  await rm(profile, { recursive: true, force: true });

  // iPhone (Safari has no install prompt): the button explains Share → Add to Home Screen.
  const browser = await chromium.launch();
  const iphone = await browser.newContext({
    userAgent: IPHONE_UA,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'fr-FR',
  });
  await withCsp(iphone);
  const phone = await iphone.newPage();
  phone.on(
    'console',
    (m) => m.type() === 'error' && problems.push(`${app.name} iPhone: ${m.text().slice(0, 160)}`),
  );
  await check(`${app.name}: iPhone install steps`, async () => {
    await phone.goto(app.base + app.start);
    const button = phone.locator(`${app.install} .install-app button`);
    await button.scrollIntoViewIfNeeded();
    await button.click();
    await phone.getByText('Sur l’écran d’accueil').waitFor();
    const scan = await new AxeBuilder({ page: phone }).withTags(['wcag2a', 'wcag2aa']).analyze();
    if (scan.violations.length)
      throw new Error(scan.violations.map((v) => `${v.id}(${v.nodes.length})`).join(', '));
    return `"${await button.innerText()}" → steps shown, axe 0 violations`;
  });
  await browser.close();
}

for (const r of results) console.log(r.join(' | '));
console.log(`CONSOLE / CSP PROBLEMS (${problems.length})`);
for (const p of problems) console.log(' - ' + p);
process.exitCode = results.some((r) => r[0] === 'FAIL') ? 1 : 0;
