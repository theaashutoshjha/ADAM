// Diagnostic script to audit all endpoints from upload to mail send
import fs from 'fs';
import path from 'path';

async function testAll() {
  console.log('=== STARTING END-TO-END DIAGNOSTIC AUDIT ===');
  const baseUrl = 'http://localhost:3000';

  // 1. Health check
  const healthRes = await fetch(`${baseUrl}/api/health`);
  console.log('1. /api/health:', healthRes.status, await healthRes.json());

  // 2. Login
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'ashutosh.kumar@fundsindia.com',
      password: 'Fi*119147',
    }),
  });
  const loginData = await loginRes.json();
  console.log('2. /api/auth/login:', loginRes.status, loginData.ok ? 'SUCCESS' : loginData);
  const token = loginData.token;

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'X-AuditEQ-Token': token,
  };

  // 3. Verify Session
  const verifyRes = await fetch(`${baseUrl}/api/auth/verify`, { headers: authHeaders });
  console.log('3. /api/auth/verify:', verifyRes.status, await verifyRes.json());

  // 4. GET Integrations
  const getIntegRes = await fetch(`${baseUrl}/api/integrations`, { headers: authHeaders });
  console.log('4. /api/integrations GET:', getIntegRes.status, await getIntegRes.json());

  // 5. POST Integrations (Saving API Keys)
  const savePayload = {
    groq_key: 'gsk_test_mock_groq_key_1234567890abcdef',
    gemini_api_key: 'AIzaSyTestMockGeminiKey1234567890',
    tata_api_key: 'test_mock_tata_key_12345',
    tata_account_id: 'ACT_12345',
    tata_api_url: 'https://api-smartflo.tatateleservices.com/v1',
    smtp_host: 'smtp.gmail.com',
    smtp_port: '587',
    smtp_user: 'compliance@example.com',
    smtp_pass: 'app_password_mock',
    smtp_from: 'compliance@example.com',
    smtp_from_name: 'Compliance Desk',
    smtp_secure: 'false',
  };

  const saveIntegRes = await fetch(`${baseUrl}/api/integrations`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(savePayload),
  });
  console.log('5. /api/integrations POST:', saveIntegRes.status, await saveIntegRes.json());

  // Verify they were saved
  const checkIntegRes = await fetch(`${baseUrl}/api/integrations`, { headers: authHeaders });
  const savedInteg = await checkIntegRes.json();
  console.log('5b. Verified Integrations State:', {
    groq_configured: savedInteg.groq_configured,
    gemini_configured: savedInteg.gemini_configured,
    tata_configured: savedInteg.tata_configured,
    smtp_configured: savedInteg.smtp_configured,
  });

  // 6. Test File Upload: Trades CSV
  const mockTradesCsv = `Trade Date,Trade Time,Client Code,Client Name,Symbol,Order Type,Quantity,Price,Dealer Name,Advisor Name,Customer Number\n2026-09-18,10:30:00,WIA1001,Amit Verma,RELIANCE,BUY,50,2850.50,Sunil,Priya,+919876543210\n`;
  const tradeBlob = new Blob([mockTradesCsv], { type: 'text/csv' });
  const tradeFormData = new FormData();
  tradeFormData.append('file', tradeBlob, 'test_trades.csv');

  const tradeUploadRes = await fetch(`${baseUrl}/api/imports/trades`, {
    method: 'POST',
    headers: authHeaders,
    body: tradeFormData,
  });
  console.log('6. /api/imports/trades POST:', tradeUploadRes.status, await tradeUploadRes.json());

  // 7. Test File Upload: Audio Calls
  // Create a minimal valid WAV buffer (44 bytes RIFF header)
  const wavHeader = Buffer.alloc(44);
  wavHeader.write('RIFF', 0);
  wavHeader.writeUInt32LE(36, 4);
  wavHeader.write('WAVE', 8);
  wavHeader.write('fmt ', 12);
  wavHeader.writeUInt32LE(16, 16);
  wavHeader.writeUInt16LE(1, 20); // PCM
  wavHeader.writeUInt16LE(1, 22); // mono
  wavHeader.writeUInt32LE(8000, 24); // 8kHz
  wavHeader.writeUInt32LE(16000, 28); // byte rate
  wavHeader.writeUInt16LE(2, 32); // block align
  wavHeader.writeUInt16LE(16, 34); // bits per sample
  wavHeader.write('data', 36);
  wavHeader.writeUInt32LE(0, 40);

  const audioBlob = new Blob([wavHeader], { type: 'audio/wav' });
  const callFormData = new FormData();
  callFormData.append('files[]', audioBlob, '9876543210_20260918_103000.wav');

  const callUploadRes = await fetch(`${baseUrl}/api/imports/calls`, {
    method: 'POST',
    headers: authHeaders,
    body: callFormData,
  });
  console.log('7. /api/imports/calls POST:', callUploadRes.status, await callUploadRes.json());

  // 8. Test Mail Dispatch Handshake
  const mailTestRes = await fetch(`${baseUrl}/api/mail/test-connection`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      host: 'smtp.gmail.com',
      port: 587,
      user: 'compliance@example.com',
      pass: 'invalid_dummy_pass',
      secure: false,
    }),
  });
  console.log('8. /api/mail/test-connection POST:', mailTestRes.status, await mailTestRes.json());

  console.log('=== DIAGNOSTIC AUDIT COMPLETE ===');
}

testAll().catch(err => {
  console.error('Diagnostic error:', err);
  process.exit(1);
});
