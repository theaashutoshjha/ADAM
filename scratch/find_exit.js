import fs from 'fs';

const serverCode = fs.readFileSync('server.ts', 'utf-8');
const lines = serverCode.split('\n');

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('process.exit')) {
    console.log(`L${i+1}: ${lines[i]}`);
  }
}
