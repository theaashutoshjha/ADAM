import fs from 'fs';

const content = fs.readFileSync('server.ts', 'utf8');
const lines = content.split('\n');

console.log('Total lines:', lines.length);

lines.forEach((line, idx) => {
  if (line.includes('/scorecards')) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
