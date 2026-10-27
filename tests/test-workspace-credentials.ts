import { WORKSPACES } from '../server/workspace-service';

const BASE_URL = 'http://localhost:3000';

async function main() {
  console.log('=== TESTING WORKSPACE CREDENTIALS & ISOLATION ===');

  let passed = 0;
  let failed = 0;

  for (const ws of WORKSPACES) {
    const { username, password } = ws.defaultUser;
    console.log(`\nTesting Workspace: "${ws.name}" (${ws.id})`);

    // 1. Valid login test
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const loginData = await loginRes.json();

    if (loginRes.ok && loginData.ok && loginData.token && loginData.workspace.id === ws.id) {
      console.log(`  [PASS] Successfully logged in with ID: "${username}" -> Workspace: "${loginData.workspace.name}"`);
      passed++;
    } else {
      console.error(`  [FAIL] Login failed for "${username}":`, loginData);
      failed++;
      continue;
    }

    const token = loginData.token;

    // 2. Cross-workspace check: Ensure queries with this token access only this workspace's database
    const callsRes = await fetch(`${BASE_URL}/api/calls?limit=10`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const callsData = await callsRes.json();

    if (callsRes.ok && Array.isArray(callsData)) {
      if (ws.id === 'preorder_desk') {
        console.log(`  [PASS] Pre-order desk has isolated database with ${callsData.length} preview calls (intact production data).`);
        if (callsData.length > 0) passed++; else failed++;
      } else {
        console.log(`  [PASS] "${ws.name}" has clean isolated database with ${callsData.length} calls (Zero bleed from preorder).`);
        if (callsData.length === 0) passed++; else failed++;
      }
    } else {
      console.error(`  [FAIL] Failed to fetch calls for "${ws.name}":`, callsData);
      failed++;
    }

    // 3. Negative test: Wrong password must fail
    const wrongPassRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'WrongPassword123!' }),
    });
    if (wrongPassRes.status === 401) {
      console.log(`  [PASS] Wrong password correctly rejected with 401.`);
      passed++;
    } else {
      console.error(`  [FAIL] Wrong password did not return 401: status ${wrongPassRes.status}`);
      failed++;
    }

    // 4. Negative test: Selecting a DIFFERENT workspace in dropdown must fail with 403
    const otherWs = WORKSPACES.find((w) => w.id !== ws.id)!;
    const mismatchRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AuditEQ-Workspace': otherWs.id,
      },
      body: JSON.stringify({
        username,
        password,
        workspace_id: otherWs.id,
      }),
    });
    const mismatchData = await mismatchRes.json();
    if (mismatchRes.status === 403 && mismatchData.error.includes('Access Denied')) {
      console.log(`  [PASS] Target mismatch blocked with 403: "${mismatchData.error.slice(0, 50)}..."`);
      passed++;
    } else {
      console.error(`  [FAIL] Target mismatch was not rejected with 403: status ${mismatchRes.status}`, mismatchData);
      failed++;
    }
  }

  console.log(`\n==============================================`);
  console.log(`RESULTS: Passed: ${passed}, Failed: ${failed}`);
  console.log(`==============================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
