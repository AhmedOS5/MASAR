// Minimal, safe CSV in/out (RFC 4180 quoting). Output is UTF-8 with a BOM so Excel shows Arabic correctly,
// and cells that a spreadsheet would execute as formulas (= + - @ …) are neutralised.

const FORMULA = /^[=+\-@\t\r]/;

function cell(value) {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (FORMULA.test(s)) s = `'${s}`; // CSV/formula injection
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** columns: [{ header, value: (row) => any }] */
export function toCsv(rows, columns) {
  const lines = [columns.map((c) => cell(c.header)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => cell(c.value(row))).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** Parses CSV text into an array of rows (arrays of strings). Handles quotes, escaped quotes, CRLF, BOM. */
export function parseCsv(input) {
  const text = String(input).replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
