async function main() {
  const token = '4e3690725de4072e972478e366910e77fc002de87f1bf22b1ac26464c700e427';
  const headers = { 'Authorization': `Bearer ${token}` };

  const callsRes = await fetch('http://localhost:3000/api/calls', { headers });
  const callsData = await callsRes.json();
  console.log('Total calls from /api/calls:', Array.isArray(callsData) ? callsData.length : typeof callsData);

  const preCallsRes = await fetch('http://localhost:3000/api/calls?type=pre_order', { headers });
  const preCallsData = await preCallsRes.json();
  console.log('Pre-order calls from /api/calls?type=pre_order:', Array.isArray(preCallsData) ? preCallsData.length : typeof preCallsData);

  const preCallsRes2 = await fetch('http://localhost:3000/api/calls?classification=PRE_ORDER', { headers });
  const preCallsData2 = await preCallsRes2.json();
  console.log('Pre-order calls from /api/calls?classification=PRE_ORDER:', Array.isArray(preCallsData2) ? preCallsData2.length : typeof preCallsData2);

  const scRes = await fetch('http://localhost:3000/api/scorecards', { headers });
  const scData = await scRes.json();
  console.log('Scorecards from /api/scorecards:', Array.isArray(scData) ? scData.length : typeof scData);
}

main().catch(console.error);
