/** One CSV cell, always quoted; a leading formula character is neutralised for spreadsheets. */
export const cell = (value: string | number) => {
  const text = String(value);
  return `"${(/^[=+\-@]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`;
};

/** CSV text with a BOM, so Excel reads Arabic and accented letters correctly. */
export const csvText = (header: readonly string[], rows: readonly (string | number)[][]) =>
  `\uFEFF${[header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`;
