// Whole marketplace lifecycle against a deployed stack (release images, real identity, live
// cash-on-delivery switch on, SMTP to Mailpit). No local/demo shortcuts: every account is new.
//
//   SHOP=https://shop.localhost SELLER=https://vendeur.localhost MAIL_API=http://127.0.0.1:8025/api/v1 \
//   ATLAS_CMD=/path/to/atlas.sh node deployed-journey.mjs
//
// ATLAS_CMD wraps `docker compose ... ` for the stack (used once to create the staff account, as
// in infra/release/vps/README.md). Stops at the first failing step: later steps depend on it.
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const SHOP = process.env.SHOP ?? 'https://shop.localhost';
const SELLER = process.env.SELLER ?? 'https://vendeur.localhost';
const MAIL = process.env.MAIL_API ?? 'http://127.0.0.1:8025/api/v1';
const SHOTS = process.env.SHOTS ?? new URL('../shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
const tag = Math.random().toString(16).slice(2, 8);
const password = `Journey ${tag} horse battery`;
const store = `Atelier ${tag}`;
const product = { fr: `Tapis berbère ${tag}`, ar: `زربية أمازيغية ${tag}` };
const productEn = `Berber rug ${tag}`;
const buyerEmail = `client-${tag}@example.dz`;

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
  const d = createHmac('sha1', secret).update(counter).digest();
  const o = d[d.length - 1] & 15;
  return String((d.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
};
/** Waits for the next 30 s window so one code is never used twice (replay protection). */
const freshCode = async (secret, last) => {
  let code = totp(secret);
  while (code === last) {
    await new Promise((r) => setTimeout(r, 2000));
    code = totp(secret);
  }
  return code;
};

/** First link in the newest email to `to` whose URL contains `part`. */
async function mailLink(to, part, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const list = await fetch(`${MAIL}/search?query=${encodeURIComponent(`to:${to}`)}`).then((r) => r.json());
    for (const message of list.messages ?? []) {
      const full = await fetch(`${MAIL}/message/${message.ID}`).then((r) => r.json());
      const link = (`${full.Text}\n${full.HTML}`.match(/https?:\/\/[^\s"'<>]+/g) ?? []).find((u) => u.includes(part));
      if (link) return link.replace(/&amp;/g, '&');
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`no email to ${to} with a link containing ${part}`);
}
async function mailSubjects(to) {
  const list = await fetch(`${MAIL}/search?query=${encodeURIComponent(`to:${to}`)}`).then((r) => r.json());
  return (list.messages ?? []).map((m) => m.Subject);
}

const browser = await chromium.launch();
const context = (width = 1280) =>
  browser.newContext({ viewport: { width, height: 900 }, locale: 'fr-FR', ignoreHTTPSErrors: true });
const results = [];
let failed = false;
async function step(name, page, fn) {
  if (failed) return results.push(['SKIP', name]);
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (error) {
    failed = true;
    results.push(['FAIL', name, String(error.message ?? error).split('\n').filter(Boolean).slice(0, 8).join(' / ').slice(0, 900)]);
    await page?.screenshot({ path: `${SHOTS}journey-fail.png`, fullPage: true }).catch(() => {});
  }
}
const submit = (page, scope = "main form") =>
  page.locator(`${scope} button:not([type=button])`).last().click();

// --- Seller signs up, confirms the email, enrolls an authenticator ---
const sp = await (await context()).newPage();
let sellerSecret;
let sellerCode;
const sellerEmail = `vendeur-${tag}@example.dz`;
await step('seller registers', sp, async () => {
  await sp.goto(`${SELLER}/register`);
  await sp.fill('#reg-store', store);
  await sp.fill('#reg-email', sellerEmail);
  await sp.fill('#reg-password', password);
  await sp.fill('#reg-fr', 'Tapis tissés à la main dans les Aurès.');
  await sp.fill('#reg-ar', 'زرابي منسوجة يدويا في الأوراس.');
  await submit(sp, 'form.auth-form');
  await sp.waitForURL(/registered=1/, { timeout: 20000 });
});
await step('seller confirms the email link', sp, async () => {
  await sp.goto(await mailLink(sellerEmail, 'verify'));
  await sp.locator('main').getByText(/confirm|vérifi/i).first().waitFor({ timeout: 15000 });
});
await step('seller signs in and enrolls the authenticator', sp, async () => {
  await sp.goto(`${SELLER}/login`);
  await sp.fill('#login-email', sellerEmail);
  await sp.fill('#login-password', password);
  await submit(sp, 'form.auth-form');
  const key = sp.locator('.enroll-key');
  await key.waitFor({ timeout: 15000 });
  sellerSecret = base32Decode(await key.innerText());
  sellerCode = totp(sellerSecret);
  await sp.fill('#login-code', sellerCode);
  await submit(sp, 'form.auth-form');
  await sp.waitForURL(/\/account/, { timeout: 15000 });
});

// --- Staff (created with the server command) approves the seller ---
const staffEmail = `staff-${tag}@example.dz`;
const st = await (await context()).newPage();
let staffSecret;
await step('staff account created on the server and signs in with MFA', st, async () => {
  execFileSync(process.env.ATLAS_CMD, ['run', '--rm', '-T', 'api', 'node', 'start-release.mjs', 'create-staff', staffEmail], {
    input: password,
    stdio: ['pipe', 'ignore', 'pipe'],
  });
  await st.goto(`${SELLER}/login`);
  await st.fill('#login-email', staffEmail);
  await st.fill('#login-password', password);
  await submit(st, 'form.auth-form');
  const key = st.locator('.enroll-key');
  await key.waitFor({ timeout: 15000 });
  staffSecret = base32Decode(await key.innerText());
  await st.fill('#login-code', totp(staffSecret));
  await submit(st, 'form.auth-form');
  await st.waitForURL(/moderation/, { timeout: 15000 });
});
await step('staff approves the seller', st, async () => {
  await st.goto(`${SELLER}/moderation/sellers`);
  await st.locator('li', { hasText: store }).locator('button[value=APPROVE]').click();
  await st.waitForURL(/reviewed=1/, { timeout: 15000 });
});

// --- Seller proposes a product; staff approves it; seller adds the photo ---
await step('seller proposes a product', sp, async () => {
  await sp.goto(`${SELLER}/products`);
  await sp.selectOption('#categoryId', { index: 1 });
  await sp.fill('#titleFr', product.fr);
  await sp.fill('#titleAr', product.ar);
  await sp.fill('#descriptionFr', 'Tapis en laine, 120 × 180 cm, motifs traditionnels.');
  await sp.fill('#descriptionAr', 'زربية من الصوف، 120 × 180 سم، بزخارف تقليدية.');
  // Optional English title and seller-stated characteristics, reviewed with the product.
  await sp.fill('#titleEn', productEn);
  await sp.fill('#spec_material', 'Laine');
  await sp.fill('#spec_dimensions', '120 × 180 cm');
  await submit(sp, 'form:has(#titleFr)');
  await sp.getByText(product.fr).first().waitFor({ timeout: 15000 });
});
await step('staff approves the product', st, async () => {
  await st.goto(`${SELLER}/moderation/products`);
  const card = st.locator('article', { hasText: product.fr }).first();
  await card.locator('form:has(input[name=decision][value=APPROVED]) button').click();
  await st.getByText(product.fr).first().waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
});
await step('seller uploads the product photo', sp, async () => {
  const shot = await (await context(400)).newPage();
  await shot.setContent('<div style="width:400px;height:400px;background:linear-gradient(135deg,#2957f5,#c8f03c)"></div>');
  const png = await shot.screenshot({ clip: { x: 0, y: 0, width: 400, height: 400 } });
  await sp.goto(`${SELLER}/products`);
  await sp.locator('input[type=file][name=photo]').first().setInputFiles({ name: 'tapis.png', mimeType: 'image/png', buffer: png });
  await sp.locator('form:has(input[type=file][name=photo]) button:not([type=button])').first().click();
  await sp.locator('[role=status]').first().waitFor({ timeout: 20000 });
  // An extra photo for the product gallery.
  await sp.goto(`${SELLER}/products`);
  const extra = sp.locator('form:has(input[id^="gallery-"])').first();
  await extra.locator('input[type=file]').setInputFiles({ name: 'tapis-2.png', mimeType: 'image/png', buffer: png });
  await extra.locator('button:not([type=button])').click();
  await extra.getByText('Photo publiée.').waitFor({ timeout: 20000 });
});

// --- Offer, approval and delivery rate ---
await step('seller creates an offer', sp, async () => {
  await sp.goto(`${SELLER}/offers/new`);
  await sp.selectOption('#productId', { label: product.fr });
  await sp.fill('#price', '15500');
  await sp.fill('#quantity', '4');
  await sp.fill('#handlingDays', '2');
  const fee = sp.locator('#deliveryFee');
  if (await fee.count()) await fee.fill('0');
  await submit(sp, 'form:has(#price)');
  await sp.waitForURL(/\/offers(?!\/new)/, { timeout: 15000 });
});
await step('staff refuses the offer with a reason; seller is emailed and resubmits', st, async () => {
  await st.goto(`${SELLER}/moderation`);
  const row = st.locator('tr', { hasText: product.fr });
  await row.locator('summary').click();
  await row.locator('textarea[name=reason]').fill('Merci de préciser la taille exacte dans le titre.');
  await row.locator('.refuse-form button').click();
  await st.waitForURL(/rejected=1/, { timeout: 15000 });
  const end = Date.now() + 30000;
  while (Date.now() < end && !(await mailSubjects(sellerEmail)).some((x) => /non validée/.test(x)))
    await new Promise((r) => setTimeout(r, 1000));
  if (!(await mailSubjects(sellerEmail)).some((x) => /non validée/.test(x))) throw new Error('no refusal email');
  await sp.goto(`${SELLER}/offers`);
  await sp.getByText('Merci de préciser la taille').first().waitFor({ timeout: 15000 });
  await sp.locator('.offer-row', { hasText: product.fr }).getByRole('link').first().click();
  await sp.locator('form:has(#price) button:not([type=button])').last().click();
  await sp.waitForTimeout(2000);
});
await step('staff approves the offer', st, async () => {
  await st.goto(`${SELLER}/moderation`);
  await st.locator('tr', { hasText: product.fr }).locator('button:not([type=button])').first().click();
  await st.waitForURL(/approved=1/, { timeout: 15000 });
});
await step('seller runs a promotion; staff see the vendor account and can pause the offer', sp, async () => {
  await sp.goto(`${SELLER}/offers`);
  await sp.locator('.offer-row', { hasText: product.fr }).getByRole('link').first().click();
  const today = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
  const later = new Date(Date.now() + 8 * 86_400_000).toISOString().slice(0, 10);
  await sp.check('#promo');
  await sp.fill('#promoPrice', '13950');
  await sp.fill('#promoStart', today);
  await sp.fill('#promoEnd', later);
  await sp.locator('form:has(#price) button:not([type=button])').last().click();
  await sp.waitForTimeout(2000);
  await st.goto(`${SELLER}/admin/sellers`);
  await st.locator('tr', { hasText: store }).getByRole('link').click();
  const row = st.locator('tr', { hasText: product.fr });
  await row.getByText('Promo').waitFor({ timeout: 15000 });
  await row.locator('form:has(input[value=suspend-offer]) button').click();
  await row.locator('form:has(input[value=restore-offer]) button').waitFor({ timeout: 15000 });
  await row.locator('form:has(input[value=restore-offer]) button').click();
  await row.locator('form:has(input[value=suspend-offer]) button').waitFor({ timeout: 15000 });
});
await step('seller sets a delivery rate for Alger', sp, async () => {
  await sp.goto(`${SELLER}/delivery`);
  const wilaya = sp.locator('#delivery-wilaya');
  const option = await wilaya.locator('option', { hasText: /^\s*16\b/ }).first().getAttribute('value');
  await sp.goto(`${SELLER}/delivery?lang=fr&wilaya=${encodeURIComponent(option)}`);
  const form = sp.locator('form', { has: sp.locator('legend') }).first();
  await form.locator('input[name=enabled]').check();
  await form.locator('input[name=fee]').fill('600');
  await form.locator('select[name=collector]').selectOption('SELLER');
  await form.locator('input[name=confirm]').check();
  await form.locator('button:not([type=button])').click();
  // Saved: the communes of Alger now show active coverage from the wilaya rate.
  await sp.getByText(/Couverture active/).first().waitFor({ timeout: 15000 });
});

// --- A guest buys with cash on delivery ---
const bp = await (await context(390)).newPage();
let orderUrl;
await step('guest finds the product and adds it to the cart', bp, async () => {
  await bp.goto(`${SHOP}/search?query=${encodeURIComponent(product.fr)}`);
  // The promotion shows on the product card with the real regular price.
  await bp.locator('.product-card', { hasText: product.fr }).getByText(/Promo −10 %/).waitFor({ timeout: 15000 });
  await bp.getByRole('link', { name: product.fr }).first().click();
  // Gallery thumbnails and the reviewed characteristics; the English title in English.
  await bp.getByRole('group', { name: 'Photos du produit' }).getByRole('button').nth(1).waitFor({ timeout: 15000 });
  await bp.locator('dl.product-specs').getByText('Laine').waitFor();
  const english = await bp.context().newPage();
  await english.goto(`${bp.url().split('?')[0]}?lang=en`);
  await english.getByRole('heading', { level: 1, name: productEn }).waitFor({ timeout: 15000 });
  await english.close();
  // Delivery estimate to the shopper's commune, from the product page.
  await bp.locator('.delivery-estimate__open').click();
  const wilayaValue = await bp.locator('.delivery-estimate select').first().locator('option', { hasText: /^\s*16\b/ }).first().getAttribute('value');
  await bp.locator('.delivery-estimate select').first().selectOption(wilayaValue);
  await bp.locator('.delivery-estimate select').nth(1).selectOption({ index: 1 });
  await bp.locator('.delivery-estimate li', { hasText: store }).getByText(/600/).waitFor({ timeout: 15000 });
  await bp.locator('.cart-add-form button:not([type=button])').click();
  await bp.getByText('Ajouté au panier').waitFor({ timeout: 15000 });
  await bp.goto(`${SHOP}/cart`);
  await bp.getByText(product.fr).first().waitFor({ timeout: 15000 });
});
await step('guest checks out with delivery to Alger', bp, async () => {
  const wilaya = await bp.locator('#checkout-wilaya option', { hasText: /^\s*16\b/ }).first().getAttribute('value');
  await bp.selectOption('#checkout-wilaya', wilaya);
  await bp.selectOption('#checkout-destination', { index: 1 });
  // The seller's fee for this commune shows before the review step.
  await bp.locator('.fee-preview li', { hasText: store }).getByText(/600/).waitFor({ timeout: 15000 });
  await bp.fill('#checkout-email', buyerEmail);
  await bp.fill('#checkout-recipientName', 'Samira B.');
  await bp.fill('#checkout-phone', '0555123456');
  await bp.fill('#checkout-addressLine', '12 rue Didouche Mourad');
  await bp.fill('#checkout-city', 'Alger Centre');
  for (const box of await bp.locator('.order-form input[type=checkbox]').all()) await box.check();
  await bp.click('.order-form button:not([type=button])');
  await bp.waitForURL(/\/checkout\//, { timeout: 20000 });
  await bp.getByText('600').first().waitFor();
  for (const box of await bp.locator('main form input[type=checkbox]').all()) await box.check();
  await bp.locator('main form button:not([type=button])').first().click();
  await bp.waitForURL(/\/orders\/[0-9a-f-]{36}/, { timeout: 20000 });
  orderUrl = bp.url();
});
await step('emails: buyer confirmation and set-password link, seller new-order notice', bp, async () => {
  await mailLink(buyerEmail, 'reset-password');
  const wanted = [/Nouvelle commande/i, /offre est en ligne/i];
  const end = Date.now() + 45000;
  let subjects = '';
  while (Date.now() < end) {
    subjects = (await mailSubjects(sellerEmail)).join(' | ');
    if (wanted.every((re) => re.test(subjects))) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!wanted.every((re) => re.test(subjects))) throw new Error(`seller emails: ${subjects}`);
});

// --- Seller fulfils ---
await step('seller accepts, prepares, ships and reports delivery', sp, async () => {
  await sp.goto(`${SELLER}/orders`);
  await sp.locator('.seller-order-card', { hasText: product.fr }).first().getByRole('link').first().click();
  for (const action of ['ACCEPT', 'PREPARE', 'SHIP', 'REPORT_DELIVERY']) {
    const button = sp.locator(`button[name=action][value=${action}]`);
    await button.waitFor({ timeout: 15000 });
    if (action === 'SHIP') {
      await sp.fill('#test-carrier', 'Yalidine');
      await sp.fill('#test-tracking', `YAL-${tag}`);
    }
    const confirm = sp.locator(`form:has(button[value=${action}]) input[name=confirm]`);
    if (await confirm.count()) await confirm.check();
    await button.click();
    await sp.waitForTimeout(1500);
  }
});

// --- Buyer sets a password, confirms receipt, reviews, asks for help ---
await step('buyer sets a password from the email and signs in', bp, async () => {
  await bp.goto(await mailLink(buyerEmail, 'reset-password'));
  await bp.locator('input[type=password]').first().fill(password);
  const second = bp.locator('input[type=password]').nth(1);
  if (await second.count()) await second.fill(password);
  await bp.locator('main form button:not([type=button])').first().click();
  await bp.waitForTimeout(2000);
  await bp.goto(`${SHOP}/login`);
  await bp.fill('#login-email', buyerEmail);
  await bp.fill('#login-password', password);
  await bp.locator('form:has(#login-password) button:not([type=button])').click();
  await bp.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
});
await step('buyer confirms receipt and rates the item', bp, async () => {
  await bp.goto(orderUrl);
  const receipt = bp.locator('form:has(input[name=sellerOrderId])', { hasText: /reçu|Confirmer/i }).first();
  for (const box of await receipt.locator('input[type=checkbox]').all()) await box.check();
  await receipt.locator('button:not([type=button])').click();
  await bp.locator('.review-form').first().waitFor({ timeout: 20000 });
  await bp.locator('.review-stars label').last().click();
  await bp.locator('.review-form textarea').first().fill('Très beau tapis, conforme à la description.');
  await bp.locator('.review-form button:not([type=button])').first().click();
  await bp.locator('.review-form [role=status], .order-reviews [role=status]').first().waitFor({ timeout: 15000 });
});
await step('buyer opens a support request', bp, async () => {
  await bp.goto(orderUrl);
  await bp.locator('a[href*="/support"][href*="sellerOrderId="]').first().click();
  await bp.selectOption('#support-action', { index: 1 });
  await bp.fill('#support-body', 'Pouvez-vous me donner l’entretien conseillé pour ce tapis ?');
  await bp.locator('form:has(#support-body) button:not([type=button])').click();
  // Saved: the message appears in the case history (not just in the text box).
  await bp.locator('ol li', { hasText: 'Pouvez-vous me donner' }).first().waitFor({ timeout: 15000 });
});
await step('seller replies to the support request', sp, async () => {
  await sp.goto(`${SELLER}/support?lang=fr&staff=0`);
  await sp.locator('.seller-order-card', { hasText: store }).first().getByRole('link').first().click();
  await sp.fill('#support-body', 'Aspirez sans brosse rotative et lavez à froid.');
  await sp.locator('form:has(#support-body) button:not([type=button])').click();
  await sp.getByText('Aspirez sans brosse').first().waitFor({ timeout: 15000 });
});
await step('staff sees the indicators page', st, async () => {
  await st.goto(`${SELLER}/admin`);
  await st.getByRole('heading', { name: 'Indicateurs' }).waitFor({ timeout: 15000 });
});

await step('staff delete the customer account, then the vendor account', st, async () => {
  await st.goto(`${SELLER}/admin/customers?lang=fr&email=${encodeURIComponent(buyerEmail)}`);
  const customer = st.locator('li', { hasText: buyerEmail });
  await customer.locator('input[name=confirm]').check();
  await customer.locator('button').click();
  // Deleted: the account no longer matches its old email.
  await customer.waitFor({ state: 'detached', timeout: 15000 });
  await st.goto(`${SELLER}/admin/sellers`);
  await st.locator('tr', { hasText: store }).getByRole('link').click();
  const zone = st.locator('.danger-zone');
  await zone.locator('input[name=confirm]').check();
  await zone.locator('button').click();
  await st.getByText('Supprimé').first().waitFor({ timeout: 15000 });
  // Both logins are gone.
  const shop = await (await context(390)).newPage();
  await shop.goto(`${SHOP}/login`);
  await shop.fill('#login-email', buyerEmail);
  await shop.fill('#login-password', password);
  await shop.locator('form:has(#login-password) button:not([type=button])').click();
  await shop.locator('[role=alert]').first().waitFor({ timeout: 15000 });
  const seller = await (await context()).newPage();
  await seller.goto(`${SELLER}/login`);
  await seller.fill('#login-email', sellerEmail);
  await seller.fill('#login-password', password);
  await seller.locator('form.auth-form button:not([type=button])').last().click();
  await seller.locator('[role=alert]').first().waitFor({ timeout: 15000 });
});

await browser.close();
for (const r of results) console.log(r.join(' | '));
process.exitCode = failed ? 1 : 0;
