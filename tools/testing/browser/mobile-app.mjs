// End-to-end journey of the Android app's web build (mobile/) against the local API.
// Setup (see README): API on 3003 with local accounts + checkout, shop on 3001, and the app's web
// build served on 8090 with CORS for that origin. Local checkout is limited to the demo customer.
import { mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const APP = process.env.ATLAS_APP_URL ?? 'http://127.0.0.1:8090';
const API = process.env.ATLAS_API_URL ?? 'http://127.0.0.1:3003';
const SHOTS = new URL('./mobile-shots/', import.meta.url).pathname;
await mkdir(SHOTS, { recursive: true });

// The local seller delivers to one synthetic destination, so its product can be ordered.
const call = async (path, token, init = {}) => {
  const r = await fetch(API + path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : undefined };
};
const sellerToken = (
  await call('/api/v1/local/session', null, {
    method: 'POST',
    body: JSON.stringify({ account: 'seller' }),
  })
).body.accessToken;
const places = (await call('/api/v1/delivery/destinations', sellerToken)).body.items;
const place = places.find((d) => d.dataClass === 'synthetic');
const rates = (await call('/api/v1/seller/delivery', sellerToken)).body.items;
if (!rates.some((r) => JSON.stringify(r).includes(place.id))) {
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
const sellerOffers = (await call('/api/v1/seller/offers', sellerToken)).body.items ?? [];
// Repeated runs deliver test orders and use up stock: keep the demo offers stocked.
for (const offer of sellerOffers.filter((o) => o.status === 'APPROVED' && o.availableQuantity < 10))
  await call(`/api/v1/seller/offers/${offer.id}`, sellerToken, {
    method: 'POST',
    body: JSON.stringify({
      priceMinor: offer.priceMinor,
      availableQuantity: 30,
      handlingDays: offer.handlingDays,
      expectedVersion: offer.rowVersion,
    }),
  });
const mine = new Set(sellerOffers.map((o) => o.id));
const catalog = (await call('/api/v1/catalog/products?limit=100')).body.items;
const product = catalog.find((p) =>
  p.offers.some((o) => mine.has(o.id) && o.availableQuantity > 0),
);
const slug = product.slug;
// (product.title.fr is used by the favorites check)
const seller = product.offers.find((o) => mine.has(o.id)).seller.name;
const destination = place.name.fr;
const email = `app-${randomBytes(3).toString('hex')}@example.dz`;
const password = 'correct horse battery 42';
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
page.on('console', (m) => m.type() === 'error' && problems.push(m.text().slice(0, 180)));
page.on(
  'response',
  (r) =>
    r.status() >= 400 &&
    problems.push(`HTTP ${r.status()} ${r.url().replace(/token=[^&]+/, 'token=…')}`),
);
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
    .screenshot({
      path: `${SHOTS}${String(shot).padStart(2, '0')}-${name.replace(/\W+/g, '-').slice(0, 40)}.png`,
    })
    .catch(() => {});
}
async function scan(label) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  for (const v of result.violations) a11y.push(`${label}: ${v.id} (${v.nodes.length}) ${v.help}`);
}
const offerButton = async () => {
  // Offers are listed in API order: press "Add to cart" in the card of the wanted seller.
  const sellers = await page.getByText(/^Vendu par /).allInnerTexts();
  const index = sellers.findIndex((s) => s.includes(seller));
  if (index < 0) throw new Error(`no offer from ${seller}: ${sellers.join(' | ')}`);
  return page.getByRole('button', { name: /Ajouter au panier|Ajouté/ }).nth(index);
};

