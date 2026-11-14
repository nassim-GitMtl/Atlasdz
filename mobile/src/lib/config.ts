const origin = (value: string | undefined) => (value ?? '').trim().replace(/\/+$/, '');

/**
 * The shop website: product images (/assets, /media), legal pages and email links. In
 * production the same domain also forwards the customer API (infra/release/vps/Caddyfile).
 */
export const SHOP_URL = origin(process.env.EXPO_PUBLIC_SHOP_URL) || 'http://127.0.0.1:3001';
/** The API; only differs from the shop in local development (API on its own port). */
export const API_URL = origin(process.env.EXPO_PUBLIC_API_URL) || SHOP_URL;

const SELLER_PHOTO =
  /^\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.webp$/;

/**
 * Absolute image address. Seller photos have a 640 px variant for cards and thumbnails; the
 * shop serves both under /media, bundled catalogue images under /assets.
 */
export function imageUri(path: string, size: 'small' | 'large' = 'large'): string {
  const photo = SELLER_PHOTO.exec(path);
  if (photo && size === 'small') return `${SHOP_URL}/media/${photo[1]}-640.webp`;
  return `${SHOP_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/** A page of the shop website in the chosen language (legal pages, data download). */
export const webPage = (path: string, locale: 'fr' | 'ar') => `${SHOP_URL}${path}?lang=${locale}`;
