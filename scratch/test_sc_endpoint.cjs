const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('.data/auditeq_production.db');

async function test() {
  const token = '4e3690725de4072e972478e366910e77fc002de87f1bf22b1ac26464c700e427';
  const headers = { 'Authorization': `Bearer ${token}` };

  const scBefore = db.prepare('SELECT count(*) as c FROM scorecards').get().c;
  console.log('Scorecards in DB before request:', scBefore);

  const res = await fetch('http://localhost:3000/api/scorecards', { headers });
  const data = await res.json();
  console.log('Response array length:', Array.isArray(data) ? data.length : data);

  const scAfter = db.prepare('SELECT count(*) as c FROM scorecards').get().c;
  console.log('Scorecards in DB after request:', scAfter);
}

test().catch(console.error);
