/** Dinars with optional centimes ("1500", "1 500,5", "1500.50") → centimes, or undefined. */
export function parseDinars(value: string): number | undefined {
  const match = /^(\d{1,8})(?:[.,](\d{1,2}))?$/.exec(value.replace(/\s/g, ''));
  if (!match) return undefined;
  const minor = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return minor > 0 && minor <= 2_000_000_000 ? minor : undefined;
}

/** A whole stock quantity up to one million, or undefined. */
export function parseStock(value: string): number | undefined {
  const text = value.trim();
  if (!/^\d{1,7}$/.test(text)) return undefined;
  const quantity = Number(text);
  return quantity <= 1_000_000 ? quantity : undefined;
}

/** Centimes as the dinars a seller types: "1500" or "1500.50". */
export const dinarsText = (minor: number) =>
  minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);
