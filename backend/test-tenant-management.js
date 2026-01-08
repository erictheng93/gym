/**
 * 租户管理功能测试脚本
 * 测试新创建的租户 CRUD API
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:8500';
const API_URL = `${BASE_URL}/gym/admin/tenants`;

// 测试数据
const testTenant = {
  name: '测试健身中心',
  slug: 'test-gym-center',
  email: 'test@example.com',
  phone: '02-1234-5678',
  plan_type: 'professional',
  billing_cycle: 'monthly',
  max_members: 500,
  max_employees: 30,
  max_branches: 3,
  trial_days: 14
};

let createdTenantId = null;

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// 测试 1: 获取租户列表
async function testGetTenants() {
  log('\n=== 测试 1: 获取租户列表 ===', 'blue');

  try {
    const response = await fetch(`${API_URL}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (response.ok && data.success) {
      log('✓ 获取租户列表成功', 'green');
      log(`  总租户数: ${data.stats.totalTenants}`);
      log(`  活跃租户: ${data.stats.activeTenants}`);
      log(`  试用租户: ${data.stats.trialTenants}`);
      return true;
    } else {
      log('✗ 获取租户列表失败', 'red');
      log(`  错误: ${data.message || '未知错误'}`, 'red');
      return false;
    }
  } catch (error) {
    log(`✗ 请求失败: ${error.message}`, 'red');
    return false;
  }
}

// 测试 2: 创建租户
async function testCreateTenant() {
  log('\n=== 测试 2: 创建租户 ===', 'blue');

  try {
    const response = await fetch(`${API_URL}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testTenant)
    });

    const data = await response.json();

    if (response.ok && data.success) {
      log('✓ 创建租户成功', 'green');
      log(`  租户ID: ${data.tenant_id}`);
      createdTenantId = data.tenant_id;
      return true;
    } else {
      log('✗ 创建租户失败', 'red');
      log(`  错误: ${data.message || '未知错误'}`, 'red');
      return false;
    }
  } catch (error) {
    log(`✗ 请求失败: ${error.message}`, 'red');
    return false;
  }
}

// 测试 3: 获取租户详情
async function testGetTenantDetails() {
  log('\n=== 测试 3: 获取租户详情 ===', 'blue');

  if (!createdTenantId) {
    log('✗ 未找到创建的租户ID，跳过测试', 'yellow');
    return false;
  }

  try {
    const response = await fetch(`${API_URL}/${createdTenantId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (response.ok && data.success) {
      log('✓ 获取租户详情成功', 'green');
      log(`  租户名称: ${data.tenant.name}`);
      log(`  租户状态: ${data.tenant.tenant_status}`);
      log(`  套餐类型: ${data.tenant.plan_type}`);
      return true;
    } else {
      log('✗ 获取租户详情失败', 'red');
      log(`  错误: ${data.message || '未知错误'}`, 'red');
      return false;
    }
  } catch (error) {
    log(`✗ 请求失败: ${error.message}`, 'red');
    return false;
  }
}

// 测试 4: 更新租户信息
async function testUpdateTenant() {
  log('\n=== 测试 4: 更新租户信息 ===', 'blue');

  if (!createdTenantId) {
    log('✗ 未找到创建的租户ID，跳过测试', 'yellow');
    return false;
  }

  const updateData = {
    name: '测试健身中心（已更新）',
    email: 'updated@example.com',
    phone: '02-8765-4321',
    max_members: 800
  };

  try {
    const response = await fetch(`${API_URL}/${createdTenantId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updateData)
    });

    const data = await response.json();

    if (response.ok && data.success) {
      log('✓ 更新租户信息成功', 'green');
      log(`  更新的字段: ${Object.keys(updateData).join(', ')}`);
      return true;
    } else {
      log('✗ 更新租户信息失败', 'red');
      log(`  错误: ${data.message || '未知错误'}`, 'red');
      return false;
    }
  } catch (error) {
    log(`✗ 请求失败: ${error.message}`, 'red');
    return false;
  }
}

// 测试 5: 切换租户状态
async function testChangeStatus() {
  log('\n=== 测试 5: 切换租户状态 ===', 'blue');

  if (!createdTenantId) {
    log('✗ 未找到创建的租户ID，跳过测试', 'yellow');
    return false;
  }

  const statuses = ['active', 'suspended', 'trial'];
  let allPassed = true;

  for (const status of statuses) {
    try {
      const response = await fetch(`${API_URL}/${createdTenantId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        log(`  ✓ 切换至 ${status} 成功`, 'green');
      } else {
        log(`  ✗ 切换至 ${status} 失败: ${data.message}`, 'red');
        allPassed = false;
      }
    } catch (error) {
      log(`  ✗ 切换至 ${status} 失败: ${error.message}`, 'red');
      allPassed = false;
    }
  }

  return allPassed;
}

// 运行所有测试
async function runAllTests() {
  log('\n╔════════════════════════════════════════╗', 'blue');
  log('║     租户管理功能 API 测试套件      ║', 'blue');
  log('╚════════════════════════════════════════╝', 'blue');

  const results = {
    passed: 0,
    failed: 0
  };

  // 运行测试
  const tests = [
    { name: '获取租户列表', fn: testGetTenants },
    { name: '创建租户', fn: testCreateTenant },
    { name: '获取租户详情', fn: testGetTenantDetails },
    { name: '更新租户信息', fn: testUpdateTenant },
    { name: '切换租户状态', fn: testChangeStatus }
  ];

  for (const test of tests) {
    const passed = await test.fn();
    if (passed) {
      results.passed++;
    } else {
      results.failed++;
    }
  }

  // 输出总结
  log('\n╔════════════════════════════════════════╗', 'blue');
  log('║           测试结果总结             ║', 'blue');
  log('╚════════════════════════════════════════╝', 'blue');
  log(`\n通过: ${results.passed}`, results.passed > 0 ? 'green' : 'reset');
  log(`失败: ${results.failed}`, results.failed > 0 ? 'red' : 'reset');
  log(`总计: ${results.passed + results.failed}\n`);

  if (results.failed === 0) {
    log('🎉 所有测试通过！', 'green');
  } else {
    log('⚠️  部分测试失败，请检查错误信息', 'yellow');
  }

  if (createdTenantId) {
    log(`\n提示: 测试租户ID为 ${createdTenantId}`, 'yellow');
    log('你可以手动清理测试数据', 'yellow');
  }
}

// 启动测试
runAllTests().catch(error => {
  log(`\n✗ 测试执行失败: ${error.message}`, 'red');
  process.exit(1);
});
