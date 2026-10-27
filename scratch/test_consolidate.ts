import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const prodDb = path.join(process.cwd(), '.data', 'auditeq_production.db');
const db = new DatabaseSync(prodDb);

// Let's inspect call 28 which had 2 trades
const call28 = db.prepare("SELECT * FROM calls WHERE id = 28").get() as any;
console.log('Call 28:', { id: call28.id, client_code: call28.client_code, caller_name: call28.caller_name, advisor_name: call28.advisor_name });

const trades28 = db.prepare("SELECT * FROM trades WHERE matched_call_id = 28").all() as any[];
console.log('Trades for Call 28:', trades28.map(t => ({ id: t.id, symbol: t.symbol, qty: t.quantity, price: t.price, side: t.side, adv: t.advisor_name })));

const sc28 = db.prepare("SELECT * FROM scorecards WHERE call_id = 28").all() as any[];
console.log('Scorecards for Call 28 count:', sc28.length, sc28.map(s => ({ id: s.id, resolved_trade_id: s.resolved_trade_id, score: s.score })));

// Let's inspect call 2 which had 10 trades & 5 scorecards
const trades2 = db.prepare("SELECT * FROM trades WHERE matched_call_id = 2").all() as any[];
console.log('Trades for Call 2 count:', trades2.length, trades2.map(t => ({ id: t.id, symbol: t.symbol, qty: t.quantity, price: t.price, side: t.side })));

const sc2 = db.prepare("SELECT * FROM scorecards WHERE call_id = 2").all() as any[];
console.log('Scorecards for Call 2 count:', sc2.length, sc2.map(s => ({ id: s.id, resolved_trade_id: s.resolved_trade_id, score: s.score })));
