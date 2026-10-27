import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const prodDb = path.join(process.cwd(), '.data', 'auditeq_production.db');
const db = new DatabaseSync(prodDb);

console.log('=== SCORECARDS CALLER_NAME SAMPLE ===');
const scCallerNames = db.prepare("SELECT DISTINCT caller_name FROM scorecards LIMIT 30").all();
console.log(scCallerNames);

console.log('=== SCORECARDS WITH LITERAL STRINGS ===');
const literalAdv = db.prepare("SELECT COUNT(*) as count FROM scorecards WHERE LOWER(caller_name) LIKE '%advisor%' OR LOWER(caller_name) LIKE '%advisar%'").get();
console.log(literalAdv);

const literalAdvRows = db.prepare("SELECT id, call_id, caller_name, client FROM scorecards WHERE LOWER(caller_name) LIKE '%advisor%' OR LOWER(caller_name) LIKE '%advisar%' LIMIT 10").all();
console.log(literalAdvRows);

console.log('=== CALLS WITH LITERAL ADVISOR NAME ===');
const literalCallAdv = db.prepare("SELECT id, caller_name, advisor_name, dealer FROM calls WHERE LOWER(caller_name) LIKE '%advisor%' OR LOWER(advisor_name) LIKE '%advisor%' OR LOWER(caller_name) LIKE '%advisar%' OR LOWER(advisor_name) LIKE '%advisar%' LIMIT 10").all();
console.log(literalCallAdv);

console.log('=== TRADES WITH LITERAL ADVISOR NAME ===');
const literalTradeAdv = db.prepare("SELECT id, advisor_name, dealer FROM trades WHERE LOWER(advisor_name) LIKE '%advisor%' OR LOWER(advisor_name) LIKE '%advisar%' LIMIT 10").all();
console.log(literalTradeAdv);
