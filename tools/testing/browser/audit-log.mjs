// Staff audit log in Seller Center (3002) on the local API (3003): a staff account made with
// create-staff (MFA enrollment) opens the log, filters by area and pages to older events.
import { chromium } from 'playwright';
import { createHmac, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const SC = 'http://127.0.0.1:3002';
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Decode(text) { let bits = 0, value = 0; const out = []; for (const ch of text.replace(/\s+/g, '').toUpperCase()) { value = (value << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); }
function totp(secret, offset = 0) { const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset)); const d = createHmac('sha1', secret).update(c).digest(); const o = d[d.length - 1] & 15; return String((d.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0'); }
const email = `staff-audit-${randomBytes(3).toString('hex')}@example.dz`, password = 'correct horse battery 42';
execFileSync('node', ['--env-file=../../.env.local', 'dist/create-staff.js', email], { cwd: '/Users/nams/Documents/Amazon/apps/api', input: password });
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
let ok = true;
try {
  await p.goto(`${SC}/login`);
  await p.fill('#login-email', email);
  await p.fill('#login-password', password);
  await p.click('form.auth-form button[type=submit]');
  const key = p.locator('.enroll-key');
  await key.waitFor();
  await p.fill('#login-code', totp(base32Decode(await key.innerText()), 1));
  await p.click('form.auth-form button[type=submit]');
  await p.waitForURL(/moderation/, { timeout: 15000 });
  await p.goto(`${SC}/admin/audit?lang=fr`);
  await p.getByRole('heading', { name: 'Journal d’audit' }).waitFor({ timeout: 15000 });
  const count = await p.locator('.audit-list li').count();
  if (count === 0) throw new Error('empty audit list');
  await p.selectOption('select[name=area]', 'offer');
  await p.getByRole('button', { name: 'Filtrer' }).click();
  await p.waitForURL(/area=offer/);
  await p.waitForLoadState('networkidle');
  await p.locator('.audit-list li').first().waitFor({ timeout: 15000 });
  const actions = await p.locator('.audit-list .audit-action').allInnerTexts();
  if (!actions.length || !actions.every((a) => a.startsWith('offer.'))) throw new Error(`actions ${actions.slice(0, 3)}`);
  const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (over > 0) throw new Error(`overflow ${over}`);
  
  const older = p.getByRole('link', { name: 'Événements plus anciens' });
  if (await older.count()) { await older.click(); await p.waitForURL(/beforeAt=/); await p.locator('.audit-list li').first().waitFor(); }
  console.log('PASS | staff audit log: list, area filter, paging, no overflow', count, actions.length);
} catch (e) { ok = false; console.log('FAIL | audit |', String(e.message).split('\n')[0]); }
await b.close();
process.exitCode = ok ? 0 : 1;
