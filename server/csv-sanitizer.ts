// =============================================================
// AuditEQ — Formula Injection Sanitizer (CWE-1236)
// =============================================================

/**
 * Sanitizes a cell value for safe CSV and spreadsheet export.
 * Neutralizes dynamic formula execution (e.g. =, +, -, @, \t, \r)
 * which could otherwise execute arbitrary shell commands or DDE payloads
 * when opened in spreadsheet software like Microsoft Excel or LibreOffice.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const str = String(value);
  const safeStr = /^[=+\-@\t\r]/.test(str) || /^[=+\-@\t\r]/.test(str.trimStart()) ? `'${str}` : str;
  return `"${safeStr.replace(/"/g, '""')}"`;
}
