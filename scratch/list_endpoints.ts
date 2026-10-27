import fs from 'fs';

const content = fs.readFileSync('server.ts', 'utf8');
const lines = content.split('\n');

const endpoints: { line: number; method: string; path: string }[] = [];
const regex = /apiRouter\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/g;

lines.forEach((line, idx) => {
  let match;
  while ((match = regex.exec(line)) !== null) {
    endpoints.push({ line: idx + 1, method: match[1].toUpperCase(), path: match[2] });
  }
});

console.log('Total endpoints:', endpoints.length);
endpoints.forEach(e => console.log(`${e.line}: [${e.method}] ${e.path}`));
