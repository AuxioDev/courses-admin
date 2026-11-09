// Splits one line of a CSV file. Fields may be quoted, with "" for a literal quote.
export function parseCsvLine(line: string, delimiter: string) {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted && c === '"' && line[i + 1] === '"') {
      field += '"';
      i++;
    } else if (c === '"') quoted = !quoted;
    else if (c === delimiter && !quoted) {
      fields.push(field);
      field = "";
    } else field += c;
  }
  fields.push(field);
  return fields.map((f) => f.trim());
}

// Spreadsheets run a cell that starts with one of these as a formula.
export function csvCell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

// The byte order mark makes Excel read az and ru letters correctly.
export function csvFile(rows: string[][]) {
  return `﻿${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
