/**
 * Gym Nexus 完整 RLS 設置腳本
 *
 * 此腳本會建立：
 * 1. HQ Admin 角色 - 總部管理員（完整存取）
 * 2. Coach 角色 - 教練（限制讀取）
 * 3. Staff 角色 - 櫃檯人員（基本讀取）
 * 4. 測試帳號
 *
 * 使用方式：node setup-complete-rls.js
 */

const API_URL = 'http://localhost:8055';

async function getToken() {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@gym.com', password: 'admin' }),
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
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    console.error('Response:', text);
    throw new Error(`API error: ${response.status}`);
  }
}

async function findOrCreateRole(token, roleData) {
  const existing = await apiRequest(token, 'GET', `/roles?filter[name][_eq]=${encodeURIComponent(roleData.name)}`);

  if (existing.data && existing.data.length > 0) {
    console.log(`   ⏭️  角色 "${roleData.name}" 已存在 (${existing.data[0].id})`);
    return existing.data[0].id;
  }

  const result = await apiRequest(token, 'POST', '/roles', roleData);
  console.log(`   ✅ 已創建角色 "${roleData.name}" (${result.data.id})`);
  return result.data.id;
}

async function findOrCreatePolicy(token, policyData) {
  const existing = await apiRequest(token, 'GET', `/policies?filter[name][_eq]=${encodeURIComponent(policyData.name)}`);

  if (existing.data && existing.data.length > 0) {
    console.log(`      ⏭️  Policy "${policyData.name}" 已存在`);
    return existing.data[0].id;
  }

  const result = await apiRequest(token, 'POST', '/policies', policyData);
  console.log(`      ✅ 已創建 Policy "${policyData.name}"`);
  return result.data.id;
}

async function createPermission(token, permissionData) {
  // 檢查是否已存在相同權限
  const filter = `filter[policy][_eq]=${permissionData.policy}&filter[collection][_eq]=${permissionData.collection}&filter[action][_eq]=${permissionData.action}`;
  const existing = await apiRequest(token, 'GET', `/permissions?${filter}`);

  if (existing.data && existing.data.length > 0) {
    return; // 已存在，跳過
  }

  await apiRequest(token, 'POST', '/permissions', permissionData);
}

async function findOrCreateUser(token, userData) {
  const existing = await apiRequest(token, 'GET', `/users?filter[email][_eq]=${encodeURIComponent(userData.email)}`);

  if (existing.data && existing.data.length > 0) {
    console.log(`   ⏭️  用戶 "${userData.email}" 已存在`);
    return existing.data[0].id;
  }

  const result = await apiRequest(token, 'POST', '/users', userData);
  console.log(`   ✅ 已創建用戶 "${userData.email}"`);
  return result.data.id;
}

function getBranchFilter(collection) {
  const directBranchCollections = ['employees', 'members', 'contracts', 'payments', 'attendances'];

  if (directBranchCollections.includes(collection)) {
    return { branch_id: { _eq: '$CURRENT_USER.branch_id' } };
  }

  if (collection === 'contract_logs') {
    return { contract_id: { branch_id: { _eq: '$CURRENT_USER.branch_id' } } };
  }

  if (collection === 'branches') {
    return { id: { _eq: '$CURRENT_USER.branch_id' } };
  }

  // job_titles, membership_plans - 無分店限制
  return {};
}

