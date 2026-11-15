import {
  DeliveryFeesSchema,
  CatalogProductListSchema,
  CatalogProductSchema,
  CatalogCategoryListSchema,
  CatalogSellerSchema,
  DeliveryDestinationSchema,
  ReviewPageSchema,
  type CatalogProduct,
  type CatalogSeller,
  type ReviewPage,
} from '@atlas/contracts';
import { z } from 'zod';

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:3000';
const REQUEST_TIMEOUT_MS = 5_000;

export class CatalogNotFoundError extends Error {
  constructor(resource: string) {
    super(`${resource} was not found`);
    this.name = 'CatalogNotFoundError';
  }
}

export class CatalogServiceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'CatalogServiceError';
  }
}

function apiBaseUrl(): URL {
  const configured = process.env.CATALOG_API_BASE_URL ?? DEFAULT_API_BASE_URL;
  let url: URL;
  try {
    url = new URL(configured);
  } catch (error) {
    throw new CatalogServiceError('CATALOG_API_BASE_URL is not a valid URL', { cause: error });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new CatalogServiceError('CATALOG_API_BASE_URL must use HTTP or HTTPS');
  }
  return url;
}

async function requestJson<T>(path: string, schema: z.ZodType<T>, resource: string): Promise<T> {
  const url = new URL(path, apiBaseUrl());
  let response: Response;
  try {
    response = await fetch(url, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new CatalogServiceError('The catalog API could not be reached', { cause: error });
  }

  if (response.status === 404) throw new CatalogNotFoundError(resource);
  if (!response.ok) {
    throw new CatalogServiceError(`The catalog API returned HTTP ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new CatalogServiceError('The catalog API returned invalid JSON', { cause: error });
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new CatalogServiceError('The catalog API response does not match the public contract', {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

export interface ProductFilters {
  readonly query?: string | undefined;
  readonly category?: string | undefined;
  readonly seller?: string | undefined;
}

export async function getProducts(filters: ProductFilters = {}): Promise<CatalogProduct[]> {
  const query = new URLSearchParams();
  if (filters.query) query.set('query', filters.query);
  if (filters.category) query.set('category', filters.category);
  if (filters.seller) query.set('seller', filters.seller);
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  const result = await requestJson(
    `/api/v1/catalog/products${suffix}`,
    CatalogProductListSchema,
    'product list',
  );
  return result.items;
}

export function getProduct(slug: string): Promise<CatalogProduct> {
  return requestJson(
    `/api/v1/catalog/products/${encodeURIComponent(slug)}`,
    CatalogProductSchema,
    'product',
  );
}

export function getSeller(slug: string): Promise<CatalogSeller> {
  return requestJson(
    `/api/v1/catalog/sellers/${encodeURIComponent(slug)}`,
    CatalogSellerSchema,
    'seller',
  );
}

/** Published reviews of a product or of a seller's shop (newest first, with the averages). */
export function getReviews(kind: 'products' | 'sellers', slug: string): Promise<ReviewPage> {
  return requestJson(
    `/api/v1/catalog/${kind}/${encodeURIComponent(slug)}/reviews`,
    ReviewPageSchema,
    'reviews',
  );
}

/** Wilayas and communes for the checkout form (public: needed before any account exists). */
export async function getDestinations() {
  return (
    await requestJson(
      '/api/v1/delivery/destinations',
      z.object({ items: DeliveryDestinationSchema.array().max(2000) }),
      'destinations',
    )
  ).items;
}

export interface ProductPage {
  readonly items: CatalogProduct[];
  /** Matches in the whole catalogue. */
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

/** One page of results, sorted and filtered by the API across the whole catalogue. */
export async function getProductPage(
  filters: ProductFilters & {
    readonly sort?: string | undefined;
    readonly available?: boolean;
    readonly page?: number;
    readonly limit?: number;
  } = {},
): Promise<ProductPage> {
  const query = new URLSearchParams();
  if (filters.query) query.set('query', filters.query);
  if (filters.category) query.set('category', filters.category);
  if (filters.seller) query.set('seller', filters.seller);
  if (filters.sort) query.set('sort', filters.sort);
  if (filters.available) query.set('available', 'true');
  if (filters.page && filters.page > 1) query.set('page', String(filters.page));
  query.set('limit', String(filters.limit ?? 24));
  const result = await requestJson(
    `/api/v1/catalog/products?${query.toString()}`,
    CatalogProductListSchema,
    'product list',
  );
  return {
    items: result.items,
    total: result.total ?? result.items.length,
    page: result.page ?? 1,
    pageSize: result.pageSize ?? result.items.length,
  };
}

/** Categories that have products on sale (the browsing filters). */
export async function getCategories() {
  return (await requestJson('/api/v1/catalog/categories', CatalogCategoryListSchema, 'categories'))
    .items;
}

/** Each seller's delivery fee to one commune, or that it does not deliver there. */
export async function getDeliveryFees(destinationId: string, sellerIds: readonly string[]) {
  const params = new URLSearchParams({ destinationId, sellerIds: sellerIds.join(',') });
  return (await requestJson(`/api/v1/delivery/fees?${params.toString()}`, DeliveryFeesSchema, 'delivery fees'))
    .items;
}
