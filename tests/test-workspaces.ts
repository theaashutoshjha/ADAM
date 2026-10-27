import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import {
  WORKSPACES,
  initAllWorkspaces,
  getWorkspaceDb,
  getWorkspaceById,
  getWorkspaceParameters,
  createWorkspaceParameter,
  updateWorkspaceParameter,
  deleteWorkspaceParameter,
  bulkSaveWorkspaceParameters,
  resetWorkspaceParameters,
  workspaceAsyncStorage,
  createWorkspaceDbProxy,
} from '../server/workspace-service';

async function runTests() {
  console.log('--- Testing 9 Logins, Workspaces & Database Isolation ---');

  const testDir = path.join(process.cwd(), '.data', 'test_workspaces');
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

  const primaryDbPath = path.join(testDir, 'primary_test.db');
  if (fs.existsSync(primaryDbPath)) fs.unlinkSync(primaryDbPath);

  const primaryDb = new DatabaseSync(primaryDbPath);
  primaryDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT,
      full_name TEXT,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      token TEXT,
      token_expires_at TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // 1. Initialize all workspaces
  initAllWorkspaces(primaryDb);
  console.log('✓ All 9 Workspaces initialized successfully.');

  // 2. Verify all 9 users are provisioned in primary DB
  const users = primaryDb.prepare('SELECT username, email, role, workspace_id FROM users').all() as any[];
  console.log(`✓ Provisioned ${users.length} users in primary DB.`);
  if (users.length !== 9) {
    throw new Error(`Expected 9 users, found ${users.length}`);
  }

  // Verify each workspace user exists
  for (const ws of WORKSPACES) {
    const found = users.find((u) => u.workspace_id === ws.id);
    if (!found) throw new Error(`Missing user for workspace: ${ws.id}`);
    console.log(`  - [${ws.name}] -> user: ${found.username} (${found.email}) -> workspace: ${found.workspace_id}`);
  }

  // 3. Verify Database Isolation
  console.log('\n--- Verifying Database Isolation (No Collision) ---');
  const proxy = createWorkspaceDbProxy(primaryDb);

  const csDb = getWorkspaceDb('customer_support');
  const mfGoldDb = getWorkspaceDb('mf_gold');

  // Insert a test call record into Customer Support DB
  csDb.prepare(`
    INSERT INTO calls (recording_name, source, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run('cs_call_001.wav', 'support', 'imported', new Date().toISOString(), new Date().toISOString());

  // Insert a test call record into MF Gold DB
  mfGoldDb.prepare(`
    INSERT INTO calls (recording_name, source, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run('mf_gold_call_999.wav', 'advisory', 'imported', new Date().toISOString(), new Date().toISOString());

  // Check via proxy inside CS context
  workspaceAsyncStorage.run(csDb, () => {
    const csCalls = proxy.prepare('SELECT recording_name FROM calls').all() as any[];
    console.log(`  Customer Support DB call count: ${csCalls.length}`);
    if (!csCalls.some((c) => c.recording_name === 'cs_call_001.wav')) {
      throw new Error('CS call missing in CS DB');
    }
    if (csCalls.some((c) => c.recording_name === 'mf_gold_call_999.wav')) {
      throw new Error('COLLISION DETECTED: MF Gold call found in CS DB!');
    }
    console.log('  ✓ Customer Support DB contains only CS calls.');
  });

  // Check via proxy inside MF Gold context
  workspaceAsyncStorage.run(mfGoldDb, () => {
    const goldCalls = proxy.prepare('SELECT recording_name FROM calls').all() as any[];
    console.log(`  MF Gold DB call count: ${goldCalls.length}`);
    if (!goldCalls.some((c) => c.recording_name === 'mf_gold_call_999.wav')) {
      throw new Error('MF Gold call missing in MF Gold DB');
    }
    if (goldCalls.some((c) => c.recording_name === 'cs_call_001.wav')) {
      throw new Error('COLLISION DETECTED: CS call found in MF Gold DB!');
    }
    console.log('  ✓ MF Gold DB contains only MF Gold calls.');
  });

  // 4. Verify Parameter Management & 50-limit
  console.log('\n--- Verifying Parameter Management (Up to 50) ---');
  resetWorkspaceParameters(csDb, 'customer_support');
  const csParams = getWorkspaceParameters(csDb);
  console.log(`  Customer Support initial parameters: ${csParams.length}`);

  // Create a new parameter
  const newParamRes = createWorkspaceParameter(csDb, {
    param_key: 'CS_CUSTOM_1',
    title: 'Tone and Politeness Assessment',
    category: 'Soft Skills',
    question: 'Did the advisor maintain a respectful, empathetic tone throughout the call?',
    fatal: false,
    weight: 15,
    rule: 'FAIL if executive raised voice or showed sarcasm.',
    subparameters: [
      { id: 's1', title: 'Empathetic Phrasing', mandatory: true },
      { id: 's2', title: 'Zero Sarcasm', mandatory: true },
    ],
  });
  if (!newParamRes.ok) throw new Error(`Failed to create parameter: ${newParamRes.error}`);
  console.log(`  ✓ Successfully created custom parameter: ${newParamRes.parameter?.param_key} (${newParamRes.parameter?.title})`);

  // Verify MF Gold parameters are unaffected
  const goldParams = getWorkspaceParameters(mfGoldDb);
  if (goldParams.some((p) => p.param_key === 'CS_CUSTOM_1')) {
    throw new Error('COLLISION: Custom parameter leaked to MF Gold DB!');
  }
  console.log('  ✓ Parameters isolated between workspaces.');

  // Test 50 parameters limit guardrail
  console.log('\n--- Testing 50 Parameters Guardrail ---');
  const dummyParams = Array.from({ length: 50 }, (_, i) => ({
    param_key: `TST_${i + 1}`,
    title: `Test Parameter ${i + 1}`,
    question: `Evaluation criteria ${i + 1}`,
    weight: 2,
    fatal: false,
  }));
  const bulkRes = bulkSaveWorkspaceParameters(csDb, dummyParams);
  console.log(`  ✓ Bulk saved 50 parameters: ${bulkRes.ok ? 'SUCCESS' : bulkRes.error}`);

  // Try to add 51st parameter
  const overflowRes = createWorkspaceParameter(csDb, {
    param_key: 'TST_51',
    title: 'Overflow Parameter',
    question: 'Should be rejected',
  });
  if (overflowRes.ok) {
    throw new Error('FAIL: Allowed more than 50 parameters!');
  }
  console.log(`  ✓ Enforced 50 parameters max limit: "${overflowRes.error}"`);

  // Clean up test records and restore CS parameters
  resetWorkspaceParameters(csDb, 'customer_support');
  csDb.prepare("DELETE FROM calls WHERE recording_name = 'cs_call_001.wav'").run();
  mfGoldDb.prepare("DELETE FROM calls WHERE recording_name = 'mf_gold_call_999.wav'").run();

  primaryDb.close();
  try {
    fs.unlinkSync(primaryDbPath);
  } catch {}

  console.log('\n======================================================');
  console.log('ALL WORKSPACE & 9-LOGIN ISOLATION TESTS PASSED 100%!');
  console.log('======================================================');
}

runTests().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
