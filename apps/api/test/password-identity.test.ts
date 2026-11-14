import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';

import {
  base32Decode,
  base32Encode,
  DUMMY_PASSWORD_HASH,
  hashPassword,
  openSecret,
  passwordPolicyViolation,
  sealSecret,
  totpCode,
  verifyPassword,
  verifyTotp,
} from '../src/identity/password/credential-crypto.js';
import { slugify } from '../src/identity/password/password-identity.js';
import { InMemoryRateLimiter } from '../src/rate-limit/in-memory-rate-limiter.js';

describe('credential crypto', () => {
  it('hashes and verifies passwords with unique salts', async () => {
    const first = await hashPassword('correct horse battery 42');
    const second = await hashPassword('correct horse battery 42');
    assert.notEqual(first, second);
    assert.equal(await verifyPassword('correct horse battery 42', first), true);
    assert.equal(await verifyPassword('correct horse battery 43', first), false);
    assert.equal(await verifyPassword('anything', 'scrypt$1$1$1$a$b'), false);
    assert.equal(await verifyPassword('anything', DUMMY_PASSWORD_HASH), false);
  });

  it('matches the RFC 6238 SHA-1 test vector', () => {
    const secret = Buffer.from('12345678901234567890');
    // T = 59 s -> step 1 -> 94287082 (8 digits); the 6-digit truncation is 287082.
    assert.equal(totpCode(secret, 1), '287082');
    assert.deepEqual(base32Decode(base32Encode(secret)), secret);
  });

  it('accepts ±1 step and refuses replayed steps', () => {
    const secret = randomBytes(20);
    const now = 1_700_000_000_000;
    const step = Math.floor(now / 30_000);
    assert.equal(verifyTotp(secret, totpCode(secret, step), now, null), step);
    assert.equal(verifyTotp(secret, totpCode(secret, step - 1), now, null), step - 1);
    assert.equal(verifyTotp(secret, totpCode(secret, step - 2), now, null), null);
    assert.equal(verifyTotp(secret, totpCode(secret, step), now, step), null);
    assert.equal(verifyTotp(secret, 'abcdef', now, null), null);
  });

  it('seals secrets with authenticated encryption', () => {
    const key = randomBytes(32);
    const sealed = sealSecret(key, Buffer.from('seed'));
    assert.equal(openSecret(key, sealed).toString(), 'seed');
    sealed.writeUInt8((sealed.at(-1) ?? 0) ^ 1, sealed.length - 1);
    assert.throws(() => openSecret(key, sealed));
    assert.throws(() => openSecret(randomBytes(32), sealSecret(key, Buffer.from('x'))));
  });

  it('applies the password policy', () => {
    assert.equal(passwordPolicyViolation('short', 'a@b.dz'), 'PASSWORD_TOO_SHORT');
    assert.equal(passwordPolicyViolation('aaaaaaaaaaaa', 'a@b.dz'), 'PASSWORD_TOO_SIMPLE');
    assert.equal(
      passwordPolicyViolation('amina-is-great-1', 'amina@b.dz'),
      'PASSWORD_CONTAINS_EMAIL',
    );
    assert.equal(passwordPolicyViolation('correct horse battery 42', 'amina@b.dz'), null);
  });

  it('slugifies store names', () => {
    assert.equal(slugify('Épicerie  Atlas!'), 'epicerie-atlas');
    assert.equal(slugify('متجر'), 'shop');
  });
});

describe('in-memory rate limiter', () => {
  it('enforces a fixed window per key and resets afterwards', () => {
    let now = 0;
    const limiter = new InMemoryRateLimiter(
      { login: { limit: 2, windowSeconds: 60 } },
      100,
      () => now,
    );
    assert.equal(limiter.hit('login', 'ip').allowed, true);
    assert.equal(limiter.hit('login', 'ip').allowed, true);
    assert.equal(limiter.hit('login', 'ip').allowed, false);
    assert.equal(limiter.hit('login', 'other').allowed, true);
    now = 60_000;
    assert.equal(limiter.hit('login', 'ip').allowed, true);
  });

  it('stays bounded under a key flood', () => {
    const limiter = new InMemoryRateLimiter({ x: { limit: 1, windowSeconds: 60 } }, 10, () => 0);
    for (let index = 0; index < 100; index += 1) limiter.hit('x', String(index));
    assert.ok((limiter as unknown as { windows: Map<string, unknown> }).windows.size <= 10);
  });
});
