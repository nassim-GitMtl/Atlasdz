// Web "order again" (shop 3001, API 3003): the local demo customer reorders an earlier order
// (one placed by mobile-app.mjs) and the cart gets the items still on sale. The cart is emptied after.
import { chromium } from 'playwright';
const SHOP = 'http://127.0.0.1:3001', API = 'http://127.0.0.1:3003';
const token = (await (await fetch(`${API}/api/v1/local/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account: 'customer' }) })).json()).accessToken;
const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const clear = async () => { let cart = await (await fetch(`${API}/api/v1/cart`, { headers: auth })).json(); for (const line of cart.items) cart = await (await fetch(`${API}/api/v1/cart/items/${line.offerId}`, { method: 'PUT', headers: auth, body: JSON.stringify({ quantity: 0, expectedVersion: cart.version }) })).json(); };
await clear();
const orders = (await (await fetch(`${API}/api/v1/orders`, { headers: auth })).json()).items;
if (!orders?.length) throw new Error('demo customer has no orders');
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' })).newPage();
let ok = true;
try {
  await p.goto(`${SHOP}/login`);
  await p.click('.auth-local form button[type=submit]');
  await p.waitForURL((u) => u.pathname === '/cart', { timeout: 15000 });
  await p.goto(`${SHOP}/orders/${orders[0].id}`);
  await p.getByRole('button', { name: 'Commander à nouveau' }).click({ timeout: 15000 });
  await p.waitForURL(/\/cart.*reordered=/, { timeout: 15000 });
  await p.getByText(/remis dans le panier/).waitFor();
  const cart = await (await fetch(`${API}/api/v1/cart`, { headers: auth })).json();
  if (cart.items.length === 0) throw new Error('cart empty after reorder');
  console.log('PASS | web order again fills the cart', cart.items.length);
} catch (e) { ok = false; console.log('FAIL | reorder |', String(e.message).split('\n')[0]); }
finally { await clear(); await b.close(); }
process.exitCode = ok ? 0 : 1;
