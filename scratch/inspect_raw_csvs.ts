import fs from 'node:fs';
import readline from 'node:readline';

async function inspectRawFiles() {
  const tradePath = '.data/uploads/1792396024091_TRADE.csv';
  const callPath = '.data/uploads/1792396031777_Call-Performance-Report_01-10-2026_18-10-2026_1792343086487.csv';

  console.log('Trade file exists:', fs.existsSync(tradePath));
  console.log('Call file exists:', fs.existsSync(callPath));

  // Read first 5 lines of trade file
  const tradeLines: string[] = [];
  const rlTrade = readline.createInterface({ input: fs.createReadStream(tradePath) });
  for await (const line of rlTrade) {
    tradeLines.push(line);
    if (tradeLines.length >= 6) break;
  }
  console.log('\n--- TRADE FILE HEADER & SAMPLE ---');
  tradeLines.forEach((l, i) => console.log(`[${i}]`, l));

  // Read first 5 lines of call file
  const callLines: string[] = [];
  const rlCall = readline.createInterface({ input: fs.createReadStream(callPath) });
  for await (const line of rlCall) {
    callLines.push(line);
    if (callLines.length >= 6) break;
  }
  console.log('\n--- CALL FILE HEADER & SAMPLE ---');
  callLines.forEach((l, i) => console.log(`[${i}]`, l));
}

inspectRawFiles();