await check('home lists products', async () => {
  await page.goto(APP);
  await page
    .getByText(/^À partir de/)
    .first()
    .waitFor({ timeout: 20000 });
  await scan('home');
});
await check('search filters the catalogue', async () => {
  await page.getByLabel('Rechercher un produit').fill('air');
  await page.getByLabel('Rechercher un produit').press('Enter');
  await page
    .getByText(/^À partir de/)
    .first()
    .waitFor();
});
await check('product page asks to sign in before adding', async () => {
  await page.goto(`${APP}/product/${slug}`);
  await page.getByText('Offres des vendeurs').waitFor({ timeout: 15000 });
  await scan('product');
  await (await offerButton()).click();
  await page.waitForURL(/\/login/);
});
await check('register a customer in the app', async () => {
  await page.getByRole('tab', { name: 'Créer un compte' }).click();
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await scan('login');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await page.waitForURL(new RegExp(`/product/${slug}`), { timeout: 15000 });
});
await check('add to cart', async () => {
  await (await offerButton()).click();
  await page.getByText('Ajouté au panier').waitFor();
  await page.getByRole('button', { name: 'Voir le panier' }).click();
  await page.waitForURL(/\/cart/);
  await page.getByRole('button', { name: 'Commander' }).waitFor();
  await scan('cart');
});
await check('account shows the email and switches to Arabic', async () => {
  await page.goto(`${APP}/account`);
  await page.getByText(email).waitFor({ timeout: 15000 });
  await page.getByText('Non confirmée').waitFor();
  await scan('account');
  await page.getByRole('button', { name: 'العربية' }).click();
  await page.getByText('اللغة').waitFor();
});

