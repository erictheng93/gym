/**
 * 直接向 Directus metadata 表插入记录（跳过表创建）
 */

const DIRECTUS_URL = 'http://localhost:8055';
const ADMIN_EMAIL = 'admin@gym.com';
const ADMIN_PASSWORD = 'admin';

// 定义要导入的 collections
const collections = [
  { collection: 'branches', meta: { icon: 'store', note: '分店/場館管理', display_template: '{{name}}' } },
  { collection: 'job_titles', meta: { icon: 'badge', note: '職位與權限定義', display_template: '{{name}}' } },
  { collection: 'employees', meta: { icon: 'people', note: '員工資料', display_template: '{{full_name}}' } },
  { collection: 'members', meta: { icon: 'person', note: '會員資料', display_template: '{{member_code}} - {{full_name}}' } },
  { collection: 'membership_plans', meta: { icon: 'card_membership', note: '會籍/產品方案', display_template: '{{name}}' } },
  { collection: 'contracts', meta: { icon: 'description', note: '電子合約', display_template: '{{contract_no}}' } },
  { collection: 'contract_logs', meta: { icon: 'history', note: '合約異動紀錄', display_template: '{{log_type}}' } },
  { collection: 'payments', meta: { icon: 'payments', note: '收付款紀錄', display_template: '{{amount}} - {{payment_method}}' } },
  { collection: 'attendances', meta: { icon: 'schedule', note: '員工打卡紀錄' } },
  { collection: 'leave_requests', meta: { icon: 'event_busy', note: '休假申請' } },
  { collection: 'leave_balances', meta: { icon: 'event_available', note: '休假額度' } },
  { collection: 'shift_schedules', meta: { icon: 'calendar_today', note: '班表' } },
  { collection: 'employee_shifts', meta: { icon: 'access_time', note: '員工排班' } },
  { collection: 'member_checkins', meta: { icon: 'how_to_reg', note: '會員簽到紀錄' } },
  { collection: 'check_ins', meta: { icon: 'login', note: '進場紀錄' } },
  { collection: 'leave_approval_logs', meta: { icon: 'approval', note: '休假審核紀錄' } }
];

async function importCollections() {
  // 登入
  console.log('登入 Directus...');
  const loginRes = await fetch(`${DIRECTUS_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  });

  if (!loginRes.ok) {
    console.error('登入失敗');
    return;
  }

  const loginData = await loginRes.json();
  const token = loginData.data.access_token;
  console.log('✓ 登入成功');

  // 逐個創建 collection metadata
  for (const col of collections) {
    console.log(`創建 collection: ${col.collection}...`);

    try {
      const res = await fetch(`${DIRECTUS_URL}/collections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(col)
      });

      if (!res.ok) {
        const error = await res.json();
        // 如果已存在則跳過
        if (error.errors?.[0]?.extensions?.code === 'RECORD_NOT_UNIQUE') {
          console.log(`  ⚠ ${col.collection} 已存在，跳過`);
        } else {
          console.error(`  ✗ 失敗: ${JSON.stringify(error)}`);
        }
      } else {
        console.log(`  ✓ 成功創建 ${col.collection}`);
      }
    } catch (err) {
      console.error(`  ✗ 錯誤: ${err.message}`);
    }
  }

  console.log('\n開始同步 fields...');

  // 同步 fields（讓 Directus 自動發現表中的欄位）
  for (const col of collections) {
    console.log(`同步 fields: ${col.collection}...`);

    try {
      // 使用 /utils/schema/snapshot 來觸發 field 同步
      const res = await fetch(`${DIRECTUS_URL}/collections/${col.collection}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          meta: col.meta
        })
      });

      if (res.ok) {
        console.log(`  ✓ ${col.collection} fields 同步成功`);
      } else {
        const error = await res.json();
        console.error(`  ✗ ${col.collection} 同步失敗:`, error.errors?.[0]?.message);
      }
    } catch (err) {
      console.error(`  ✗ ${col.collection} 錯誤:`, err.message);
    }
  }

  console.log('\n✅ Metadata 導入完成！請刷新 Directus 界面。');
}

importCollections().catch(console.error);
