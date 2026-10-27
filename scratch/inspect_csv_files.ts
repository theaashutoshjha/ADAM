import fs from 'fs';
import readline from 'readline';

async function inspectTradeCsv() {
  const filePath = '.data/uploads/1792396024091_TRADE.csv';
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let lineCount = 0;
  const header: string[] = [];
  const lines: string[] = [];

  for await (const line of rl) {
    lineCount++;
    if (lineCount === 1) {
      console.log('TRADE CSV Header:', line);
    } else if (lineCount <= 5) {
      lines.push(line);
    }
  }
  console.log(`TRADE CSV total lines: ${lineCount} (trades: ${lineCount - 1})`);
}

async function inspectCallCsv() {
  const filePath = '.data/uploads/1792396031777_Call-Performance-Report_01-10-2026_18-10-2026_1792343086487.csv';
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let lineCount = 0;
  for await (const line of rl) {
    lineCount++;
    if (lineCount === 1) {
      console.log('CALL CSV Header:', line);
    }
  }
  console.log(`CALL CSV total lines: ${lineCount} (calls: ${lineCount - 1})`);
}

async function main() {
  await inspectTradeCsv();
  await inspectCallCsv();
}

main().catch(console.error);
