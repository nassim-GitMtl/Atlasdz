import { moneyToMinor } from './offer-input.ts';

/** Rows read at most from one import (the seller's whole inventory export). */
export const MAX_IMPORT_ROWS = 500;

/**
 * Parses CSV text (comma or semicolon separated, as Excel writes it in French), with quoted
 * fields, doubled quotes and CRLF line ends. A leading BOM is ignored.
 */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const separator = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === '') quoted = true;
    else if (char === separator) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

export interface ImportRow {
  readonly line: number;
  readonly id: string;
  readonly priceMinor: number;
  readonly availableQuantity: number;
}
export interface ImportProblem {
  readonly line: number;
  readonly reason: 'columns' | 'id' | 'price' | 'stock' | 'duplicate' | 'too-many';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reads the price and stock columns of the offers export (`offer_id`, `price_dzd`, `stock`);
 * other columns are ignored. Line numbers count the header as line 1.
 */
export function importRows(table: string[][]): { rows: ImportRow[]; problems: ImportProblem[] } {
  const [header = [], ...body] = table;
  const column = (name: string) => header.findIndex((cell) => cell.trim().toLowerCase() === name);
  const idAt = column('offer_id');
  const priceAt = column('price_dzd');
  const stockAt = column('stock');
  if (idAt < 0 || priceAt < 0 || stockAt < 0) return { rows: [], problems: [{ line: 1, reason: 'columns' }] };
  const rows: ImportRow[] = [];
  const problems: ImportProblem[] = [];
  const seen = new Set<string>();
  for (const [index, cells] of body.entries()) {
    const line = index + 2;
    if (index >= MAX_IMPORT_ROWS) {
      problems.push({ line, reason: 'too-many' });
      break;
    }
    const id = (cells[idAt] ?? '').trim().toLowerCase();
    if (!UUID.test(id)) {
      problems.push({ line, reason: 'id' });
      continue;
    }
    if (seen.has(id)) {
      problems.push({ line, reason: 'duplicate' });
      continue;
    }
    const priceMinor = moneyToMinor((cells[priceAt] ?? '').replace(/\s/g, ''));
    if (priceMinor === undefined || priceMinor <= 0) {
      problems.push({ line, reason: 'price' });
      continue;
    }
    const stockText = (cells[stockAt] ?? '').trim();
    if (!/^\d{1,7}$/.test(stockText) || Number(stockText) > 1_000_000) {
      problems.push({ line, reason: 'stock' });
      continue;
    }
    // Only valid rows count: a corrected line later in the file is still read.
    seen.add(id);
    rows.push({ line, id, priceMinor, availableQuantity: Number(stockText) });
  }
  return { rows, problems };
}
