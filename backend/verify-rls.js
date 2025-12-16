/**
 * RLS 完整驗證腳本
 * 測試所有角色的權限是否正確
 */

const API_URL = 'http://localhost:8055';

async function getToken(email, password) {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json();
  if (data.errors) throw new Error(`Login failed: ${JSON.stringify(data.errors)}`);
  return data.data.access_token;
}

async function apiRequest(token, method, endpoint) {
  const response = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  return response.json();
}

async function testRole(roleName, email, password, expectedResults) {
  console.log(`\n🔍 測試 ${roleName} (${email})...`);

  try {
    const token = await getToken(email, password);
    console.log(`   ✅ 登入成功`);

    const results = {};

    // 測試會員讀取
    const members = await apiRequest(token, 'GET', '/items/members?fields=id,branch_id');
    results.membersCount = members.data?.length || 0;
    results.membersError = members.errors ? members.errors[0].message : null;

    // 測試合約讀取
    const contracts = await apiRequest(token, 'GET', '/items/contracts?fields=id,branch_id');
    results.contractsCount = contracts.data?.length || 0;
    results.contractsError = contracts.errors ? contracts.errors[0].message : null;

    // 測試付款讀取
    const payments = await apiRequest(token, 'GET', '/items/payments?fields=id,branch_id');
    results.paymentsCount = payments.data?.length || 0;
    results.paymentsError = payments.errors ? payments.errors[0].message : null;

    // 測試分店讀取
    const branches = await apiRequest(token, 'GET', '/items/branches?fields=id,name');
    results.branchesCount = branches.data?.length || 0;

    // 輸出結果
    console.log(`   📊 可見會員: ${results.membersCount} 筆${results.membersError ? ` (❌ ${results.membersError})` : ''}`);
    console.log(`   📊 可見合約: ${results.contractsCount} 筆${results.contractsError ? ` (❌ ${results.contractsError})` : ''}`);
    console.log(`   📊 可見付款: ${results.paymentsCount} 筆${results.paymentsError ? ` (❌ ${results.paymentsError})` : ''}`);
    console.log(`   📊 可見分店: ${results.branchesCount} 筆`);

    // 驗證結果
    let passed = true;
    if (expectedResults.members !== undefined && results.membersCount !== expectedResults.members) {
      if (expectedResults.members === 'all' && results.membersCount < 10) passed = false;
      else if (expectedResults.members === 'branch' && results.membersCount > 5) passed = false;
      else if (typeof expectedResults.members === 'number' && results.membersCount !== expectedResults.members) passed = false;
    }

    console.log(`   ${passed ? '✅ 權限驗證通過' : '⚠️  權限可能有問題'}`);

    return { success: true, results };
  } catch (error) {
    console.log(`   ❌ 測試失敗: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('🧪 RLS 完整驗證測試\n');
  console.log('═══════════════════════════════════════════════════════════');

  // 測試帳號列表
  const testAccounts = [
    { role: 'Administrator', email: 'admin@gym.com', password: 'admin', expected: { members: 'all' } },
    { role: 'HQ Admin', email: 'hq@gym.com', password: 'hqadmin', expected: { members: 'all' } },
    { role: 'Store Manager', email: 'taipei.xinyi@gym.com', password: 'manager', expected: { members: 'branch' } },
    { role: 'Coach', email: 'coach.xinyi@gym.com', password: 'coach123', expected: { members: 'branch' } },
    { role: 'Staff', email: 'staff.xinyi@gym.com', password: 'staff123', expected: { members: 'branch' } },
  ];

  const results = [];

  for (const account of testAccounts) {
    const result = await testRole(account.role, account.email, account.password, account.expected);
    results.push({ ...account, ...result });
  }

  // 總結
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📋 測試結果總結\n');

  console.log('┌─────────────────┬────────┬────────┬────────┬────────┬────────┐');
  console.log('│ 角色            │ 登入   │ 會員   │ 合約   │ 付款   │ 分店   │');
  console.log('├─────────────────┼────────┼────────┼────────┼────────┼────────┤');

  for (const r of results) {
    const login = r.success ? '✅' : '❌';
    const members = r.results?.membersCount ?? '-';
    const contracts = r.results?.contractsCount ?? '-';
    const payments = r.results?.paymentsCount ?? '-';
    const branches = r.results?.branchesCount ?? '-';

    const rolePadded = r.role.padEnd(15);
    console.log(`│ ${rolePadded} │ ${login}     │ ${String(members).padStart(6)} │ ${String(contracts).padStart(6)} │ ${String(payments).padStart(6)} │ ${String(branches).padStart(6)} │`);
  }

  console.log('└─────────────────┴────────┴────────┴────────┴────────┴────────┘');

  console.log('\n📌 預期結果說明：');
  console.log('   - Administrator/HQ Admin: 應看到所有資料 (17 會員, 17 合約)');
  console.log('   - Store Manager (信義店): 應只看到信義店資料 (3 會員)');
  console.log('   - Coach/Staff (信義店): 應只看到信義店資料 (3 會員)');
  console.log('   - Staff 不應能存取付款紀錄');
}

main().catch(console.error);
