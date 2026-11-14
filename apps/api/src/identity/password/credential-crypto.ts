import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';

// scrypt cost: N=2^15, r=8, p=1 (~32 MiB, OWASP-recommended minimum class).
const SCRYPT_LOG_N = 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

function deriveKey(password: string, salt: Buffer, logN: number, r: number, p: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      KEY_LENGTH,
      { N: 2 ** logN, r, p, maxmem: SCRYPT_MAXMEM },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt, SCRYPT_LOG_N, SCRYPT_R, SCRYPT_P);
  return [
    'scrypt',
    SCRYPT_LOG_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [logN, r, p] = parts.slice(1, 4).map(Number);
  if (
    logN === undefined ||
    r === undefined ||
    p === undefined ||
    ![logN, r, p].every(Number.isSafeInteger) ||
    logN < 14 ||
    logN > 20 ||
    r < 1 ||
    r > 32 ||
    p < 1 ||
    p > 4
  ) {
    return false;
  }
  const salt = Buffer.from(parts[4] ?? '', 'base64url');
  const expected = Buffer.from(parts[5] ?? '', 'base64url');
  if (salt.length < 16 || expected.length !== KEY_LENGTH) return false;
  const actual = await deriveKey(password, salt, logN, r, p);
  return timingSafeEqual(actual, expected);
}

/** A fixed hash verified for unknown accounts so response timing does not reveal existence. */
export const DUMMY_PASSWORD_HASH =
  'scrypt$15$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export function passwordPolicyViolation(password: string, email: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return 'PASSWORD_TOO_SHORT';
  if (password.length > PASSWORD_MAX_LENGTH) return 'PASSWORD_TOO_LONG';
  const lower = password.toLowerCase();
  const local = email.split('@')[0] ?? '';
  if (local.length >= 4 && lower.includes(local)) return 'PASSWORD_CONTAINS_EMAIL';
  if (new Set(password).size < 5) return 'PASSWORD_TOO_SIMPLE';
  return null;
}

// --- TOTP (RFC 6238, SHA-1, 30 s, 6 digits) ---

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_PERIOD_SECONDS = 30;

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const character of clean) {
    const index = BASE32.indexOf(character);
    if (index < 0) throw new Error('Invalid base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

export function generateTotpSecret(): Buffer {
  return randomBytes(20);
}

export function totpCode(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', secret).update(counter).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 15;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, '0');
}

/**
 * Returns the matched time step (±1 step of clock drift), or null.
 * Steps at or before `lastUsedStep` are refused to prevent code replay.
 */
export function verifyTotp(
  secret: Buffer,
  code: string,
  nowMs: number,
  lastUsedStep: number | null,
): number | null {
  if (!/^[0-9]{6}$/.test(code)) return null;
  const current = Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
  const given = Buffer.from(code);
  for (const step of [current - 1, current, current + 1]) {
    if (lastUsedStep !== null && step <= lastUsedStep) continue;
    if (timingSafeEqual(Buffer.from(totpCode(secret, step)), given)) return step;
  }
  return null;
}

export function otpauthUri(secret: Buffer, email: string): string {
  const issuer = 'Atlas DZ';
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${base32Encode(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${TOTP_PERIOD_SECONDS}`;
}

// --- Secret box (AES-256-GCM): version byte | 12-byte IV | ciphertext | 16-byte tag ---

export function sealSecret(key: Buffer, plaintext: Buffer): Buffer {
  if (key.length !== 32) throw new Error('Identity secret key must be 32 bytes');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([Buffer.from([1]), iv, body, cipher.getAuthTag()]);
}

export function openSecret(key: Buffer, sealed: Buffer): Buffer {
  if (key.length !== 32 || sealed.length < 1 + 12 + 1 + 16 || sealed[0] !== 1) {
    throw new Error('Sealed secret is invalid');
  }
  const iv = sealed.subarray(1, 13);
  const tag = sealed.subarray(sealed.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(sealed.subarray(13, sealed.length - 16)),
    decipher.final(),
  ]);
}
