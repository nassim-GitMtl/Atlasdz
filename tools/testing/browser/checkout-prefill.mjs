// Repeat buyer (shop 3001, API 3003): the local demo customer's cart checkout form starts from
// the last order's contact and commune, with that commune's fee shown. The cart is emptied after.
import { chromium } from 'playwright';
const SHOP = 'http://127.0.0.1:3001', API = 'http://127.0.0.1:3003';
const token = (await (await fetch(`${API}/api/v1/local/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account: 'customer' }) })).json()).accessToken;
const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const last = (await (await fetch(`${API}/api/v1/orders`, { headers: auth })).json()).items[0];
const clear = async () => { let cart = await (await fetch(`${API}/api/v1/cart`, { headers: auth })).json(); for (const line of cart.items) cart = await (await fetch(`${API}/api/v1/cart/items/${line.offerId}`, { method: 'PUT', headers: auth, body: JSON.stringify({ quantity: 0, expectedVersion: cart.version }) })).json(); return cart; };
const cart = await clear();
const product = (await (await fetch(`${API}/api/v1/catalog/products/earbuds-wireless`)).json());
await fetch(`${API}/api/v1/cart/items/${product.offers[0].id}`, { method: 'PUT', headers: auth, body: JSON.stringify({ quantity: 1, expectedVersion: cart.version }) });
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' })).newPage();
let ok = true;
try {
  await p.goto(`${SHOP}/login`);
  await p.click('.auth-local form button[type=submit]');
  await p.waitForURL((u) => u.pathname === '/cart', { timeout: 15000 });
  await p.getByText('Coordonnées de votre dernière commande').waitFor({ timeout: 15000 });
  const name = await p.locator('input[name=recipientName]').inputValue();
  if (name !== last.quote.deliveryContact.recipientName) throw new Error(`name ${name}`);
  const destination = await p.locator('select[name=destinationId]').inputValue();
  if (destination !== last.quote.destination.id) throw new Error(`destination ${destination}`);
  await p.getByText('Livraison vers cette commune').waitFor({ timeout: 15000 });
  console.log('PASS | checkout starts from the last order', name);
} catch (e) { ok = false; console.log('FAIL | prefill |', String(e.message).split('\n')[0]); }
finally { await clear(); await b.close(); }
process.exitCode = ok ? 0 : 1;
