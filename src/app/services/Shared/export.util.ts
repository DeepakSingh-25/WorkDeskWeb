/**
 * Dependency-free export helpers (CSV / Excel / PDF) used by the Reports module.
 *
 * - CSV   : RFC 4180 quoting + UTF-8 BOM so Excel opens non-ASCII text correctly.
 * - Excel : SpreadsheetML 2003 XML saved as `.xls` (opens natively in Excel / LibreOffice).
 * - PDF   : opens a print-friendly window with a styled table and calls print();
 *           the user picks "Save as PDF" in the browser print dialog.
 */

export interface ExportColumn<T = any> {
  key: string;
  label: string;
  format?: (value: any, row: T) => string;
}

/** Reads `a.b.c` style keys. */
function getValue(row: any, key: string): any {
  if (row == null) return undefined;
  if (!key.includes('.')) return row[key];
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), row);
}

/** Display text of one cell (format() wins, arrays are joined, booleans become Yes/No). */
export function cellText<T>(col: ExportColumn<T>, row: T): string {
  const v = getValue(row, col.key);
  if (col.format) {
    const f = col.format(v, row);
    return f == null ? '' : String(f);
  }
  if (v == null) return '';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
  return String(v);
}

function withExt(fileName: string, ext: string): string {
  const clean = (fileName || 'export').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'export';
  return clean.toLowerCase().endsWith('.' + ext) ? clean : `${clean}.${ext}`;
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// ---------------------------------------------------------------- CSV

function csvEscape(text: string): string {
  let s = text ?? '';
  // neutralise spreadsheet formula injection for non-numeric text
  if (/^[=+\-@\t\r]/.test(s) && isNaN(Number(s))) s = `'${s}`;
  if (/[",\r\n]/.test(s) || /^\s|\s$/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildCsv<T>(rows: T[], columns: ExportColumn<T>[]): string {
  const lines = [columns.map(c => csvEscape(c.label)).join(',')];
  rows.forEach(r => lines.push(columns.map(c => csvEscape(cellText(c, r))).join(',')));
  return lines.join('\r\n');
}

export function exportCsv<T>(rows: T[], columns: ExportColumn<T>[], fileName: string) {
  const blob = new Blob(['﻿' + buildCsv(rows, columns)], { type: 'text/csv;charset=utf-8' });
  download(blob, withExt(fileName, 'csv'));
}

// ---------------------------------------------------------------- Excel (SpreadsheetML 2003)

function xmlEscape(text: string): string {
  return String(text ?? '')
    // strip characters that are invalid in XML 1.0
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
    .replace(/\r?\n/g, '&#10;');
}

export function exportExcel<T>(rows: T[], columns: ExportColumn<T>[], fileName: string, sheetName = 'Sheet1') {
  const sheet = (sheetName || 'Sheet1').replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31) || 'Sheet1';
  const head = columns.map(c => `<Cell ss:StyleID="h"><Data ss:Type="String">${xmlEscape(c.label)}</Data></Cell>`).join('');
  const body = rows.map(r => {
    const cells = columns.map(c => {
      const raw = getValue(r, c.key);
      if (!c.format && typeof raw === 'number' && isFinite(raw)) {
        return `<Cell><Data ss:Type="Number">${raw}</Data></Cell>`;
      }
      return `<Cell><Data ss:Type="String">${xmlEscape(cellText(c, r))}</Data></Cell>`;
    }).join('');
    return `<Row>${cells}</Row>`;
  }).join('\n');
  const widths = columns.map(c => `<Column ss:AutoFitWidth="1" ss:Width="${Math.min(260, Math.max(70, c.label.length * 8))}"/>`).join('');

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" ` +
    `xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n` +
    `<Styles><Style ss:ID="Default" ss:Name="Normal"><Font ss:FontName="Calibri" ss:Size="11"/></Style>` +
    `<Style ss:ID="h"><Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>` +
    `<Interior ss:Color="#0043E0" ss:Pattern="Solid"/></Style></Styles>\n` +
    `<Worksheet ss:Name="${xmlEscape(sheet)}"><Table>${widths}\n<Row>${head}</Row>\n${body}\n</Table>` +
    `<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/>` +
    `<SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane></WorksheetOptions></Worksheet>\n</Workbook>`;

  download(new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' }), withExt(fileName, 'xls'));
}

// ---------------------------------------------------------------- PDF (print window)

function htmlEscape(text: string): string {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Returns false when the browser blocked the popup window. */
export function exportPdf<T>(title: string, rows: T[], columns: ExportColumn<T>[], subtitle?: string): boolean {
  const w = window.open('', '_blank', 'width=1100,height=800');
  if (!w) return false;
  const generated = new Date().toLocaleString();
  const head = columns.map(c => `<th>${htmlEscape(c.label)}</th>`).join('');
  const body = rows.length
    ? rows.map(r => `<tr>${columns.map(c => {
      const raw = getValue(r, c.key);
      const num = !c.format && typeof raw === 'number';
      return `<td${num ? ' class="num"' : ''}>${htmlEscape(cellText(c, r))}</td>`;
    }).join('')}</tr>`).join('')
    : `<tr><td colspan="${columns.length}" class="empty">No records</td></tr>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${htmlEscape(title)}</title>
<style>
  *{box-sizing:border-box} body{font-family:Poppins,"Segoe UI",Arial,sans-serif;color:#1d2433;margin:24px;font-size:12px}
  header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #0043E0;padding-bottom:10px;margin-bottom:14px}
  h1{font-size:20px;margin:0;color:#0043E0} .sub{color:#5B6475;margin-top:4px} .meta{color:#8A94A6;font-size:11px;text-align:right}
  table{width:100%;border-collapse:collapse} th{background:#0043E0;color:#fff;text-align:left;padding:7px 8px;font-weight:600;font-size:11px}
  td{padding:6px 8px;border-bottom:1px solid #E3E9F7;vertical-align:top} tr:nth-child(even) td{background:#F4F7FF}
  td.num{text-align:right;font-variant-numeric:tabular-nums} td.empty{text-align:center;color:#8A94A6;padding:24px}
  footer{margin-top:14px;color:#8A94A6;font-size:10px}
  thead{display:table-header-group} tr{page-break-inside:avoid}
  @page{size:landscape;margin:12mm} @media print{body{margin:0}}
</style></head><body>
<header><div><h1>${htmlEscape(title)}</h1>${subtitle ? `<div class="sub">${htmlEscape(subtitle)}</div>` : ''}</div>
<div class="meta">Generated ${htmlEscape(generated)}<br>${rows.length} record(s)</div></header>
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
<footer>Use your browser's "Save as PDF" destination to keep a PDF copy.</footer>
</body></html>`;

  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch { /* window closed */ } }, 300);
  return true;
}
