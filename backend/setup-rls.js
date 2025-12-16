/**
 * Gym Nexus Row-Level Security 設置腳本
 *
 * 此腳本會建立：
 * 1. 新的角色：HQ Admin、Store Manager、Coach、Staff
 * 2. 對應的 Policies 和 Permissions
 * 3. 基於 branch_id 的資料隔離
 *
 * 使用方式：node setup-rls.js
 */

const API_URL = 'http://localhost:8055';

async function getToken() {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@gym.com', password: 'admin' }),
  });
  const data = await response.json();
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

async function main() {
  console.log('🔐 開始設置 Row-Level Security...\n');

  const token = await getToken();
  console.log('✅ 取得 Admin Token\n');

  // ============================================
  // Step 1: 在 directus_users 添加 branch_id 欄位
  // ============================================
  console.log('📝 Step 1: 檢查 directus_users.branch_id 欄位...');

  // 檢查是否已存在
  const fields = await apiRequest(token, 'GET', '/fields/directus_users');
  const hasBranchId = fields.data.some(f => f.field === 'branch_id');

  if (!hasBranchId) {
    await apiRequest(token, 'POST', '/fields/directus_users', {
      field: 'branch_id',
      type: 'uuid',
      meta: {
        interface: 'select-dropdown-m2o',
        special: ['m2o'],
        display: 'related-values',
        display_options: { template: '{{name}}' },
      },
      schema: {
        is_nullable: true,
      },
    });

    // 添加關聯
    await apiRequest(token, 'POST', '/relations', {
      collection: 'directus_users',
      field: 'branch_id',
      related_collection: 'branches',
    });

    console.log('   ✅ 已創建 branch_id 欄位\n');
  } else {
    console.log('   ⏭️  branch_id 欄位已存在\n');
  }

  // ============================================
  // Step 2: 創建角色
  // ============================================
  console.log('👥 Step 2: 創建角色...');

  const roles = [
    { name: 'HQ Admin', icon: 'admin_panel_settings', description: '總部管理員 - 完整系統存取權限' },
    { name: 'Store Manager', icon: 'store', description: '店長 - 管理自己分店的所有資料' },
    { name: 'Coach', icon: 'fitness_center', description: '教練 - 存取自己負責的會員和合約' },
    { name: 'Staff', icon: 'badge', description: '櫃檯人員 - 基本資料讀取' },
  ];

  const createdRoles = {};

  for (const role of roles) {
    // 檢查是否已存在
    const existing = await apiRequest(token, 'GET', `/roles?filter[name][_eq]=${encodeURIComponent(role.name)}`);

    if (existing.data.length > 0) {
      createdRoles[role.name] = existing.data[0].id;
      console.log(`   ⏭️  角色 "${role.name}" 已存在 (${existing.data[0].id})`);
    } else {
      const result = await apiRequest(token, 'POST', '/roles', role);
      createdRoles[role.name] = result.data.id;
      console.log(`   ✅ 已創建角色 "${role.name}" (${result.data.id})`);
    }
  }
  console.log('');

  // ============================================
  // Step 3: 創建 Policies 和 Permissions
  // ============================================
  console.log('🔒 Step 3: 創建 Policies 和 Permissions...\n');

  // 業務集合列表
  const businessCollections = [
    'branches',
    'job_titles',
    'employees',
    'members',
    'membership_plans',
    'contracts',
    'contract_logs',
    'payments',
    'attendances',
    'leave_requests',
  ];

  // HQ Admin Policy - 完整存取
  console.log('   📋 設置 HQ Admin Policy...');
  const hqAdminPolicy = await createPolicy(token, {
    name: 'HQ Admin Full Access',
    icon: 'shield',
    description: '完整系統存取權限',
    admin_access: true,
    app_access: true,
  });

  await apiRequest(token, 'PATCH', `/roles/${createdRoles['HQ Admin']}`, {
    policies: [hqAdminPolicy],
  });
  console.log('   ✅ HQ Admin Policy 設置完成\n');

  // Store Manager Policy - 分店限制
  console.log('   📋 設置 Store Manager Policy...');
  const storeManagerPolicy = await createPolicy(token, {
    name: 'Store Manager Branch Access',
    icon: 'store',
    description: '分店資料存取權限',
    admin_access: false,
    app_access: true,
  });

  // 為 Store Manager 添加權限
  for (const collection of businessCollections) {
    const filter = getBranchFilter(collection);

    // CRUD 權限
    for (const action of ['create', 'read', 'update', 'delete']) {
      await apiRequest(token, 'POST', '/permissions', {
        policy: storeManagerPolicy,
        collection,
        action,
        permissions: filter,
        validation: action === 'create' ? filter : null,
        fields: ['*'],
      });
    }
  }

  await apiRequest(token, 'PATCH', `/roles/${createdRoles['Store Manager']}`, {
    policies: [storeManagerPolicy],
  });
  console.log('   ✅ Store Manager Policy 設置完成\n');

  // Coach Policy - 教練權限
  console.log('   📋 設置 Coach Policy...');
  const coachPolicy = await createPolicy(token, {
    name: 'Coach Limited Access',
    icon: 'fitness_center',
    description: '教練資料存取權限',
    admin_access: false,
    app_access: true,
  });

  // 教練可讀取的集合
  const coachReadCollections = ['branches', 'job_titles', 'membership_plans'];
  const coachBranchCollections = ['members', 'contracts', 'contract_logs'];

  for (const collection of coachReadCollections) {
    await apiRequest(token, 'POST', '/permissions', {
      policy: coachPolicy,
      collection,
      action: 'read',
      permissions: {},
      fields: ['*'],
    });
  }

  for (const collection of coachBranchCollections) {
    const filter = getBranchFilter(collection);
    await apiRequest(token, 'POST', '/permissions', {
      policy: coachPolicy,
      collection,
      action: 'read',
      permissions: filter,
      fields: ['*'],
    });

    // 教練可以更新自己負責的合約記錄
    if (collection === 'contract_logs') {
      await apiRequest(token, 'POST', '/permissions', {
        policy: coachPolicy,
        collection,
        action: 'create',
        permissions: filter,
        fields: ['*'],
      });
    }
  }

  await apiRequest(token, 'PATCH', `/roles/${createdRoles['Coach']}`, {
    policies: [coachPolicy],
  });
  console.log('   ✅ Coach Policy 設置完成\n');

  // Staff Policy - 櫃檯人員權限
  console.log('   📋 設置 Staff Policy...');
  const staffPolicy = await createPolicy(token, {
    name: 'Staff Read Access',
    icon: 'badge',
    description: '櫃檯人員資料存取權限',
    admin_access: false,
    app_access: true,
  });

  // 櫃檯人員只能讀取基本資料
  const staffReadCollections = ['branches', 'membership_plans'];
  const staffBranchReadCollections = ['members', 'contracts'];

  for (const collection of staffReadCollections) {
    await apiRequest(token, 'POST', '/permissions', {
      policy: staffPolicy,
      collection,
      action: 'read',
      permissions: {},
      fields: ['*'],
    });
  }

  for (const collection of staffBranchReadCollections) {
    const filter = getBranchFilter(collection);
    await apiRequest(token, 'POST', '/permissions', {
      policy: staffPolicy,
      collection,
      action: 'read',
      permissions: filter,
      fields: ['*'],
    });
  }

  await apiRequest(token, 'PATCH', `/roles/${createdRoles['Staff']}`, {
    policies: [staffPolicy],
  });
  console.log('   ✅ Staff Policy 設置完成\n');

  console.log('🎉 Row-Level Security 設置完成！\n');
  console.log('📌 注意事項：');
  console.log('   1. 新建使用者時，請記得設定其 branch_id');
  console.log('   2. HQ Admin 可存取所有分店資料');
  console.log('   3. Store Manager/Coach/Staff 只能存取自己分店的資料');
  console.log('   4. 可透過 Directus Admin Panel 進一步調整權限\n');
}