await check('favorites, recently viewed and the seller shop page', async () => {
  // The previous step switched the app to Arabic; continue in French.
  await page.evaluate(() => localStorage.setItem('atlas.locale', 'fr'));
  await page.goto(`${APP}/product/${slug}`);
  await page.getByText('Offres des vendeurs').waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Ajouter aux favoris' }).first().click();
  await page.goto(`${APP}/favorites`);
  await page.getByRole('link', { name: product.title.fr }).first().waitFor({ timeout: 15000 });
  await page.goto(APP);
  await page.getByText('Vus récemment').waitFor({ timeout: 15000 });
  await page.goto(`${APP}/product/${slug}`);
  await page.getByText(`Vendu par ${seller}`).first().click();
  await page.getByText('À propos de la boutique').waitFor({ timeout: 15000 });
  await scan('store');
});
await check('switch to the local demo customer (local checkout is limited to it)', async () => {
  const session = await (
    await fetch(`${API}/api/v1/local/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ account: 'customer' }),
    })
  ).json();
  const auth = {
    authorization: `Bearer ${session.accessToken}`,
    'content-type': 'application/json',
  };
  let cart = await (await fetch(`${API}/api/v1/cart`, { headers: auth })).json();
  for (const line of cart.items) {
    cart = await (
      await fetch(`${API}/api/v1/cart/items/${line.offerId}`, {
        method: 'PUT',
        headers: auth,
        body: JSON.stringify({ quantity: 0, expectedVersion: cart.version }),
      })
    ).json();
  }
  await page.evaluate(
    ([language, token]) => {
      localStorage.setItem('atlas.locale', language);
      localStorage.setItem('atlas.session', token);
    },
    ['fr', session.accessToken],
  );
  await page.goto(`${APP}/product/${slug}`);
  await page.getByText('Offres des vendeurs').waitFor({ timeout: 15000 });
  await (await offerButton()).click();
  await page.getByText('Ajouté au panier').waitFor();
  await page.getByRole('button', { name: 'Voir le panier' }).click();
  await page.waitForURL(/\/cart/);
  await page.getByRole('button', { name: 'Commander' }).waitFor();
});
await check('checkout: wilaya, commune and contact', async () => {
  await page.getByRole('button', { name: 'Commander' }).click();
  await page.waitForURL(/\/checkout$/);
  await page.getByRole('button', { name: /^Wilaya:/ }).click();
  await page.getByRole('button', { name: 'Destinations de test' }).click();
  await page.getByRole('button', { name: /^Commune:/ }).click();
  await page.getByRole('button', { name: destination }).click();
  await page.getByLabel('Nom du destinataire').fill('Amina B.');
  await page.getByLabel('Téléphone').fill('0555 12 34 56');
  await page.getByLabel('Adresse').fill('12 rue des Oliviers');
  await page.getByLabel('Ville').fill('Tlemcen');
  await scan('checkout');
  await page.getByRole('button', { name: 'Voir le total' }).click();
  await page.waitForURL(/\/checkout\/[0-9a-f-]{36}/, { timeout: 15000 });
  await page.getByText('Commande de test : aucun paiement ni expédition réelle.').waitFor();
  await scan('review');
});
await check('place the order', async () => {
  await page.getByRole('button', { name: 'Confirmer la commande' }).click();
  await page.waitForURL(/\/order\/[0-9a-f-]{36}/, { timeout: 15000 });
  await page.getByText('En attente du vendeur').first().waitFor();
  await scan('order');
});
await check('help request from the order, with a reply', async () => {
  const orderUrl = page.url();
  await page
    .getByRole('button', { name: 'Signaler un problème ou demander un retour' })
    .first()
    .click();
  await page.waitForURL(/\/support\/new/);
  await page.getByRole('tab', { name: 'Problème de livraison' }).click();
  await page.getByLabel('Votre message').fill('Le livreur ne répond pas au téléphone.');
  await scan('support new');
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await page.waitForURL(/\/support\/[0-9a-f-]{36}/, { timeout: 15000 });
  await page.getByText('Le livreur ne répond pas au téléphone.').waitFor();
  await page.getByLabel('Votre message').fill('Merci de me rappeler avant 18 h.');
  await page.getByRole('button', { name: 'Répondre' }).click();
  await page.getByText('Merci de me rappeler avant 18 h.').waitFor({ timeout: 15000 });
  await scan('support case');
  await page.goto(orderUrl);
  await page
    .getByRole('button', { name: 'Voir ma demande d’aide' })
    .first()
    .waitFor({ timeout: 15000 });
});
await check('reorder puts the items back in the cart', async () => {
  await page.getByRole('button', { name: 'Commander à nouveau' }).click();
  await page.getByText('Articles ajoutés au panier.').waitFor({ timeout: 15000 });
});
await check('cancel with in-screen confirmation', async () => {
  await page.getByRole('button', { name: 'Annuler cette commande' }).click();
  await page.getByText(/^Annuler la commande passée chez/).waitFor();
  await page.getByRole('button', { name: 'Confirmer' }).click();
  await page.getByText('Annulée').first().waitFor({ timeout: 15000 });
});
await check('orders tab lists the order', async () => {
  await page.goto(`${APP}/orders`);
  await page
    .getByText(/^Commande du /)
    .first()
    .waitFor({ timeout: 15000 });
});
await check('rate a delivered item, then read the review on the product page', async () => {
  // A second order, which the seller delivers through the API; the app is the buyer.
  const customer = (
    await call('/api/v1/local/session', null, {
      method: 'POST',
      body: JSON.stringify({ account: 'customer' }),
    })
  ).body.accessToken;
  let cart = (await call('/api/v1/cart', customer)).body;
  for (const line of cart.items)
    cart = (
      await call(`/api/v1/cart/items/${line.offerId}`, customer, {
        method: 'PUT',
        body: JSON.stringify({ quantity: 0, expectedVersion: cart.version }),
      })
    ).body;
  const offerId = product.offers.find((o) => mine.has(o.id)).id;
  cart = (
    await call(`/api/v1/cart/items/${offerId}`, customer, {
      method: 'PUT',
      body: JSON.stringify({ quantity: 1, expectedVersion: cart.version }),
    })
  ).body;
  const quote = (
    await call('/api/v1/checkout/quotes', customer, {
      method: 'POST',
      body: JSON.stringify({
        expectedCartVersion: cart.version,
        destinationId: place.id,
        deliveryContact: {
          recipientName: 'Amina B.',
          phone: '0555123456',
          addressLine: '12 rue des Oliviers',
          city: 'Tlemcen',
        },
      }),
    })
  ).body;
  const placed = await fetch(`${API}/api/v1/checkout/quotes/${quote.id}/place`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${customer}`,
      'content-type': 'application/json',
      'idempotency-key': quote.id,
    },
    body: '{}',
  });
  const order = await placed.json();
  const so = order.sellerOrders[0];
  const steps = [
    { action: 'ACCEPT', expectedVersion: 1 },
    { action: 'PREPARE', expectedVersion: 2 },
    {
      action: 'SHIP',
      expectedVersion: 3,
      shipment: {
        method: 'SELLER_ARRANGED_TEST',
        carrier: 'Yalidine',
        trackingReference: 'YAL-R1',
      },
    },
    { action: 'REPORT_DELIVERY', expectedVersion: 4 },
  ];
  for (const step of steps) {
    const r = await call(`/api/v1/seller/orders/${so.id}/transition`, sellerToken, {
      method: 'POST',
      body: JSON.stringify(step),
    });
    if (r.status !== 200) throw new Error(`${step.action} → ${r.status}`);
  }
  const comment = `Friteuse parfaite, livrée vite (${randomBytes(2).toString('hex')}).`;
  await page.goto(`${APP}/order/${order.id}`);
  await page.getByRole('button', { name: 'Noter mes articles' }).first().click({ timeout: 15000 });
  await page.waitForURL(/\/rate\/[0-9a-f-]{36}/);
  await page.getByRole('radio', { name: '4 sur 5' }).first().click({ timeout: 15000 });
  await page.getByLabel('Votre commentaire (facultatif)').first().fill(comment);
  await scan('rate');
  await page.getByRole('button', { name: 'Publier mon avis' }).first().click();
  await page.getByText('Merci ! Votre avis est enregistré.').waitFor({ timeout: 15000 });
  await page.goto(`${APP}/product/${slug}`);
  await page.getByText(comment).waitFor({ timeout: 15000 });
  await page.getByText('Achat vérifié').first().waitFor();
  await scan('product reviews');
});
await check('similar products on the product page', async () => {
  const others = catalog.filter(
    (p) => p.category.slug === product.category.slug && p.slug !== slug,
  );
  await page.goto(`${APP}/product/${slug}`);
  await page.getByText('Offres des vendeurs').waitFor({ timeout: 15000 });
  if (others.length > 0) await page.getByText('Produits similaires').waitFor({ timeout: 15000 });
});
await check('buy without an account: email only, signed in as a customer', async () => {
  const guestEmail = `invite-app-${randomBytes(3).toString('hex')}@example.dz`;
  const guest = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: 'fr-FR',
  });
  const gp = await guest.newPage();
  await gp.goto(APP);
  await gp.evaluate(() => localStorage.setItem('atlas.locale', 'fr'));
  await gp.goto(`${APP}/login`);
  await gp.getByRole('tab', { name: 'Sans compte' }).click({ timeout: 15000 });
  await gp.getByLabel('Adresse e-mail').fill(guestEmail);
  const a11yGuest = await new AxeBuilder({ page: gp }).withTags(['wcag2a', 'wcag2aa']).analyze();
  for (const v of a11yGuest.violations)
    a11y.push(`guest login: ${v.id} (${v.nodes.length}) ${v.help}`);
  await gp.getByRole('button', { name: 'Continuer sans compte' }).click();
  await gp.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 });
  await gp.goto(`${APP}/account`);
  await gp.getByText(guestEmail).waitFor({ timeout: 15000 });
  await guest.close();
});
await check('saved address, connected devices and notifications', async () => {
  await page.goto(`${APP}/addresses`);
  await page.getByText('Amina B.').first().waitFor({ timeout: 15000 });
  await page.goto(`${APP}/sessions`);
  await page.getByText('Cet appareil').waitFor({ timeout: 15000 });
  await page.goto(`${APP}/notifications`);
  await page
    .getByText(/Aucune notification|Maison Plus/)
    .first()
    .waitFor({ timeout: 15000 });
  await scan('notifications');
});

await browser.close();
for (const r of results) console.log(r.join(' | '));
console.log(`CONSOLE ERRORS (${problems.length})`);
for (const p of [...new Set(problems)].slice(0, 12)) console.log(' - ' + p);
console.log(`ACCESSIBILITY (${a11y.length})`);
for (const f of a11y) console.log(' - ' + f);
process.exitCode = results.some((r) => r[0] === 'FAIL') ? 1 : 0;
