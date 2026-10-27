import fs from 'fs';

const serverCode = fs.readFileSync('server.ts', 'utf-8');
const lines = serverCode.split('\n');

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('Terminating stale dev process') || lines[i].includes('occupying port')) {
    console.log(`L${i+1}: ${lines[i]}`);
    for (let j = i; j < i + 20; j++) {
      console.log(`${j+1}: ${lines[j]}`);
    }
  }
}
