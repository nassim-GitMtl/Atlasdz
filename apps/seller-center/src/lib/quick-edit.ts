import { UuidSchema } from '@atlas/contracts';

/** One offer row of the quick update form, as the seller left it. */
export interface QuickEditRow {
  readonly id: string;
  /** The version the seller saw; a newer one on the server means someone else edited it. */
  readonly version: number;
  readonly priceMinor: number;
  readonly availableQuantity: number;
}

/** Dinars with optional centimes ("1500", "1 500,5", "1500.50") → centimes. */
export function parseDinars(value: string): number | undefined {
  const text = value.replace(/[\s\u00a0\u202f]/g, '');
  const match = /^(\d{1,8})(?:[.,](\d{1,2}))?$/.exec(text);
  if (!match) return undefined;
  const minor = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0') || '0');
  return minor > 0 && minor <= 2_000_000_000 ? minor : undefined;
}

export function parseStock(value: string): number | undefined {
  const text = value.trim();
  if (!/^\d{1,7}$/.test(text)) return undefined;
  const quantity = Number(text);
  return quantity <= 1_000_000 ? quantity : undefined;
}

/**
 * Rows whose price or stock changed. Fields per offer id: `version-<id>`, `price-<id>`,
 * `stock-<id>`, and the values shown (`was-price-<id>`, `was-stock-<id>`). An invalid row is
 * reported by id and nothing is sent for it.
 */
export function changedRows(form: FormData): { rows: QuickEditRow[]; invalid: string[] } {
  const rows: QuickEditRow[] = [];
  const invalid: string[] = [];
  for (const raw of form.getAll('offer')) {
    const id = UuidSchema.safeParse(raw);
    if (!id.success) continue;
    const field = (name: string) => String(form.get(`${name}-${id.data}`) ?? '');
    const price = field('price');
    const stock = field('stock');
    if (price.trim() === field('was-price').trim() && stock.trim() === field('was-stock').trim())
      continue;
    const version = Number(field('version'));
    const priceMinor = parseDinars(price);
    const availableQuantity = parseStock(stock);
    if (!Number.isSafeInteger(version) || version < 1 || priceMinor === undefined || availableQuantity === undefined) {
      invalid.push(id.data);
      continue;
    }
    rows.push({ id: id.data, version, priceMinor, availableQuantity });
  }
  return { rows, invalid };
}
