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
      if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') || entry.name.endsWith('.js') || entry.name.endsWith('.csv') || entry.name.endsWith('.json') || entry.name.endsWith('.md')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');
          lines.forEach((l, i) => {
            if (/client\s*master/i.test(l)) {
              console.log(`${fullPath}:${i + 1}: ${l.trim()}`);
            }
          });
        } catch {}
      }
    }
  }
}

searchDir('.');