async function createPolicy(token, data) {
  const existing = await apiRequest(token, 'GET', `/policies?filter[name][_eq]=${encodeURIComponent(data.name)}`);

  if (existing.data.length > 0) {
    console.log(`      ⏭️  Policy "${data.name}" 已存在`);
    return existing.data[0].id;
  }

  const result = await apiRequest(token, 'POST', '/policies', data);
  return result.data.id;
}

/**
 * 根據集合返回分店過濾條件
 */
function getBranchFilter(collection) {
  // 直接有 branch_id 的集合
  const directBranchCollections = [
    'employees', 'members', 'contracts', 'payments', 'attendances',
  ];

  if (directBranchCollections.includes(collection)) {
    return {
      branch_id: {
        _eq: '$CURRENT_USER.branch_id',
      },
    };
  }

  // contract_logs 需要通過 contract 關聯
  if (collection === 'contract_logs') {
    return {
      contract_id: {
        branch_id: {
          _eq: '$CURRENT_USER.branch_id',
        },
      },
    };
  }

  // branches - 只能看自己的分店
  if (collection === 'branches') {
    return {
      id: {
        _eq: '$CURRENT_USER.branch_id',
      },
    };
  }

  // job_titles, membership_plans - 無分店限制
  return {};
}

main().catch(console.error);
