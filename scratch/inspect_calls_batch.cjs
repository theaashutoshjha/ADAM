const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');

const db = new DatabaseSync('.data/auditeq_production.db');
const deepgramApiKey = '2745804bcd505f1f2756e2bb407447ed643cd64d';

async function testBatch() {
  const calls = db.prepare(`
    SELECT c.id, c.caller_id, c.calling_number, c.client_code, c.storage_path, c.matched_trade_id,
           t.symbol as trade_symbol, t.quantity as trade_qty, t.price as trade_price, t.client as trade_client
    FROM calls c
    LEFT JOIN trades t ON c.matched_trade_id = t.id
    WHERE (c.classification = 'PRE_ORDER' OR c.call_type = 'pre_order')
      AND c.storage_path IS NOT NULL AND length(c.storage_path) > 0
    LIMIT 10 OFFSET 5
  `).all();

  for (const c of calls) {
    if (!fs.existsSync(c.storage_path)) continue;
    const stat = fs.statSync(c.storage_path);
    console.log(`\n--- Call #${c.id} (${c.caller_id}) Size: ${stat.size} bytes ---`);
    console.log(`Expected: Client=${c.client_code || c.trade_client}, Symbol=${c.trade_symbol}, Qty=${c.trade_qty}, Price=${c.trade_price}`);
    
    if (stat.size < 50000) {
      console.log('Skipping small/IVR audio (<50KB)');
      continue;
    }

    const audioBuffer = fs.readFileSync(c.storage_path);
    const url = 'https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true&diarize=true&detect_language=true';
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${deepgramApiKey}`,
        'Content-Type': 'audio/mp3'
      },
      body: audioBuffer
    });

    if (!resp.ok) {
      console.error('Deepgram API error:', resp.status);
      continue;
    }

    const result = await resp.json();
    const alt = result.results?.channels?.[0]?.alternatives?.[0];
    const detectedLang = alt?.detected_language || result.results?.channels?.[0]?.detected_language;
    console.log('Detected language:', detectedLang);
    console.log('Transcript:', alt?.transcript?.slice(0, 300) + '...');
  }
}

testBatch().catch(console.error);
