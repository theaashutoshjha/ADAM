import fs from 'fs';

const content = fs.readFileSync('server.ts', 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.includes('/export') || line.includes('/download') || (line.includes('apiRouter.get(') && (line.includes('client') || line.includes('master')))) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
