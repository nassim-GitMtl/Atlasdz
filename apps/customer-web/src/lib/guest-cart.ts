import { CatalogSlugSchema, UuidSchema, type CartLine, type CustomerCart } from '@atlas/contracts';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { getProduct } from './catalog-api';
import { getCart, setCartItem } from './cart-client';

/** Signed-out shoppers keep their cart in this cookie until checkout or sign-in. */
export const GUEST_CART_COOKIE = 'atlas_guest_cart';
/** Keeps the cookie well under the 4 KB browser limit. */
export const GUEST_CART_LINES = 20;

const GuestLineSchema = z
  .object({
    offerId: UuidSchema,
    slug: CatalogSlugSchema,
    quantity: z.number().int().min(1).max(99),
  })
  .strict();
export type GuestLine = z.infer<typeof GuestLineSchema>;

export async function readGuestCart(): Promise<GuestLine[]> {
  const raw = (await cookies()).get(GUEST_CART_COOKIE)?.value;
  if (!raw) return [];
  try {
    const parsed = z.array(GuestLineSchema).max(GUEST_CART_LINES).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export async function writeGuestCart(lines: readonly GuestLine[]): Promise<void> {
  const jar = await cookies();
  if (lines.length === 0) {
    jar.delete(GUEST_CART_COOKIE);
    return;
  }
  jar.set(GUEST_CART_COOKIE, JSON.stringify(lines.slice(0, GUEST_CART_LINES)), {
    httpOnly: true,
    sameSite: 'lax',
    secure: (process.env['CUSTOMER_WEB_ORIGIN'] ?? '').startsWith('https:'),
    path: '/',
    maxAge: 30 * 24 * 3600,
  });
}

/** Sets one line (0 removes it); `null` when the cart is full. */
export function withLine(
  lines: readonly GuestLine[],
  line: GuestLine | { readonly offerId: string; readonly quantity: 0 },
): GuestLine[] | null {
  const others = lines.filter((existing) => existing.offerId !== line.offerId);
  if (line.quantity === 0) return others;
  const current = lines.find((existing) => existing.offerId === line.offerId);
  if (!current && others.length >= GUEST_CART_LINES) return null;
  return [...others, line as GuestLine];
}

/** The cookie cart in the signed-in cart's shape, priced from the live catalogue. */
export async function guestCart(lines: readonly GuestLine[]): Promise<CustomerCart> {
  const slugs = [...new Set(lines.map((line) => line.slug))];
  const products = new Map(
    await Promise.all(
      slugs.map(async (slug) => [slug, await getProduct(slug).catch(() => null)] as const),
    ),
  );
  const items: CartLine[] = lines.map((line) => {
    const product = products.get(line.slug) ?? null;
    const offer = product?.offers.find((candidate) => candidate.id === line.offerId) ?? null;
    const state = !offer
      ? 'UNAVAILABLE'
      : offer.availableQuantity < line.quantity
        ? 'INSUFFICIENT_STOCK'
        : 'AVAILABLE';
    return {
      offerId: line.offerId,
      quantity: line.quantity,
      state,
      product: product
        ? { id: product.id, slug: product.slug, title: product.title, imageUrl: product.imageUrl }
        : null,
      offer,
      lineSubtotalMinor: offer ? offer.priceMinor * line.quantity : null,
    };
  });
  return {
    version: 0,
    items,
    currency: 'DZD',
    availableSubtotalMinor: items.reduce(
      (sum, item) => sum + (item.state === 'AVAILABLE' ? (item.lineSubtotalMinor ?? 0) : 0),
      0,
    ),
  };
}

/** After sign-in, sign-up or guest checkout: moves the cookie cart into the account's cart. */
export async function mergeGuestCart(token: string): Promise<void> {
  const lines = await readGuestCart();
  if (lines.length === 0) return;
  let cart = await getCart(token);
  for (const line of lines) {
    const existing = cart.items.find((item) => item.offerId === line.offerId)?.quantity ?? 0;
    try {
      cart = await setCartItem(
        token,
        line.offerId,
        Math.min(99, existing + line.quantity),
        cart.version,
      );
    } catch {
      // An offer that is no longer sold is simply left out; the rest still moves.
      cart = await getCart(token);
    }
  }
  await writeGuestCart([]);
}
