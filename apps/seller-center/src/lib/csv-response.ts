import { NextResponse } from 'next/server';
import { csvText } from './csv';

/** A CSV download named `<name>-<date>.csv`, never cached. */
export function csvResponse(
  name: string,
  header: readonly string[],
  rows: readonly (string | number)[][],
) {
  return new NextResponse(csvText(header, rows), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
