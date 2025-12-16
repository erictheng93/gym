/**
 * 設置分店管理帳號
 *
 * 為每個分店建立對應的管理帳號：
 * - taipei.xinyi@gym.com / manager -> 台北信義店
 * - taipei.daan@gym.com / manager -> 台北大安店
 * - newtaipei.banqiao@gym.com / manager -> 新北板橋店
 * - newtaipei.zhonghe@gym.com / manager -> 新北中和店
 * - taichung.xitun@gym.com / manager -> 台中西屯店
 * - taichung.beitun@gym.com / manager -> 台中北屯店
 * - tainan.east@gym.com / manager -> 台南東區店
 * - tainan.westcentral@gym.com / manager -> 台南中西店
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

// 分店對應資料
const branchManagers = [
  { email: 'taipei.xinyi@gym.com', name: '信義店長', branchId: '22222222-2222-2222-2222-222222222222', branchName: '台北信義店' },
  { email: 'taipei.daan@gym.com', name: '大安店長', branchId: '33333333-3333-3333-3333-333333333333', branchName: '台北大安店' },
  { email: 'newtaipei.banqiao@gym.com', name: '板橋店長', branchId: '44444444-4444-4444-4444-444444444444', branchName: '新北板橋店' },
  { email: 'newtaipei.zhonghe@gym.com', name: '中和店長', branchId: '55555555-5555-5555-5555-555555555555', branchName: '新北中和店' },
  { email: 'taichung.xitun@gym.com', name: '西屯店長', branchId: '66666666-6666-6666-6666-666666666666', branchName: '台中西屯店' },
  { email: 'taichung.beitun@gym.com', name: '北屯店長', branchId: '77777777-7777-7777-7777-777777777777', branchName: '台中北屯店' },
  { email: 'tainan.east@gym.com', name: '東區店長', branchId: '88888888-8888-8888-8888-888888888888', branchName: '台南東區店' },
  { email: 'tainan.westcentral@gym.com', name: '中西店長', branchId: '99999999-9999-9999-9999-999999999999', branchName: '台南中西店' },
];

async function main() {
  console.log('🔧 開始設置分店管理帳號...\n');

  const token = await getToken();
  console.log('✅ 取得 Admin Token\n');

  // Step 1: 在 directus_users 添加 branch_id 欄位
  console.log('📝 Step 1: 檢查 directus_users.branch_id 欄位...');
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

  // Step 2: 創建 Store Manager 角色
  console.log('👥 Step 2: 創建 Store Manager 角色...');

  // 檢查是否已存在
  const roles = await apiRequest(token, 'GET', '/roles?filter[name][_eq]=Store%20Manager');
  let storeManagerRoleId;

  if (roles.data.length > 0) {
    storeManagerRoleId = roles.data[0].id;
    console.log(`   ⏭️  Store Manager 角色已存在 (${storeManagerRoleId})\n`);
  } else {
    const roleResult = await apiRequest(token, 'POST', '/roles', {
      name: 'Store Manager',
      icon: 'store',
      description: '店長 - 管理自己分店的所有資料',
    });
    storeManagerRoleId = roleResult.data.id;
    console.log(`   ✅ 已創建 Store Manager 角色 (${storeManagerRoleId})\n`);
  }

  // Step 3: 創建 Store Manager Policy
  console.log('🔒 Step 3: 創建 Store Manager Policy...');

  const policies = await apiRequest(token, 'GET', '/policies?filter[name][_eq]=Store%20Manager%20Branch%20Access');
  let storeManagerPolicyId;

  if (policies.data.length > 0) {
    storeManagerPolicyId = policies.data[0].id;
    console.log(`   ⏭️  Store Manager Policy 已存在 (${storeManagerPolicyId})\n`);
  } else {
    const policyResult = await apiRequest(token, 'POST', '/policies', {
      name: 'Store Manager Branch Access',
      icon: 'store',
      description: '分店資料存取權限',
      admin_access: false,
      app_access: true,
    });
    storeManagerPolicyId = policyResult.data.id;
    console.log(`   ✅ 已創建 Store Manager Policy (${storeManagerPolicyId})\n`);

    // 添加權限
    const businessCollections = [
      'branches', 'job_titles', 'employees', 'members',
      'membership_plans', 'contracts', 'contract_logs',
      'payments', 'attendances', 'leave_requests',
    ];

    for (const collection of businessCollections) {
      const filter = getBranchFilter(collection);

      for (const action of ['create', 'read', 'update', 'delete']) {
        await apiRequest(token, 'POST', '/permissions', {
          policy: storeManagerPolicyId,
          collection,
          action,
          permissions: filter,
          validation: action === 'create' ? filter : null,
          fields: ['*'],
        });
      }
    }
    console.log('   ✅ 已設置分店權限\n');
  }

  // Step 4: 連結角色和政策
  console.log('🔗 Step 4: 連結角色和政策...');

  // 檢查是否已連結
  const accessRecords = await apiRequest(token, 'GET', `/access?filter[role][_eq]=${storeManagerRoleId}&filter[policy][_eq]=${storeManagerPolicyId}`);

  if (accessRecords.data.length === 0) {
    await apiRequest(token, 'POST', '/access', {
      role: storeManagerRoleId,
      policy: storeManagerPolicyId,
    });
    console.log('   ✅ 已連結角色和政策\n');
  } else {
    console.log('   ⏭️  角色和政策已連結\n');
  }

  // Step 5: 創建分店管理帳號
  console.log('👤 Step 5: 創建分店管理帳號...\n');

  for (const manager of branchManagers) {
    // 檢查帳號是否已存在
    const existingUsers = await apiRequest(token, 'GET', `/users?filter[email][_eq]=${encodeURIComponent(manager.email)}`);

    if (existingUsers.data.length > 0) {
      console.log(`   ⏭️  ${manager.email} 已存在`);
    } else {
      await apiRequest(token, 'POST', '/users', {
        email: manager.email,
        password: 'manager',
        first_name: manager.name,
        role: storeManagerRoleId,
        branch_id: manager.branchId,
      });
      console.log(`   ✅ 已創建 ${manager.email} (${manager.branchName})`);
    }
  }

  console.log('\n🎉 設置完成！\n');
  console.log('📋 管理帳號列表：');
  console.log('┌────────────────────────────────┬──────────┬─────────────┐');
  console.log('│ Email                          │ 密碼     │ 分店        │');
  console.log('├────────────────────────────────┼──────────┼─────────────┤');
  for (const manager of branchManagers) {
    console.log(`│ ${manager.email.padEnd(30)} │ manager  │ ${manager.branchName.padEnd(11)} │`);
  }
  console.log('└────────────────────────────────┴──────────┴─────────────┘');
  console.log('\n💡 Admin 帳號: admin@gym.com / admin');
}

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

  // job_titles, membership_plans, leave_requests - 無分店限制
  return {};
}

main().catch(console.error);
