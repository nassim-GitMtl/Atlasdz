import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cell, csvText } from './csv.ts';

test('CSV cells are quoted and spreadsheet formulas neutralised', () => {
  assert.equal(cell('Plateau'), '"Plateau"');
  assert.equal(cell(1500), '"1500"');
  assert.equal(cell('Dit "cuivre"'), '"Dit ""cuivre"""');
  for (const formula of ['=HYPERLINK("x")', '+1', '-2', '@SUM(A1)'])
    assert.ok(cell(formula).startsWith(`"'`), formula);
  assert.equal(cell('صينية نحاسية'), '"صينية نحاسية"');
});

test('CSV text starts with a BOM and uses CRLF lines', () => {
  const text = csvText(['a', 'b'], [[1, 'x']]);
  assert.ok(text.startsWith('\uFEFF"a","b"\r\n"1","x"\r\n'));
});
