import assert from 'node:assert/strict';
import { test } from 'node:test';
import { csvText } from './csv.ts';
import { importRows, parseCsv } from './csv-import.ts';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

test('the offers export reads back (BOM, quotes, CRLF)', () => {
  const text = csvText(
    ['offer_id', 'product', 'status', 'price_dzd', 'stock'],
    [
      [A, 'Friteuse "XL", 5 L', 'APPROVED', '4500.00', 3],
      [B, '=cmd', 'APPROVED', '120.50', 0],
    ],
  );
  const table = parseCsv(text);
  assert.equal(table[1]?.[1], 'Friteuse "XL", 5 L');
  assert.deepEqual(importRows(table), {
    rows: [
      { line: 2, id: A, priceMinor: 450000, availableQuantity: 3 },
      { line: 3, id: B, priceMinor: 12050, availableQuantity: 0 },
    ],
    problems: [],
  });
});

test('semicolon files from Excel and decimal commas are accepted', () => {
  const table = parseCsv(`offer_id;price_dzd;stock\n${A};4 500,50;7\n`);
  assert.deepEqual(importRows(table).rows, [{ line: 2, id: A, priceMinor: 450050, availableQuantity: 7 }]);
});

test('bad lines are reported, never sent', () => {
  const table = parseCsv(
    `offer_id,price_dzd,stock\nnope,10,1\n${A},abc,1\n${B},10,-1\n${A},10,1\n${A},12,1\n`,
  );
  const result = importRows(table);
  assert.deepEqual(result.problems, [
    { line: 2, reason: 'id' },
    { line: 3, reason: 'price' },
    { line: 4, reason: 'stock' },
    { line: 6, reason: 'duplicate' },
  ]);
  assert.deepEqual(result.rows.map((row) => row.line), [5]);
  assert.deepEqual(importRows(parseCsv('a,b\n1,2\n')).problems, [{ line: 1, reason: 'columns' }]);
});
