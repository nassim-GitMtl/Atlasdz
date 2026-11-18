// Seller journey of the Android app's web build (mobile/) against the local API: dashboard, order
// processing, a reply to a review, customer request, offers, new product with staff approval +
// photo, delivery zones.
// Same setup as mobile-app.mjs (README). Uses the local demo seller, customer and staff accounts.
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const APP = process.env.ATLAS_APP_URL ?? 'http://127.0.0.1:8090';
const API = process.env.ATLAS_API_URL ?? 'http://127.0.0.1:3003';
const SHOTS = new URL('./mobile-shots/', import.meta.url).pathname;
await mkdir(SHOTS, { recursive: true });
const tag = randomBytes(3).toString('hex');

const call = async (path, token, init = {}) => {
  const r = await fetch(API + path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await r.text();
  if (r.status >= 400) throw new Error(`${init.method ?? 'GET'} ${path} → ${r.status} ${text}`);
  return text ? JSON.parse(text) : undefined;
};
const session = async (account) =>
  (await call('/api/v1/local/session', null, { method: 'POST', body: JSON.stringify({ account }) }))
    .accessToken;

// Setup: the demo seller delivers to a test destination; the demo customer orders and asks a question.
const sellerToken = await session('seller');
const staffToken = await session('admin');
const customerToken = await session('customer');
const places = (await call('/api/v1/delivery/destinations', sellerToken)).items;
const place = places.find((d) => d.dataClass === 'synthetic');
const rates = (await call('/api/v1/seller/delivery', sellerToken)).items;
if (!rates.some((rate) => rate.destination.id === place.id)) {
  await call(`/api/v1/seller/delivery/${place.id}`, sellerToken, {
    method: 'POST',
    body: JSON.stringify({
      expectedVersion: 0,
      enabled: true,
      shippingFeeMinor: 50000,
      codCollector: 'SELLER_COURIER',
    }),
  });
}
const sellerOffers = (await call('/api/v1/seller/offers', sellerToken)).items;
const approved = sellerOffers
  .filter((o) => o.status === 'APPROVED')
  .sort((a, b) => a.id.localeCompare(b.id));
// Keep the demo offers stocked (repeated runs use stock up), except one left low on purpose so
// the dashboard's stock alert shows.
const stock = (offer, availableQuantity) =>
  call(`/api/v1/seller/offers/${offer.id}`, sellerToken, {
    method: 'POST',
    body: JSON.stringify({
      priceMinor: offer.priceMinor,
      availableQuantity,
      handlingDays: offer.handlingDays,
      expectedVersion: offer.rowVersion,
    }),
  });
for (const offer of approved.slice(0, -1)) if (offer.availableQuantity < 10) await stock(offer, 30);
const lowOffer = approved.at(-1);
if (lowOffer && lowOffer.availableQuantity !== 2) await stock(lowOffer, 2);
const mine = new Set(sellerOffers.map((o) => o.id));
const catalog = (await call('/api/v1/catalog/products?limit=100')).items;
const offer = catalog
  .flatMap((p) => p.offers)
  .find((o) => mine.has(o.id) && o.availableQuantity > 0);
let cart = await call('/api/v1/cart', customerToken);
for (const line of cart.items) {
  cart = await call(`/api/v1/cart/items/${line.offerId}`, customerToken, {
    method: 'PUT',
    body: JSON.stringify({ quantity: 0, expectedVersion: cart.version }),
  });
}
cart = await call(`/api/v1/cart/items/${offer.id}`, customerToken, {
  method: 'PUT',
  body: JSON.stringify({ quantity: 1, expectedVersion: cart.version }),
});
const recipient = `Karim ${tag}`;
const quote = await call('/api/v1/checkout/quotes', customerToken, {
  method: 'POST',
  body: JSON.stringify({
    expectedCartVersion: cart.version,
    destinationId: place.id,
    deliveryContact: {
      recipientName: recipient,
      phone: '0555667788',
      addressLine: '4 rue des Jasmins',
      city: 'Blida',
    },
  }),
});
const order = await call(`/api/v1/checkout/quotes/${quote.id}/place`, customerToken, {
  method: 'POST',
  headers: { 'idempotency-key': quote.id },
  body: '{}',
});
const sellerOrderId = order.sellerOrders[0].id;
const question = `Pouvez-vous livrer samedi ? (${tag})`;
const review = `Vendeur sérieux, colis bien emballé (${tag}).`;
await call('/api/v1/support', customerToken, {
  method: 'POST',
  body: JSON.stringify({ sellerOrderId, category: 'OTHER', body: question }),
});
const photoPath = join(tmpdir(), `atlas-photo-${tag}.png`);
await writeFile(
  photoPath,
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
);

const results = [];
const problems = [];
const a11y = [];
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'fr-FR',
});
const page = await context.newPage();
page.on('response', (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()} ${r.url()}`));
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message.slice(0, 180)}`));
let shot = 0;
async function check(name, fn) {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (error) {
    results.push(['FAIL', name, String(error?.message ?? error).split('\n')[0]]);
  }
  shot += 1;
  await page
    .screenshot({ path: `${SHOTS}seller-${String(shot).padStart(2, '0')}.png` })
    .catch(() => {});
}
async function scan(label) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  for (const v of result.violations) a11y.push(`${label}: ${v.id} (${v.nodes.length}) ${v.help}`);
}
const confirm = async () => page.getByRole('button', { name: 'Confirmer', exact: true }).click();

