/** Product lists kept only in this browser (never sent as account data). */
export const FAVORITES_KEY = 'atlas.favorite-products';
export const RECENT_KEY = 'atlas.recent-products';

export function readList(key: string, limit = 200): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string').slice(0, limit)
      : [];
  } catch {
    return [];
  }
}

/** Puts `slug` first (no duplicates), keeping at most `limit` entries. */
export function remember(key: string, slug: string, limit: number): void {
  try {
    const next = [slug, ...readList(key, limit).filter((item) => item !== slug)].slice(0, limit);
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Storage blocked (private mode): nothing is remembered.
  }
}
