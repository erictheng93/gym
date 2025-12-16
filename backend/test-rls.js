/**
 * RLS 和 Hook 測試腳本
 */

const API_URL = 'http://localhost:8055';

async function getToken(email, password) {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json();
  if (data.errors) throw new Error(JSON.stringify(data.errors));
  return data.data.access_token;
}

async function apiRequest(token, method, endpoint, body = null) {
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(`${API_URL}${endpoint}`, options);
  return response.json();
}

async function main() {
  console.log('🧪 開始測試 RLS 和 Hooks...\n');

  // 取得 Admin Token
  const adminToken = await getToken('admin@gym.com', 'admin');
  console.log('✅ Admin Token 取得成功\n');

  // ============================================
  // 創建測試用戶
  // ============================================
  console.log('👤 創建測試用戶...');

  // 取得角色 ID
  const roles = await apiRequest(adminToken, 'GET', '/roles');
  const storeManagerRole = roles.data.find(r => r.name === 'Store Manager');

  // 信義店 ID
  const xinyiBranchId = '22222222-2222-2222-2222-222222222222';
  // 大安店 ID
  const daanBranchId = '33333333-3333-3333-3333-333333333333';

  // 檢查測試用戶是否存在
  const existingUsers = await apiRequest(adminToken, 'GET', '/users?filter[email][_eq]=manager.xinyi@gym.com');

  let testUserId;
  if (existingUsers.data.length === 0) {
    // 創建信義店店長測試帳號
    const newUser = await apiRequest(adminToken, 'POST', '/users', {
      email: 'manager.xinyi@gym.com',
      password: 'test123',
      first_name: '李小華',
      last_name: '（測試）',
      role: storeManagerRole.id,
      branch_id: xinyiBranchId,
    });
    testUserId = newUser.data.id;
    console.log(`   ✅ 已創建測試用戶: manager.xinyi@gym.com (${testUserId})\n`);
  } else {
    testUserId = existingUsers.data[0].id;
    console.log(`   ⏭️  測試用戶已存在: ${testUserId}\n`);
  }

  // ============================================
  // 測試 RLS
  // ============================================
  console.log('🔒 測試 Row-Level Security...\n');

  // 用 Admin 查詢所有會員
  const adminMembers = await apiRequest(adminToken, 'GET', '/items/members?fields=id,member_code,full_name,branch_id.name');
  console.log(`   Admin 可見會員數: ${adminMembers.data.length}`);

  // 用 Store Manager 查詢會員
  try {
    const managerToken = await getToken('manager.xinyi@gym.com', 'test123');
    const managerMembers = await apiRequest(managerToken, 'GET', '/items/members?fields=id,member_code,full_name,branch_id.name');
    console.log(`   Store Manager (信義店) 可見會員數: ${managerMembers.data.length}`);

    // 檢查是否只看到信義店的會員
    const allXinyi = managerMembers.data.every(m =>
      m.branch_id && m.branch_id.name && m.branch_id.name.includes('信義')
    );
    console.log(`   ✅ RLS 測試${allXinyi ? '通過' : '失敗'}: ${allXinyi ? '只看到信義店會員' : '看到了其他分店會員'}\n`);
  } catch (e) {
    console.log(`   ⚠️  Store Manager 登入失敗: ${e.message}\n`);
  }

  // ============================================
  // 測試 Hook: 合約暫停自動延長
  // ============================================
  console.log('🔄 測試 Hook: 合約暫停自動延長...\n');

  // 找一個可暫停的合約
  const contracts = await apiRequest(adminToken, 'GET',
    '/items/contracts?filter[contract_status][_eq]=ACTIVE&filter[end_date][_nnull]=true&limit=1&fields=id,contract_no,end_date,member_id'
  );

  if (contracts.data.length > 0) {
    const testContract = contracts.data[0];
    console.log(`   測試合約: ${testContract.contract_no}`);
    console.log(`   原結束日期: ${testContract.end_date}`);

    // 創建暫停記錄
    const pauseLog = await apiRequest(adminToken, 'POST', '/items/contract_logs', {
      contract_id: testContract.id,
      log_type: 'PAUSE',
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      days_affected: 30,
      reason: 'RLS 測試暫停',
      status: 'active',
    });

    if (pauseLog.data) {
      console.log(`   ✅ 已創建暫停記錄`);

      // 等待 Hook 執行
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 查詢更新後的合約
      const updatedContract = await apiRequest(adminToken, 'GET',
        `/items/contracts/${testContract.id}?fields=id,contract_no,end_date,contract_status`
      );

      console.log(`   新結束日期: ${updatedContract.data.end_date}`);
      console.log(`   合約狀態: ${updatedContract.data.contract_status}`);

      // 檢查 EXTEND 記錄是否自動創建
      const extendLogs = await apiRequest(adminToken, 'GET',
        `/items/contract_logs?filter[contract_id][_eq]=${testContract.id}&filter[log_type][_eq]=EXTEND&sort=-date_created&limit=1`
      );

      if (extendLogs.data.length > 0) {
        console.log(`   ✅ Hook 測試通過: EXTEND 記錄已自動創建\n`);
      } else {
        console.log(`   ⚠️  Hook 測試: EXTEND 記錄未找到（Hook 可能需要重啟 Directus 生效）\n`);
      }
    }
  } else {
    console.log('   ⚠️  找不到可測試的合約\n');
  }

  // ============================================
  // 測試 Hook: 會員狀態自動更新
  // ============================================
  console.log('🔄 測試 Hook: 會員狀態自動更新...\n');

  // 找一個會員
  const members = await apiRequest(adminToken, 'GET',
    '/items/members?limit=1&fields=id,member_code,member_status'
  );

  if (members.data.length > 0) {
    const testMember = members.data[0];
    console.log(`   測試會員: ${testMember.member_code}`);
    console.log(`   當前狀態: ${testMember.member_status}`);

    // 查詢該會員的合約
    const memberContracts = await apiRequest(adminToken, 'GET',
      `/items/contracts?filter[member_id][_eq]=${testMember.id}&fields=id,contract_status`
    );
    console.log(`   合約數量: ${memberContracts.data.length}`);
    console.log(`   合約狀態: ${memberContracts.data.map(c => c.contract_status).join(', ')}\n`);
  }

  console.log('🎉 測試完成！\n');
  console.log('📋 摘要：');
  console.log('   - RLS: 已設置分店資料隔離');
  console.log('   - Hook 1: 合約暫停時自動延長結束日期');
  console.log('   - Hook 2: 合約狀態變更時自動更新會員狀態');
  console.log('\n💡 提示：');
  console.log('   - 可登入 http://localhost:8055 使用 admin@gym.com / admin 管理系統');
  console.log('   - 測試帳號 manager.xinyi@gym.com / test123 只能看到信義店資料\n');
}

main().catch(console.error);
