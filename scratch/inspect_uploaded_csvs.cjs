const fs = require('fs');
const readline = require('readline');

async function countLines(filePath) {
  const stream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let count = 0;
  let header = '';
  for await (const line of rl) {
    if (count === 0) header = line;
    count++;
  }
  return { count: count - 1, header };
}

async function run() {
  const tradeInfo = await countLines('.data/uploads/1792396024091_TRADE.csv');
  console.log('TRADE.csv rows:', tradeInfo.count);
  console.log('TRADE.csv header:', tradeInfo.header);

  const callInfo = await countLines('.data/uploads/1792396031777_Call-Performance-Report_01-10-2026_18-10-2026_1792343086487.csv');
  console.log('Call-Performance-Report rows:', callInfo.count);
  console.log('Call-Performance-Report header:', callInfo.header);
}

run().catch(console.error);
