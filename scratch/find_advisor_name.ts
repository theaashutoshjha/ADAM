import fs from 'fs';
import path from 'path';

function searchDir(dir: string) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'dist', '.data'].includes(entry.name)) continue;
      searchDir(fullPath);
    } else if (entry.isFile()) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');
        lines.forEach((l, i) => {
          if (/advis[ao]r\s*name/i.test(l)) {
            console.log(`${fullPath}:${i + 1}: ${l.trim()}`);
          }
        });
      } catch {}
    }
  }
}

searchDir('.');
