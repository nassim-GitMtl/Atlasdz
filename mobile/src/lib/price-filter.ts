/** A whole-dinar price bound typed by the shopper, or undefined when empty or invalid. */
export function parsePriceBound(value: string): number | undefined {
  if (!/^\d{1,8}$/.test(value.trim())) return undefined;
  const dinars = Number(value.trim());
  // The API accepts prices up to 2 000 000 000 centimes (20 000 000 DA).
  return dinars <= 20_000_000 ? dinars : undefined;
}

/** Catalogue query parameters for the filters (prices in centimes). */
export function filterParams(filters: {
  readonly inStock: boolean;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
}): Record<string, string> {
  return {
    ...(filters.inStock ? { available: 'true' } : {}),
    ...(filters.min !== undefined ? { minPrice: String(filters.min * 100) } : {}),
    ...(filters.max !== undefined ? { maxPrice: String(filters.max * 100) } : {}),
  };
}
