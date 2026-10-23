// Excel on Slovenian Windows saves CSV as Windows-1250; fall back to it when the file isn't valid UTF-8
export function decodeCsvBuffer(buf: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(buf);
  } catch {
    return new TextDecoder('windows-1250').decode(buf);
  }
}

// RFC 4180 style parser: handles quoted fields with delimiters, escaped quotes and line breaks
export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// Picks ';' or ',' from the header line and returns non-empty rows
export function readCsvRows(buf: Buffer): string[][] {
  const content = decodeCsvBuffer(buf);
  const firstLine = content.slice(0, content.search(/\r?\n|$/));
  const delimiter = firstLine.split(';').length >= firstLine.split(',').length ? ';' : ',';
  return parseCsv(content, delimiter).filter((r) => r.some((v) => v.trim() !== ''));
}

export function escapeCsv(v: string | number | null | undefined): string {
  const s = String(v ?? '');
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
