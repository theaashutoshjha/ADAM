const token = '5aa60aeafd9ca2b4d68d54ee0cca8ca4952aac90d5eadf8d85e20fb20dba80f9';

async function verify() {
  const [stats, callsAll, callsPre] = await Promise.all([
    fetch('http://localhost:3000/api/stats', { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json()),
    fetch('http://localhost:3000/api/calls?per_page=10000', { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json()),
    fetch('http://localhost:3000/api/calls?type=pre_order', { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json())
  ]);

  console.log('STATS:');
  console.log('  Total calls in DB:', stats.calls);
  console.log('  Pre-order count:', stats.pre_orders_count);
  console.log('  Scored scorecards count:', stats.scored);

  console.log('\nCALLS ENDPOINT:');
  console.log('  Total calls returned from /api/calls?per_page=10000:', callsAll.length);
  const preOrdersInAll = callsAll.filter((c: any) => c.classification === 'PRE_ORDER' || c.call_type === 'pre_order');
  console.log('  Pre-order calls inside /api/calls?per_page=10000:', preOrdersInAll.length);
  console.log('  Calls returned from /api/calls?type=pre_order:', callsPre.length);

  if (preOrdersInAll.length === 1177 && callsPre.length === 1177) {
    console.log('\nSUCCESS: All 1,177 Pre-Order Calls are 100% active and present!');
  } else {
    console.error('\nFAILURE: Count mismatch!');
  }
}

verify();
