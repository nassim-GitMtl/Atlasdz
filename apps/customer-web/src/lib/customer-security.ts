export interface CustomerEnvironment {
  readonly [key: string]: string | undefined;
}
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
export function customerApiOrigin(env: CustomerEnvironment): string {
  const url = new URL(env['CATALOG_API_BASE_URL'] ?? 'http://127.0.0.1:3000');
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('Invalid customer API origin');
  return url.origin;
}
export function customerLocalEnabled(env: CustomerEnvironment, host: string | null): boolean {
  if (!['local', 'test'].includes(env['APP_ENV'] ?? '') || env['ATLAS_LOCAL_ACCOUNTS'] !== 'true')
    return false;
  try {
    const api = new URL(customerApiOrigin(env));
    const web = new URL(`http://${host ?? ''}`);
    return (
      api.protocol === 'http:' &&
      localHosts.has(api.hostname) &&
      api.port === '3003' &&
      localHosts.has(web.hostname) &&
      web.port === '3001' &&
      web.host === host
    );
  } catch {
    return false;
  }
}
export function customerTrustedOrigin(
  env: CustomerEnvironment,
  origin: string | null,
  host: string | null,
): boolean {
  if (!origin || !host) return false;
  try {
    const url = new URL(origin);
    if (url.origin !== origin || url.host !== host) return false;
    if (env['CUSTOMER_WEB_ORIGIN'])
      return url.origin === env['CUSTOMER_WEB_ORIGIN'] && url.protocol === 'https:';
    return customerLocalEnabled(env, host) && url.protocol === 'http:';
  } catch {
    return false;
  }
}
export function customerLocalCheckoutEnabled(
  env: CustomerEnvironment,
  host: string | null,
): boolean {
  return env['ATLAS_LOCAL_CHECKOUT'] === 'true' && customerLocalEnabled(env, host);
}
/** Checkout is open when the deployment runs live COD, or in the explicit local test harness. */
export function customerCheckoutEnabled(env: CustomerEnvironment, host: string | null): boolean {
  return env['ATLAS_LIVE_CHECKOUT'] === 'true' || customerLocalCheckoutEnabled(env, host);
}