async function main() {
  console.log('🔐 開始設置完整 Row-Level Security...\n');

  const token = await getToken();
  console.log('✅ 取得 Admin Token\n');

  // ============================================
  // Step 1: 創建 HQ Admin 角色
  // ============================================
  console.log('👥 Step 1: 創建 HQ Admin 角色...');

  const hqAdminRoleId = await findOrCreateRole(token, {
    name: 'HQ Admin',
    icon: 'admin_panel_settings',
    description: '總部管理員 - 完整系統存取權限',
  });

  // HQ Admin Policy - 完整存取
  console.log('   📋 設置 HQ Admin Policy...');
  const hqAdminPolicyId = await findOrCreatePolicy(token, {
    name: 'HQ Admin Full Access',
    icon: 'shield',
    description: '完整系統存取權限',
    admin_access: true,
    app_access: true,
  });

  // 關聯 Policy 到 Role
  await apiRequest(token, 'PATCH', `/roles/${hqAdminRoleId}`, {
    policies: [hqAdminPolicyId],
  });
  console.log('   ✅ HQ Admin 設置完成\n');

  // ============================================
  // Step 2: 創建 Coach 角色
  // ============================================
  console.log('👥 Step 2: 創建 Coach 角色...');

  const coachRoleId = await findOrCreateRole(token, {
    name: 'Coach',
    icon: 'fitness_center',
    description: '教練 - 存取自己分店的會員和合約',
  });

  // Coach Policy
  console.log('   📋 設置 Coach Policy...');
  const coachPolicyId = await findOrCreatePolicy(token, {
    name: 'Coach Limited Access',
    icon: 'fitness_center',
    description: '教練資料存取權限',
    admin_access: false,
    app_access: true,
  });

  // Coach 可讀取的集合（無分店限制）
  const coachReadAll = ['branches', 'job_titles', 'membership_plans'];
  for (const collection of coachReadAll) {
    await createPermission(token, {
      policy: coachPolicyId,
      collection,
      action: 'read',
      permissions: {},
      fields: ['*'],
    });
  }

  // Coach 可讀取的集合（分店限制）
  const coachReadBranch = ['members', 'contracts', 'contract_logs', 'employees'];
  for (const collection of coachReadBranch) {
    await createPermission(token, {
      policy: coachPolicyId,
      collection,
      action: 'read',
      permissions: getBranchFilter(collection),
      fields: ['*'],
    });
  }

  // Coach 可建立 contract_logs（記錄課程）
  await createPermission(token, {
    policy: coachPolicyId,
    collection: 'contract_logs',
    action: 'create',
    permissions: getBranchFilter('contract_logs'),
    validation: getBranchFilter('contract_logs'),
    fields: ['*'],
  });

  // 關聯 Policy 到 Role
  await apiRequest(token, 'PATCH', `/roles/${coachRoleId}`, {
    policies: [coachPolicyId],
  });
  console.log('   ✅ Coach 設置完成\n');

  // ============================================
  // Step 3: 創建 Staff 角色
  // ============================================
  console.log('👥 Step 3: 創建 Staff 角色...');

  const staffRoleId = await findOrCreateRole(token, {
    name: 'Staff',
    icon: 'badge',
    description: '櫃檯人員 - 基本資料讀取',
  });

  // Staff Policy
  console.log('   📋 設置 Staff Policy...');
  const staffPolicyId = await findOrCreatePolicy(token, {
    name: 'Staff Read Access',
    icon: 'badge',
    description: '櫃檯人員資料存取權限',
    admin_access: false,
    app_access: true,
  });

  // Staff 可讀取的集合（無分店限制）
  const staffReadAll = ['branches', 'membership_plans'];
  for (const collection of staffReadAll) {
    await createPermission(token, {
      policy: staffPolicyId,
      collection,
      action: 'read',
      permissions: {},
      fields: ['*'],
    });
  }

  // Staff 可讀取的集合（分店限制）
  const staffReadBranch = ['members', 'contracts'];
  for (const collection of staffReadBranch) {
    await createPermission(token, {
      policy: staffPolicyId,
      collection,
      action: 'read',
      permissions: getBranchFilter(collection),
      fields: ['*'],
    });
  }

  // 關聯 Policy 到 Role
  await apiRequest(token, 'PATCH', `/roles/${staffRoleId}`, {
    policies: [staffPolicyId],
  });
  console.log('   ✅ Staff 設置完成\n');

  // ============================================
  // Step 4: 創建測試帳號
  // ============================================
  console.log('👤 Step 4: 創建測試帳號...');

  const xinyiBranchId = '22222222-2222-2222-2222-222222222222';
  const hqBranchId = '11111111-1111-1111-1111-111111111111';

  // HQ Admin 測試帳號
  await findOrCreateUser(token, {
    email: 'hq@gym.com',
    password: 'hqadmin',
    first_name: '總部',
    last_name: '管理員',
    role: hqAdminRoleId,
    branch_id: hqBranchId,
  });

  // Coach 測試帳號
  await findOrCreateUser(token, {
    email: 'coach.xinyi@gym.com',
    password: 'coach123',
    first_name: '王',
    last_name: '教練',
    role: coachRoleId,
    branch_id: xinyiBranchId,
  });

  // Staff 測試帳號
  await findOrCreateUser(token, {
    email: 'staff.xinyi@gym.com',
    password: 'staff123',
    first_name: '李',
    last_name: '櫃檯',
    role: staffRoleId,
    branch_id: xinyiBranchId,
  });

  console.log('\n🎉 完整 RLS 設置完成！\n');
  console.log('📋 角色與權限摘要：');
  console.log('┌─────────────────┬─────────────────────────────────────────┐');
  console.log('│ 角色            │ 權限說明                                │');
  console.log('├─────────────────┼─────────────────────────────────────────┤');
  console.log('│ Administrator   │ Directus 內建管理員（完整存取）         │');
  console.log('│ HQ Admin        │ 總部管理員（完整業務存取）              │');
  console.log('│ Store Manager   │ 店長（CRUD 自己分店資料）               │');
  console.log('│ Coach           │ 教練（讀取自己分店會員/合約）           │');
  console.log('│ Staff           │ 櫃檯（讀取自己分店會員/合約）           │');
  console.log('└─────────────────┴─────────────────────────────────────────┘');
  console.log('');
  console.log('📧 測試帳號：');
  console.log('┌─────────────────────────┬─────────────┬─────────────────┐');
  console.log('│ Email                   │ 密碼        │ 角色            │');
  console.log('├─────────────────────────┼─────────────┼─────────────────┤');
  console.log('│ admin@gym.com           │ admin       │ Administrator   │');
  console.log('│ hq@gym.com              │ hqadmin     │ HQ Admin        │');
  console.log('│ taipei.xinyi@gym.com    │ manager     │ Store Manager   │');
  console.log('│ coach.xinyi@gym.com     │ coach123    │ Coach           │');
  console.log('│ staff.xinyi@gym.com     │ staff123    │ Staff           │');
  console.log('└─────────────────────────┴─────────────┴─────────────────┘');
}

main().catch(console.error);
