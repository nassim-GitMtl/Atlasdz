import { API_URL } from './config';

/** An API failure: the API's error code (e.g. EMAIL_NOT_VERIFIED) or NETWORK / HTTP_<status>. */
export class ApiError extends Error {
  public constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

export interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly body?: unknown;
  readonly token?: string | null;
  readonly headers?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  /** Binary upload (seller photos) sent as-is with `contentType`. */
  readonly rawBody?: Blob;
  readonly contentType?: string;
}

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

const parse = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/** Calls the Atlas DZ API with the customer's session token and returns the JSON body. */
export async function api<T>(
  path: string,
  options: RequestOptions = {},
  fetcher: Fetch = fetch,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  let response: Response;
  try {
    response = await fetcher(`${API_URL}${path}`, {
      method:
        options.method ??
        (options.body === undefined && options.rawBody === undefined ? 'GET' : 'POST'),
      headers: {
        accept: 'application/json',
        ...(options.rawBody !== undefined
          ? { 'content-type': options.contentType ?? 'application/octet-stream' }
          : options.body === undefined
            ? {}
            : { 'content-type': 'application/json' }),
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        ...options.headers,
      },
      body:
        options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError('NETWORK', 0);
  } finally {
    clearTimeout(timer);
  }
  const data = response.status === 204 ? undefined : parse(await response.text());
  if (!response.ok) {
    const code =
      typeof data === 'object' &&
      data !== null &&
      typeof (data as { code?: unknown }).code === 'string'
        ? (data as { code: string }).code
        : response.status === 401
          ? 'AUTHENTICATION_REQUIRED'
          : `HTTP_${response.status}`;
    throw new ApiError(code, response.status);
  }
  return data as T;
}

/** The error code of anything thrown by `api` (NETWORK / UNKNOWN for other failures). */
export const errorCode = (error: unknown): string =>
  error instanceof ApiError ? error.code : 'UNKNOWN';
