// Seller team on the local stack (Seller Center 3002, API 3003): the demo seller invites a
// member; the member opens the emailed welcome link (read from the API log), chooses a password,
// enrols two-step sign-in, handles orders but sees shop settings reserved to the owner; the owner
// removes the member, whose session ends. Synthetic data.
import { readFileSync } from 'node:fs';
import { createHmac, randomBytes } from 'node:crypto';
import { chromium } from 'playwright';

const SC = 'http://127.0.0.1:3002';
const API_LOG = process.env.ATLAS_API_LOG ?? '/tmp/atlas-local-api.log';
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
const email = `equipe-${tag}@example.dz`;
const password = 'correct horse battery 42';
const browser = await chromium.launch();
const owner = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await owner.goto(`${SC}/local-login`);
await owner.locator('form:has(input[value=seller]) button[type=submit], button[value=seller]').first().click();
await owner.waitForTimeout(2000);
await check('the owner invites a team member', async () => {
  await owner.goto(`${SC}/team?lang=fr`);
  await owner.getByRole('heading', { name: 'Équipe' }).waitFor({ timeout: 15000 });
  await owner.fill('#team-email', email);
  await owner.getByRole('button', { name: 'Inviter', exact: true }).click();
  await owner.getByText('Invitation envoyée').waitFor({ timeout: 15000 });
  await owner.getByText(email).waitFor({ timeout: 15000 });
  await owner.getByText(/invitation en attente/).first().waitFor();
});
const member = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await check('the member sets a password, enrols two-step sign-in and handles orders', async () => {
  let token;
  for (let i = 0; i < 40 && !token; i += 1) {
    const lines = readFileSync(API_LOG, 'utf8').split('\n').filter((l) => l.includes(email) && l.includes('welcome=1'));
    token = /token=([A-Za-z0-9_-]{43})/.exec(lines.at(-1) ?? '')?.[1];
    if (!token) await new Promise((r) => setTimeout(r, 250));
  }
  if (!token) throw new Error('invitation mail not logged');
  await member.goto(`${SC}/reset-password?token=${token}&lang=fr&welcome=1`);
  await member.getByRole('heading', { name: 'Bienvenue dans l’équipe' }).waitFor({ timeout: 15000 });
  await member.fill('#reset-password', password);
  await member.click('form:has(#reset-password) button[type=submit]');
  await member.waitForTimeout(1500);
  await member.goto(`${SC}/login?lang=fr`);
  await member.fill('#login-email', email);
  await member.fill('#login-password', password);
  await member.click('form.auth-form button[type=submit]');
  const key = member.locator('.enroll-key');
  await key.waitFor({ timeout: 15000 });
  await member.fill('#login-code', totp(base32Decode(await key.innerText())));
  await member.click('form.auth-form button[type=submit]');
  await member.waitForURL(/\/account|\/$|\/orders/, { timeout: 20000 });
  await member.goto(`${SC}/orders?lang=fr`);
  await member.getByRole('heading', { level: 1 }).waitFor({ timeout: 15000 });
  await member.goto(`${SC}/account?lang=fr`);
  await member.getByText('Vous êtes membre de l’équipe').waitFor({ timeout: 15000 });
  if ((await member.locator('#logo-file').count()) !== 0) throw new Error('owner settings shown');
  await member.goto(`${SC}/team?lang=fr`);
  await member.locator('.empty-state').waitFor({ timeout: 15000 });
});
await check('the owner removes the member, whose session ends', async () => {
  await owner.goto(`${SC}/team?lang=fr`);
  await owner.getByRole('button', { name: `Retirer ${email}` }).click();
  await owner.getByText(email).waitFor({ state: 'detached', timeout: 15000 });
  await member.goto(`${SC}/orders?lang=fr`);
  await member.waitForURL(/\/login|\/$/, { timeout: 15000 }).catch(() => {});
  if ((await member.locator('table, .seller-order-card').count()) > 0) throw new Error('member still sees orders');
});
await browser.close();
for (const r of results) console.log(r.join(' | '));
process.exitCode = results.some((r) => r[0] === 'FAIL') ? 1 : 0;
