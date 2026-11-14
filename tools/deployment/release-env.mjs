import { readFile } from 'node:fs/promises';

export class ReleaseConfigurationError extends Error {
  constructor(field) {
    super(`Invalid release configuration: ${field}`);
    this.name = 'ReleaseConfigurationError';
  }
}
const fail = (field) => {
  throw new ReleaseConfigurationError(field);
};
// Optional secrets: an empty mounted file means "not configured".
const OPTIONAL_SECRETS = new Set(['SMTP_URL', 'SMS_GATEWAY_TOKEN']);
export async function loadReleaseSecrets(source) {
  const env = { ...source };
  for (const key of [
    'DATABASE_URL',
    'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY',
    'IDENTITY_SECRET_KEY',
    'SMTP_URL',
    'SMS_GATEWAY_TOKEN',
  ]) {
    const file = env[`${key}_FILE`];
    if (!file) continue;
    if (env[key]) fail(key);
    try {
      const value = await readFile(file, 'utf8');
      if (value.length > 8192) fail(key);
      if (value.trim()) env[key] = value.trim();
      else if (!OPTIONAL_SECRETS.has(key)) fail(key);
    } catch {
      fail(`${key}_FILE`);
    }
    Reflect.deleteProperty(env, `${key}_FILE`);
  }
  return env;
}
const base64Key = (key) =>
  typeof key === 'string' &&
  /^[A-Za-z0-9+/]{43}=$/.test(key) &&
  Buffer.from(key, 'base64').length === 32 &&
  Buffer.from(key, 'base64').toString('base64') === key;
function origin(value, field, internal = false) {
  try {
    const url = new URL(value);
    if (
      url.origin !== value ||
      url.username ||
      url.password ||
      (url.protocol !== 'https:' && !(internal && value === 'http://api:3000')) ||
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    )
      fail(field);
    return url;
  } catch {
    fail(field);
  }
}
const LEGAL_FACTS = [
  'ATLAS_LEGAL_NAME',
  'ATLAS_LEGAL_ADDRESS',
  'ATLAS_LEGAL_RC',
  'ATLAS_LEGAL_NIF',
  'ATLAS_LEGAL_EMAIL',
  'ATLAS_LEGAL_PHONE',
  'ATLAS_LEGAL_HOST',
];
/**
 * Real orders cannot start until legal pages carry real facts, counsel review is confirmed and
 * email works (customers must confirm their address before a cash-on-delivery order).
 */
function requireLegalForLiveCheckout(service, env) {
  if (env.ATLAS_LIVE_CHECKOUT !== 'true') return;
  if (env.ATLAS_LEGAL_REVIEWED !== 'true') fail('ATLAS_LEGAL_REVIEWED');
  if (service === 'api' && !/^smtps?:\/\/\S+$/.test(env.SMTP_URL ?? '')) fail('SMTP_URL');
  if (service === 'customer-web') {
    for (const key of LEGAL_FACTS) if (!env[key]?.trim()) fail(key);
  }
}
export function validateReleaseEnvironment(service, env) {
  if (!['api', 'migrate', 'create-staff', 'customer-web', 'seller-center'].includes(service))
    fail('service');
  if (!['production', 'staging'].includes(env.APP_ENV)) fail('APP_ENV');
  if (env.NODE_ENV !== 'production') fail('NODE_ENV');
  for (const key of [
    'ATLAS_LOCAL_ACCOUNTS',
    'ATLAS_LOCAL_CHECKOUT',
    'ENABLE_ELECTRONIC_PAYMENTS',
    'ENABLE_REAL_PAYOUTS',
  ]) {
    if (env[key] !== undefined && env[key] !== 'false') fail(key);
  }
  if (['api', 'customer-web'].includes(service)) requireLegalForLiveCheckout(service, env);
  if (env.NODE_TLS_REJECT_UNAUTHORIZED !== undefined && env.NODE_TLS_REJECT_UNAUTHORIZED !== '1')
    fail('NODE_TLS_REJECT_UNAUTHORIZED');
  if (['api', 'migrate', 'create-staff'].includes(service)) {
    if (env.DATABASE_SSL !== 'true') fail('DATABASE_SSL');
    try {
      const url = new URL(env.DATABASE_URL);
      if (
        !['postgres:', 'postgresql:'].includes(url.protocol) ||
        !url.hostname ||
        !url.username ||
        !url.password ||
        url.pathname.length < 2 ||
        url.hash ||
        [...url.searchParams.keys()].some((k) => k.toLowerCase().startsWith('ssl'))
      )
        fail('DATABASE_URL');
    } catch {
      fail('DATABASE_URL');
    }
    if (service === 'api' || service === 'create-staff') {
      if (!base64Key(env.IDENTITY_SECRET_KEY)) fail('IDENTITY_SECRET_KEY');
      if (
        env.ATLAS_LIVE_CHECKOUT !== undefined &&
        !['true', 'false'].includes(env.ATLAS_LIVE_CHECKOUT)
      )
        fail('ATLAS_LIVE_CHECKOUT');
    }
    if (service === 'api') {
      if (!env.CORS_ALLOWED_ORIGINS) fail('CORS_ALLOWED_ORIGINS');
      for (const value of env.CORS_ALLOWED_ORIGINS.split(','))
        origin(value.trim(), 'CORS_ALLOWED_ORIGINS');
    }
  } else {
    const customer = service === 'customer-web';
    origin(
      env[customer ? 'CUSTOMER_WEB_ORIGIN' : 'SELLER_WEB_ORIGIN'],
      customer ? 'CUSTOMER_WEB_ORIGIN' : 'SELLER_WEB_ORIGIN',
    );
    origin(
      env[customer ? 'CATALOG_API_BASE_URL' : 'SELLER_API_BASE_URL'],
      customer ? 'CATALOG_API_BASE_URL' : 'SELLER_API_BASE_URL',
      true,
    );
    if (!base64Key(env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY))
      fail('NEXT_SERVER_ACTIONS_ENCRYPTION_KEY');
  }
  return env;
}
