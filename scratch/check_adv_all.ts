import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const prodDb = path.join(process.cwd(), '.data', 'auditeq_production.db');
const db = new DatabaseSync(prodDb);

console.log('=== TRADES ADVISOR_NAME ===');
const tradesAdv = db.prepare("SELECT DISTINCT advisor_name FROM trades LIMIT 20").all();
console.log(tradesAdv);

console.log('=== CALLS ADVISOR_NAME & CALLER_NAME ===');
const callsAdv = db.prepare("SELECT DISTINCT advisor_name, caller_name, dealer FROM calls LIMIT 20").all();
console.log(callsAdv);

console.log('=== SCORECARDS CALLER_NAME & DEALER ===');
const scAdv = db.prepare("SELECT DISTINCT caller_name, dealer, team FROM scorecards LIMIT 20").all();
console.log(scAdv);
