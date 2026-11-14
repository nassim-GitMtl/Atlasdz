export interface Environment {
  readonly [key: string]: string | undefined;
  readonly APP_ENV?: string | undefined;
  readonly ATLAS_LOCAL_ACCOUNTS?: string | undefined;
  readonly SELLER_API_BASE_URL?: string | undefined;
  readonly SELLER_WEB_ORIGIN?: string | undefined;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function apiOrigin(environment: Environment): string {
  const url = new URL(environment.SELLER_API_BASE_URL ?? 'http://127.0.0.1:3000');
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('Invalid API origin');
  return url.origin;
}

export function localAccountsEnabled(
  environment: Environment,
  requestHost: string | null,
): boolean {
  if (
    !['local', 'test'].includes(environment.APP_ENV ?? '') ||
    environment.ATLAS_LOCAL_ACCOUNTS !== 'true'
  )
    return false;
  try {
    const api = new URL(apiOrigin(environment));
    const web = new URL(`http://${requestHost ?? ''}`);
    return (
      api.protocol === 'http:' &&
      LOCAL_HOSTS.has(api.hostname) &&
      api.port === '3003' &&
      LOCAL_HOSTS.has(web.hostname) &&
      web.port === '3002' &&
      web.pathname === '/' &&
      !web.username &&
      !web.password &&
      !web.search &&
      !web.hash
    );
  } catch {
    return false;
  }
}

export function trustedMutationOrigin(
  environment: Environment,
  origin: string | null,
  requestHost: string | null,
): boolean {
  if (!origin || !requestHost) return false;
  try {
    const url = new URL(origin);
    if (url.origin !== origin || url.host !== requestHost) return false;
    if (environment.SELLER_WEB_ORIGIN) {
      const expected = new URL(environment.SELLER_WEB_ORIGIN);
      return (
        expected.origin === environment.SELLER_WEB_ORIGIN &&
        url.origin === expected.origin &&
        (expected.protocol === 'https:' ||
          (LOCAL_HOSTS.has(expected.hostname) &&
            ['local', 'test'].includes(environment.APP_ENV ?? '')))
      );
    }
    return localAccountsEnabled(environment, requestHost) && url.protocol === 'http:';
  } catch {
    return false;
  }
}
