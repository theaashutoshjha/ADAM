const AdmZip = require('adm-zip');

async function testZipDownload() {
  const token = '4e3690725de4072e972478e366910e77fc002de87f1bf22b1ac26464c700e427';
  const url = 'http://localhost:3000/api/calls/download-zip?type=pre_order&limit=10';
  
  console.log('Fetching zip from API...');
  const resp = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!resp.ok) {
    console.error('Failed to download zip:', resp.status, await resp.text());
    return;
  }

  const ab = await resp.arrayBuffer();
  console.log(`Downloaded ZIP size: ${ab.byteLength} bytes`);

  const zip = new AdmZip(Buffer.from(ab));
  const entries = zip.getEntries();
  console.log(`Total entries in ZIP: ${entries.length}`);
  console.log('Sample entries with day-wise folder structure:');
  for (const e of entries.slice(0, 10)) {
    console.log(` - ${e.entryName} (${e.header.size} bytes)`);
  }
}

testZipDownload().catch(console.error);