await check('seller mode opens on the dashboard', async () => {
  await page.goto(APP);
  await page.evaluate((token) => {
    localStorage.setItem('atlas.session', JSON.stringify({ token, actor: 'seller' }));
    localStorage.setItem('atlas.locale', 'fr');
  }, sellerToken);
  await page.goto(APP);
  await page.getByText('À accepter').first().waitFor({ timeout: 20000 });
  await page.getByText('Livré et confirmé · 30 derniers jours', { exact: true }).waitFor();
  await scan('dashboard');
});
await check('process an order: accept, prepare, ship with tracking, delivered', async () => {
  await page.goto(`${APP}/seller-orders`);
  await page.getByText(recipient).first().click({ timeout: 20000 });
  await page.getByText('Fiabilité du client').waitFor({ timeout: 15000 });
  await scan('seller order');
  await page.getByRole('button', { name: 'Accepter la commande' }).click();
  await confirm();
  await page.getByRole('button', { name: 'Commencer la préparation' }).click({ timeout: 15000 });
  await confirm();
  await page.getByRole('button', { name: 'Marquer comme expédiée' }).click({ timeout: 15000 });
  await page.getByLabel('Transporteur').fill('Yalidine');
  await page.getByLabel('Numéro de suivi').fill(`YAL-${tag}`);
  await confirm();
  await page.getByRole('button', { name: 'Marquer comme livrée' }).click({ timeout: 15000 });
  await confirm();
  await page.getByText('Livrée selon le vendeur').first().waitFor({ timeout: 15000 });
});
await check('reply to a customer review', async () => {
  const productId = order.sellerOrders[0].snapshot.items[0].productId;
  await call(`/api/v1/reviews/order/${sellerOrderId}/${productId}`, customerToken, {
    method: 'PUT',
    body: JSON.stringify({ rating: 5, body: review, expectedVersion: 0 }),
  });
  await page.goto(`${APP}/seller/reviews`);
  await page.getByText(review).waitFor({ timeout: 15000 });
  await scan('seller reviews');
  await page.getByRole('button', { name: 'Répondre', exact: true }).first().click();
  await page.getByLabel('Votre réponse publique').fill(`Merci Karim ! (${tag})`);
  await page.getByRole('button', { name: 'Publier la réponse' }).click();
  await page.getByText('Réponse publiée.').waitFor({ timeout: 15000 });
  await page.getByText(`Merci Karim ! (${tag})`).waitFor();
});
await check('orders search, delivery slip, sales chart and stock alert', async () => {
  const search = 'Rechercher (nom, téléphone, n° de commande)';
  await page.goto(`${APP}/seller-orders`);
  await page.getByLabel(search).fill(recipient);
  await page.getByText(recipient).first().click({ timeout: 15000 });
  await page
    .getByRole('button', { name: 'Partager le bon de livraison' })
    .waitFor({ timeout: 15000 });
  await page.goto(`${APP}/seller-orders`);
  await page.getByLabel(search).fill('zzzz-nobody');
  await page.getByText('Aucune commande ne correspond.').waitFor({ timeout: 15000 });
  // The customer confirms receipt: today's delivered sales appear in the chart.
  await call(`/api/v1/orders/seller-orders/${sellerOrderId}/confirm-delivery`, customerToken, {
    method: 'POST',
    body: JSON.stringify({ expectedVersion: 5 }),
  });
  await page.goto(`${APP}/dashboard`);
  await page.getByText('Ventes livrées, 14 derniers jours').first().waitFor({ timeout: 15000 });
  if ((await page.getByText('Aucune vente livrée sur cette période.').count()) > 0)
    throw new Error('the confirmed delivery is missing from the sales chart');
  await page.getByText('Stock faible').waitFor({ timeout: 15000 });
  await scan('dashboard tools');
});
await check('answer the customer request', async () => {
  await page.goto(`${APP}/support`);
  await page.getByText('Autre question').first().click({ timeout: 15000 });
  await page.getByText(question).waitFor({ timeout: 15000 });
  await page.getByLabel('Votre message').fill('Oui, livraison samedi matin.');
  await page.getByRole('button', { name: 'Répondre' }).click();
  await page.getByText('Oui, livraison samedi matin.').waitFor({ timeout: 15000 });
});
await check('edit an offer', async () => {
  await page.goto(`${APP}/catalog`);
  await page.getByRole('tab', { name: 'Offres' }).click();
  await page.getByRole('link').first().click({ timeout: 15000 });
  const price = page.getByLabel('Prix (DA)');
  await price.waitFor({ timeout: 15000 });
  await price.fill(await price.inputValue());
  await page.getByRole('button', { name: 'Enregistrer l’offre' }).click();
  await page.getByText('Enregistré.').waitFor({ timeout: 15000 });
});
let submissionId = null;
await check('pre-order terms in the offer form', async () => {
  await page.goto(`${APP}/catalog`);
  await page.getByRole('tab', { name: 'Offres' }).click();
  await page.getByRole('link').first().click({ timeout: 15000 });
  const toggle = page.getByRole('checkbox', { name: /Article en précommande/ });
  await toggle.click({ timeout: 15000 });
  await page.getByLabel('Délai estimé : au plus tôt (jours)').fill('20');
  await page.getByLabel('Délai estimé : au plus tard (jours)').fill('35');
  await page.getByLabel('Provenance (facultatif)').fill('Turquie');
  await scan('offer pre-order');
  await page.getByRole('button', { name: 'Enregistrer l’offre' }).click();
  await page.getByText('Enregistré.').waitFor({ timeout: 15000 });
  await page.reload();
  const kept = page.getByRole('checkbox', { name: /Article en précommande/ });
  await kept.waitFor({ timeout: 30000 });
  if ((await kept.getAttribute('aria-checked')) !== 'true')
    throw new Error('the pre-order terms were not kept after reloading');
  // Back in stock, so the other journeys keep ordering without the pre-order step.
  await page.getByRole('checkbox', { name: /Article en précommande/ }).click();
  await page.getByRole('button', { name: 'Enregistrer l’offre' }).click();
  await page.getByText('Enregistré.').waitFor({ timeout: 15000 });
});
await check('submit a new product', async () => {
  await page.goto(`${APP}/seller/product/new`);
  await page.getByRole('button', { name: /^Catégorie:/ }).click({ timeout: 15000 });
  await page
    .getByRole('button', { name: /Cuisine|Maison|Téléphones/ })
    .first()
    .click();
  await page.getByLabel('Titre (français)').fill(`Plat à tajine ${tag}`);
  await page.getByLabel('Titre (arabe)').fill('طاجين');
  await page.getByLabel('Description (français)').fill('Plat en terre cuite fait main.');
  await page.getByLabel('Description (arabe)').fill('طاجين فخاري مصنوع يدويًا.');
  // Optional English title (English screens fall back to French without it).
  await page.getByLabel('Titre (anglais, facultatif)').fill(`Tagine dish ${tag}`);
  // Optional characteristics: only the filled ones are sent.
  await page.getByLabel('Matière').fill('Terre cuite');
  await page.getByLabel('Pays de fabrication').fill('Algérie');
  await scan('new product');
  await page.getByRole('button', { name: 'Soumettre pour vérification' }).click();
  await page.waitForURL(/\/seller\/product\/[0-9a-f-]{36}/, { timeout: 15000 });
  await page.getByText('En vérification').first().waitFor();
  submissionId = /product\/([0-9a-f-]{36})/.exec(page.url())[1];
  const sent = await call(`/api/v1/seller/products/${submissionId}`, sellerToken);
  if (JSON.stringify(sent.specs) !== JSON.stringify([
    { key: 'material', value: 'Terre cuite' },
    { key: 'origin', value: 'Algérie' },
  ]))
    throw new Error(`specs ${JSON.stringify(sent.specs)}`);
});
await check('after staff approval: photo from the gallery, then an offer', async () => {
  const submission = await call(`/api/v1/seller/products/${submissionId}`, sellerToken);
  await call(`/api/v1/admin/products/${submissionId}/review`, staffToken, {
    method: 'POST',
    body: JSON.stringify({ decision: 'APPROVED', expectedVersion: submission.rowVersion }),
  });
  await page.reload();
  await page.getByText('Photo du produit').waitFor({ timeout: 15000 });
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choisir dans la galerie' }).click();
  await (await chooser).setFiles(photoPath);
  await page.locator('img[src*="/media/"]').first().waitFor({ timeout: 30000 });
  // An extra photo after the main one.
  const extra = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Ajouter depuis la galerie' }).click();
  await (await extra).setFiles(photoPath);
  await page.getByRole('button', { name: 'Photo principale' }).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: 'Vendre ce produit' }).click();
  await page.getByLabel('Prix (DA)').fill('1500');
  await page.getByLabel('Quantité en stock').fill('5');
  await page.getByRole('button', { name: 'Enregistrer l’offre' }).click();
  await page.waitForURL(/\/seller\/offer\/[0-9a-f-]{36}/, { timeout: 15000 });
  await page.getByText('En vérification').first().waitFor({ timeout: 15000 });
});
await check('approved characteristics and photos on the product screen', async () => {
  const submission = await call(`/api/v1/seller/products/${submissionId}`, sellerToken);
  // The product is public once staff approve its offer.
  const offer = (await call('/api/v1/seller/offers', sellerToken)).items.find(
    (item) => item.productId === submission.productId,
  );
  await call(`/api/v1/admin/offers/${offer.id}/approve`, staffToken, { method: 'POST', body: '{}' });
  await page.goto(`${APP}/product/p-${submission.productId}`);
  await page.getByText('Caractéristiques', { exact: true }).waitFor({ timeout: 15000 });
  await page.getByText('Terre cuite', { exact: true }).waitFor();
  await page.getByText('Pays de fabrication').waitFor();
  await page.getByRole('button', { name: 'Photos du produit 2/2' }).waitFor();
  await scan('product with characteristics');
  // In English, the seller's English title is shown; the French description is the fallback.
  await page.evaluate(() => localStorage.setItem('atlas.locale', 'en'));
  await page.reload();
  await page.getByText(`Tagine dish ${tag}`).first().waitFor({ timeout: 15000 });
  await page.getByText('Country of manufacture').waitFor();
  await page.evaluate(() => localStorage.setItem('atlas.locale', 'fr'));
  await page.reload();
  await page.getByText('Caractéristiques', { exact: true }).waitFor({ timeout: 15000 });
});
await check('delivery zones: commune rate', async () => {
  await page.goto(`${APP}/seller/delivery`);
  await page.getByRole('button', { name: /^Wilaya:/ }).click({ timeout: 15000 });
  await page.getByRole('button', { name: 'Destinations de test' }).click();
  await page
    .getByRole('button', { name: new RegExp(place.name.fr) })
    .first()
    .click();
  await page.getByRole('tab', { name: 'Tarif personnalisé' }).click();
  await page.getByLabel('Frais de livraison (DA)').fill('500');
  await scan('delivery');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page
    .getByText(/Tarif personnalisé · 500/)
    .first()
    .waitFor({ timeout: 15000 });
});
await check('notifications, then sign out back to the shop', async () => {
  await page.goto(`${APP}/notifications`);
  await page
    .getByText(/Aucune notification|:/)
    .first()
    .waitFor({ timeout: 15000 });
  await page.goto(`${APP}/seller-account`);
  await page.getByRole('button', { name: 'Se déconnecter' }).click({ timeout: 15000 });
  await page.getByText('Les offres des vendeurs algériens, payées à la livraison.').waitFor({
    timeout: 15000,
  });
});

await browser.close();
for (const r of results) console.log(r.join(' | '));
console.log(`HTTP / PAGE PROBLEMS (${problems.length})`);
for (const p of [...new Set(problems)].slice(0, 12)) console.log(' - ' + p);
console.log(`ACCESSIBILITY (${a11y.length})`);
for (const f of a11y) console.log(' - ' + f);
process.exitCode = results.some((r) => r[0] === 'FAIL') ? 1 : 0;
