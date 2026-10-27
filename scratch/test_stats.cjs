async function main() {
  const token = '4e3690725de4072e972478e366910e77fc002de87f1bf22b1ac26464c700e427';
  const headers = { 'Authorization': `Bearer ${token}` };

  const statsRes = await fetch('http://localhost:3000/api/stats', { headers });
  const stats = await statsRes.json();
  console.log('Stats from /api/stats:', stats);
}

main().catch(console.error);
