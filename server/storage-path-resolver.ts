// =============================================================
// AuditEQ — Cross-Platform Storage Path Resolver
// Resolves relative, absolute, Windows, and Linux audio storage paths seamlessly.
// =============================================================

import path from 'node:path';
import fs from 'node:fs';

export function resolveStoragePath(rawPath?: string | null): string {
  if (!rawPath || typeof rawPath !== 'string') return '';
  const trimmed = rawPath.trim();
  if (!trimmed) return '';

  // 1. Direct match as provided
  if (fs.existsSync(trimmed)) {
    return path.resolve(trimmed);
  }

  // 2. Relative to process.cwd()
  const cwdRelative = path.resolve(process.cwd(), trimmed);
  if (fs.existsSync(cwdRelative)) {
    return cwdRelative;
  }

  // 3. Normalized forward-slash check
  const normalized = trimmed.replace(/\\/g, '/');
  if (normalized.includes('.data/uploads/')) {
    const subPath = normalized.substring(normalized.indexOf('.data/uploads/'));
    const candidate = path.resolve(process.cwd(), subPath);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // 4. Filename fallback inside .data/uploads and workspace subfolders
  const basename = path.basename(trimmed);
  const uploadsBase = path.resolve(process.cwd(), '.data', 'uploads');
  const fallbackUploads = path.resolve(uploadsBase, basename);
  if (fs.existsSync(fallbackUploads)) {
    return fallbackUploads;
  }

  // Check subdirectories inside .data/uploads/ (e.g. .data/uploads/customer_support/)
  if (fs.existsSync(uploadsBase)) {
    try {
      const subdirs = fs.readdirSync(uploadsBase, { withFileTypes: true }).filter((d) => d.isDirectory());
      for (const d of subdirs) {
        const candidate = path.resolve(uploadsBase, d.name, basename);
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
    } catch {}
  }

  // Return resolved path relative to cwd even if not currently on disk
  return path.resolve(process.cwd(), trimmed);
}

export function toRelativeStoragePath(fullPath: string): string {
  if (!fullPath) return '';
  const normalized = fullPath.replace(/\\/g, '/');
  if (normalized.includes('.data/uploads/')) {
    return normalized.substring(normalized.indexOf('.data/uploads/'));
  }
  return path.relative(process.cwd(), fullPath).replace(/\\/g, '/');
}
