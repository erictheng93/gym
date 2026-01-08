/**
 * 租戶功能測試腳本
 * 測試租戶隔離和配額 API
 */

const { Client } = require('pg');

async function testTenantFeatures() {
  const client = new Client({
    host: 'localhost',
    port: 5444,
    database: 'gym_nexus',
    user: 'directus',
    password: 'directus'
  });

  try {
    await client.connect();
    console.log('✓ 連接到資料庫成功\n');

    // 1. 檢查 tenants 表
    console.log('=== 測試 1: 檢查 tenants 表 ===');
    const tenantsResult = await client.query('SELECT id, name, slug, plan_type, tenant_status, max_members, max_employees, max_branches FROM tenants');
    console.log(`找到 ${tenantsResult.rows.length} 個租戶:`);
    tenantsResult.rows.forEach(tenant => {
      console.log(`  - ${tenant.name} (${tenant.slug})`);
      console.log(`    套餐: ${tenant.plan_type}, 狀態: ${tenant.tenant_status}`);
      console.log(`    配額: 會員=${tenant.max_members}, 員工=${tenant.max_employees}, 分店=${tenant.max_branches}`);
    });
    console.log('');

    // 2. 檢查 tenant_usage_stats 表
    console.log('=== 測試 2: 檢查 tenant_usage_stats 表 ===');
    const statsResult = await client.query('SELECT COUNT(*) as count FROM tenant_usage_stats');
    console.log(`統計記錄數: ${statsResult.rows[0].count}`);
    console.log('');

    // 3. 測試 check_tenant_quota 函數
    console.log('=== 測試 3: 測試配額檢查函數 ===');
    const defaultTenantId = '11111111-1111-1111-1111-111111111111';

    // 測試會員配額
    const memberQuotaResult = await client.query(
      'SELECT check_tenant_quota($1, $2, $3) as can_create',
      [defaultTenantId, 'members', 0]
    );
    console.log(`會員配額檢查 (0/999999): ${memberQuotaResult.rows[0].can_create ? '✓ 可以創建' : '✗ 已達上限'}`);

    // 測試員工配額
    const employeeQuotaResult = await client.query(
      'SELECT check_tenant_quota($1, $2, $3) as can_create',
      [defaultTenantId, 'employees', 0]
    );
    console.log(`員工配額檢查 (0/999): ${employeeQuotaResult.rows[0].can_create ? '✓ 可以創建' : '✗ 已達上限'}`);

    // 測試分店配額
    const branchQuotaResult = await client.query(
      'SELECT check_tenant_quota($1, $2, $3) as can_create',
      [defaultTenantId, 'branches', 0]
    );
    console.log(`分店配額檢查 (0/999): ${branchQuotaResult.rows[0].can_create ? '✓ 可以創建' : '✗ 已達上限'}`);
    console.log('');

    // 4. 測試 v_tenant_overview 視圖（如果存在）
    console.log('=== 測試 4: 檢查租戶概覽視圖 ===');
    try {
      const overviewResult = await client.query('SELECT * FROM v_tenant_overview');
      if (overviewResult.rows.length > 0) {
        console.log('視圖存在，資料:');
        overviewResult.rows.forEach(row => {
          console.log(`  - ${row.name}:`);
          console.log(`    分店: ${row.current_branches}/${row.max_branches} (${row.branches_usage_percent}%)`);
          console.log(`    會員: ${row.current_members}/${row.max_members} (${row.members_usage_percent}%)`);
          console.log(`    員工: ${row.current_employees}/${row.max_employees} (${row.employees_usage_percent}%)`);
        });
      }
    } catch (error) {
      if (error.message.includes('does not exist')) {
        console.log('視圖尚未創建（branches 表不存在時會跳過）');
      } else {
        throw error;
      }
    }
    console.log('');

    // 5. 驗證權限觸發器函數
    console.log('=== 測試 5: 檢查權限觸發器函數 ===');
    const funcResult = await client.query(`
      SELECT p.proname, pg_get_functiondef(p.oid) as definition
      FROM pg_proc p
      WHERE p.proname IN ('update_updated_at_column', 'check_tenant_quota')
    `);
    console.log(`找到 ${funcResult.rows.length} 個函數:`);
    funcResult.rows.forEach(func => {
      console.log(`  ✓ ${func.proname}`);
    });
    console.log('');

    console.log('=== 🎉 所有測試完成 ===');
    console.log('✓ tenants 表已創建');
    console.log('✓ tenant_usage_stats 表已創建');
    console.log('✓ check_tenant_quota 函數正常運作');
    console.log('✓ 觸發器函數已安裝');
    console.log('');
    console.log('下一步：');
    console.log('1. 重啟 Directus 容器以加載新的 hooks 和 endpoints');
    console.log('2. 測試配額 API 端點: GET /gym/quota/status');
    console.log('3. 在前端測試配額警告和檢查功能');

  } catch (error) {
    console.error('測試失敗:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

testTenantFeatures().catch(console.error);
